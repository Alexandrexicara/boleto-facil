const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const { registrarLeitura } = require('../config/database');
const { avaliarAutenticidade, validarCNPJ } = require('../services/antifraude');
const { calcularAtualizacao } = require('../services/calculo-boleto');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const DAY = 86400000;
const LEGACY_BASE = Date.UTC(1997, 9, 7);
const RESET_BASE = Date.UTC(2022, 4, 29);
const digits = value => String(value || '').replace(/\D/g, '');

function modulo10(value) {
  let sum = 0, weight = 2;
  for (let i = value.length - 1; i >= 0; i--) {
    const n = Number(value[i]) * weight;
    sum += Math.floor(n / 10) + n % 10;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - sum % 10) % 10;
}
function modulo11Boleto(value) {
  let sum = 0, weight = 2;
  for (let i = value.length - 1; i >= 0; i--) {
    sum += Number(value[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return [0, 10, 11].includes(dv) ? 1 : dv;
}
function validarCodigoBarras(codigo) {
  if (!/^\d{44}$/.test(codigo) || codigo[0] === '8') return false;
  return Number(codigo[4]) === modulo11Boleto(codigo.slice(0, 4) + codigo.slice(5));
}
function normalizarCodigoBarras(value) {
  const code = digits(value);
  if (code.length === 44) return code;
  if (code.length === 47) {
    const fields = [[code.slice(0, 9), code[9]], [code.slice(10, 20), code[20]], [code.slice(21, 31), code[31]]];
    if (fields.some(([field, dv]) => Number(dv) !== modulo10(field))) return null;
    return code.slice(0, 4) + code[32] + code.slice(33, 47) + code.slice(4, 9) + code.slice(10, 20) + code.slice(21, 31);
  }
  return null;
}
function dataVencimentoDoFator(fator) {
  if (!Number.isInteger(fator) || fator <= 0 || fator > 9999) return null;
  const base = fator >= 1000 ? RESET_BASE : LEGACY_BASE;
  return new Date(base + fator * DAY);
}
function isoDate(date) { return date.toISOString().slice(0, 10); }
function normalizarData(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? match[3] + '-' + match[2] + '-' + match[1] : null;
}
function diasEntreDatas(inicio, fim) {
  const a = inicio.split('-').map(Number), b = fim.split('-').map(Number);
  return Math.max(0, Math.floor((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY));
}
function calcularValorFinal(valorOriginal, dataVenc) {
  const dias = dataVenc ? diasEntreDatas(dataVenc, isoDate(new Date())) : 0;
  const keys = ['BOLETO_JUROS_MENSAL', 'BOLETO_MULTA_PERCENTUAL', 'BOLETO_TAXA_SERVICO'];
  const configured = keys.every(k => Object.prototype.hasOwnProperty.call(process.env, k) && process.env[k] !== '');
  if (valorOriginal === null || !Number.isFinite(Number(valorOriginal))) {
    return { dias, juros: null, multa: null, taxa: null, total: null, calculoEstimado: false, aviso: 'O valor não foi identificado com segurança.' };
  }
  if (!configured) {
    return { dias, juros: null, multa: null, taxa: null, total: null, calculoEstimado: false,
      aviso: 'Valor nominal identificado. Juros, multa e total atualizado dependem das regras oficiais do beneficiário; não foram presumidos.' };
  }
  const jm = Number(process.env.BOLETO_JUROS_MENSAL), mp = Number(process.env.BOLETO_MULTA_PERCENTUAL), taxa = Number(process.env.BOLETO_TAXA_SERVICO);
  if (![jm, mp, taxa].every(Number.isFinite)) {
    return { dias, juros: null, multa: null, taxa: null, total: null, calculoEstimado: false, aviso: 'As regras de encargos configuradas são inválidas.' };
  }
  const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const juros = dias ? Number(valorOriginal) * (jm / 100) * (dias / 30) : 0;
  const multa = dias ? Number(valorOriginal) * (mp / 100) : 0;
  return { dias, juros: money(juros), multa: money(multa), taxa: money(taxa), total: money(Number(valorOriginal) + juros + multa + taxa),
    calculoEstimado: true, aviso: 'Cálculo estimado com parâmetros configurados. Confirme o valor atualizado com o beneficiário antes do pagamento.' };
}
function extrairDadosDoCodigoBarras(value) {
  const code = normalizarCodigoBarras(value);
  if (!code || code.length !== 44 || !validarCodigoBarras(code)) return null;
  const cents = Number(code.slice(9, 19)), factor = Number(code.slice(5, 9));
  const due = dataVencimentoDoFator(factor);
  return { codigo: code, tipo: 'bancario', banco: code.slice(0, 3), moeda: code[3], valor: cents / 100,
    valorCentavos: cents, fatorVencimento: factor, vencimento: due, vencimentoFormatado: due ? isoDate(due) : null };
}
function extrairCamposOCR(texto) {
  const source = String(texto || '');
  const cpf = source.match(/(?:CPF|CNPJ)(?:\s*\/\s*CPF)?\s*[:.]?\s*([\d.\/-]{11,18})/i);
  const valor = source.match(/(?:valor\s*(?:do\s*)?documento|valor\s*cobrado|valor\s*a\s*pagar|valor\s*nominal|valor)\s*[:R$\s]*([\d.]+,\d{2})/i);
  const venc = source.match(/(?:vencimento|pagar\s*at[eé])\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  const beneficiario = source.match(/(?:benefici[aá]rio|cedente|favorecido)\s*[:.]?\s*([^\n]{3,120})/i);
  const amount = valor ? Number(valor[1].replace(/\./g, '').replace(',', '.')) : null;
  return { cpfCnpjBeneficiario: cpf ? cpf[1].replace(/\s/g, '') : null,
    valorImpresso: Number.isFinite(amount) ? amount : null,
    vencimentoImpresso: venc ? normalizarData(venc[1]) : null,
    beneficiario: beneficiario ? beneficiario[1].trim().slice(0, 120) : null };
}
function extrairCandidatos(texto) {
  const found = new Set(), source = String(texto || '');
  const matches = source.match(/(?:\d[\s.-]?){43,47}\d/g) || [];
  matches.forEach(v => { const code = digits(v); if ([44, 47, 48].includes(code.length)) found.add(code); });
  const compact = source.match(/\d{44}|\d{47}|\d{48}/g) || [];
  compact.forEach(v => found.add(v));
  return Array.from(found);
}
function textoDaRespostaNvidia(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item.text === 'string') return item.text;
    if (item && item.type === 'json') return JSON.stringify(item.json || item);
    return '';
  }).filter(Boolean).join('\n');
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.json && typeof content.json === 'object') return JSON.stringify(content.json);
    return JSON.stringify(content);
  }
  return '';
}
function extrairJson(text) {
  if (text && typeof text === 'object' && !Array.isArray(text)) return text;
  const source = textoDaRespostaNvidia(text);
  const cleaned = source.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(candidate); } catch (_) {}
  }
  return null;
}
function classificarDocumento(dadosIA, texto) {
  const informado = String(dadosIA && dadosIA.tipo_documento || '').toLowerCase();
  if (informado && !/não identificado|nao identificado|unknown|outro/.test(informado)) return informado;
  const t = String(texto || '').toLowerCase();
  if (/copasa|conta\s+de\s+água|conta\s+de\s+agua|consumo\s+de\s+água|consumo\s+de\s+agua|esgoto|energia elétrica|energia eletrica|distribuição de gás|distribuicao de gas/.test(t)) return 'conta_consumo';
  if (/arrecadação|arrecadacao|tributo|concessionária|concessionaria|convênio|convenio/.test(t)) return 'arrecadacao';
  if (/boleto|linha digitável|linha digitavel|beneficiário|beneficiario|cedente/.test(t)) return 'boleto_bancario';
  return informado || 'não identificado';
}
async function interpretarComNvidia(file, modoDiagnostico = false) {
  const inicio = Date.now();
  const key = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || process.env.NGC_API_KEY;
  if (!key) { if (modoDiagnostico) throw new Error('NVIDIA_API_KEY não está configurada no Render.'); return null; }
  if (!file) { if (modoDiagnostico) throw new Error('Nenhuma imagem foi recebida para o teste.'); return null; }
  const model = process.env.NVIDIA_VISION_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';
  const endpoint = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
  const mime = file.mimetype && file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
  const image = 'data:' + mime + ';base64,' + file.buffer.toString('base64');
  const prompt = [
    'TAREFA: leia os identificadores do pagamento E os dados de identificação do beneficiário impressos no documento.',
    'Ignore propaganda, avisos e textos sem relação com a cobrança. Capture cuidadosamente o nome/razão social do beneficiário, CNPJ/CPF do beneficiário, nome e documento do beneficiário final (se houver), nome do banco emissor e dados financeiros. Não confunda dados do pagador com os do beneficiário.',
    'Procure a linha digitável e o código de barras (normalmente na faixa inferior do boleto), o QR Code Pix e os campos próximos a VALOR, VALOR DO DOCUMENTO, VENCIMENTO, MULTA, JUROS e DESCONTO.',
    'Retorne SOMENTE JSON válido, sem Markdown, sem transcrição do documento e sem explicações.',
    'Use exatamente estas chaves: linha_digitavel, codigo_barras, qr_code_pix, banco_emissor, beneficiario_nome, beneficiario_cnpj_cpf, beneficiario_final_nome, beneficiario_final_cnpj_cpf, pagador_nome, pagador_cnpj_cpf, valor_original, vencimento, multa_percentual, multa_valor, juros_percentual, juros_valor, juros_regra, desconto_valor, desconto_data_limite.',
    'Todos os campos devem ser null quando ausentes, ilegíveis ou não confirmados. Não deduza taxas, percentuais ou regras. Para CNPJ/CPF, retorne somente os dígitos que estiverem legíveis; não complete números.',
    'Datas em YYYY-MM-DD. Valores em número decimal sem símbolo de moeda. Percentuais em número decimal (ex.: 2 para 2%).',
    'Nunca invente nem complete dígitos. Só informe código de barras ou linha digitável quando todos os dígitos estiverem legíveis e na ordem correta.',
    'Para qr_code_pix, informe o conteúdo Pix copia e cola somente se estiver efetivamente codificado e legível; caso contrário null.',
    'Não calcule juros, multa, desconto nem valor atualizado. Esta etapa é exclusivamente de identificação dos dados impressos.'
  ].join(' ');
  const maxTokensSolicitados = Math.min(131072, Math.max(1024, Number.parseInt(process.env.NVIDIA_MAX_OUTPUT_TOKENS || '16384', 10) || 16384));
  const requestConfig = {
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    timeout: 90000,
    maxBodyLength: 20 * 1024 * 1024
  };
  const payload = {
    model,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: prompt }
    ] }],
    temperature: 0,
    max_tokens: maxTokensSolicitados,
    reasoning_effort: 'none',
    stream: false
  };
  let response = await axios.post(endpoint, payload, requestConfig);
  let choice = response.data && response.data.choices && response.data.choices[0];
  let message = choice && choice.message;
  let content = message && message.content;
  let parsed = extrairJson(content) || extrairJson(response.data && response.data.output_text);
  let tentativas = 1;
  let maxTokensFinal = maxTokensSolicitados;

  // Se a NVIDIA cortar a geração por limite, repete uma única vez com orçamento maior
  // e sem raciocínio interno extenso: a tarefa exige leitura objetiva e JSON curto.
  if (choice && choice.finish_reason === 'length') {
    tentativas = 2;
    maxTokensFinal = Math.min(131072, Math.max(maxTokensSolicitados * 2, 32768));
    response = await axios.post(endpoint, {
      ...payload,
      max_tokens: maxTokensFinal,
      reasoning_effort: 'none'
    }, requestConfig);
    choice = response.data && response.data.choices && response.data.choices[0];
    message = choice && choice.message;
    content = message && message.content;
    parsed = extrairJson(content) || extrairJson(response.data && response.data.output_text);
  }
  const usage = response.data && response.data.usage || null;
  const diagnosticoBase = {
    modelo: model,
    httpStatus: response.status,
    finishReason: choice && choice.finish_reason || null,
    respostaJSONValida: Boolean(parsed),
    duracaoMs: Date.now() - inicio,
    maxTokensSolicitados: maxTokensSolicitados,
    maxTokensFinal: maxTokensFinal,
    tentativas,
    usage,
    promptTokens: usage ? (usage.prompt_tokens ?? usage.input_tokens ?? null) : null,
    completionTokens: usage ? (usage.completion_tokens ?? usage.output_tokens ?? null) : null,
    totalTokens: usage ? (usage.total_tokens ?? null) : null
  };
  if (!parsed) {
    const preview = textoDaRespostaNvidia(content).slice(0, 500).replace(/\s+/g, ' ');
    const finish = choice && choice.finish_reason ? String(choice.finish_reason) : 'sem finish_reason';
    console.error('Resposta NVIDIA sem JSON válido:', JSON.stringify({ model, finish_reason: finish, content_type: typeof content, preview }));
    const error = new Error('A NVIDIA respondeu, mas o conteúdo não veio em JSON válido (modelo: ' + model + ', finalização: ' + finish + ').');
    error.nvidiaDiagnostics = { ...diagnosticoBase, finishReason: finish, respostaJSONValida: false, preview };
    throw error;
  }
  return { resultado: parsed, diagnostico: { provedor: 'NVIDIA NIM', ...diagnosticoBase } };
}

router.post('/diagnostico-nvidia', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ sucesso: false, etapa: 'recepcao_imagem', erro: 'Envie uma imagem no campo foto.' });
  try {
    const teste = await interpretarComNvidia(req.file, true);
    return res.json({ sucesso: true, fallbackExecutado: false, gravacaoNeon: false, diagnostico: teste.diagnostico, resultado: teste.resultado });
  } catch (error) {
    const providerStatus = error.response && error.response.status || null;
    const providerData = error.response && error.response.data;
    const providerMessage = providerData && providerData.error && (providerData.error.message || providerData.error) || providerData && providerData.message || null;
    const diagnostico = error.nvidiaDiagnostics || { provedor: 'NVIDIA NIM', httpStatus: providerStatus, codigoErro: error.code || null, duracaoMs: null };
    console.error('Diagnóstico isolado NVIDIA falhou:', JSON.stringify({ ...diagnostico, erro: error.message }));
    return res.status(502).json({ sucesso: false, fallbackExecutado: false, gravacaoNeon: false, diagnostico, erro: error.message, erroProvedor: typeof providerMessage === 'string' ? providerMessage.slice(0, 500) : null });
  }
});

function valorNumerico(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
function textoSeguro(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 4000) : null;
}

router.post('/ler', upload.single('foto'), async (req, res) => {
  try {
    const received = digits(req.body && req.body.codigoBarras);
    const localOCR = String((req.body && req.body.textoOCR) || '').slice(0, 20000);
    const file = req.file || null;
    let dadosIA = null, erroIA = null, diagnosticoIA = null;
    if (file) {
      try {
        const retornoIA = await interpretarComNvidia(file);
        dadosIA = retornoIA.resultado;
        diagnosticoIA = retornoIA.diagnostico;
      } catch (error) {
        diagnosticoIA = error.nvidiaDiagnostics || null;
        erroIA = error.response ? 'NVIDIA retornou HTTP ' + error.response.status : error.message;
        console.error('Falha na leitura visual NVIDIA:', erroIA);
      }
    }
    // A extração não usa OCR de página inteira: somente os campos financeiros retornados pela IA
    // e o código lido diretamente pelo leitor de barras/QR do navegador.
    const textoOCR = '';
    const camposOCR = { cpfCnpjBeneficiario: null, valorImpresso: null, vencimentoImpresso: null, beneficiario: null };
    const beneficiario = dadosIA ? textoSeguro(dadosIA.beneficiario_nome) : null;
    const cnpjBeneficiario = dadosIA ? digits(dadosIA.beneficiario_cnpj_cpf) : '';
    const beneficiarioFinal = dadosIA ? textoSeguro(dadosIA.beneficiario_final_nome) : null;
    const cnpjBeneficiarioFinal = dadosIA ? digits(dadosIA.beneficiario_final_cnpj_cpf) : '';
    const bancoEmissor = dadosIA ? textoSeguro(dadosIA.banco_emissor) : null;
    const pagador = dadosIA ? textoSeguro(dadosIA.pagador_nome) : null;
    const documentoPagador = dadosIA ? digits(dadosIA.pagador_cnpj_cpf) : '';
    const aiCode = dadosIA ? digits(dadosIA.linha_digitavel || dadosIA.codigo_barras || '') : '';
    const candidates = [received, aiCode].filter(code => [44, 47, 48].includes(code.length));
    const qrCodePix = textoSeguro((dadosIA && dadosIA.qr_code_pix) || req.body && req.body.qrCodePix);
    let codigoIdentificado = candidates[0] || '', codigoValidado = false, dadosCodigo = null;
    let tipoBoleto = classificarDocumento(dadosIA, textoOCR);
    let banco = dadosIA ? textoSeguro(dadosIA.banco) : null;
    for (const candidate of candidates) {
      if (candidate.length === 48) { codigoIdentificado = candidate; tipoBoleto = 'arrecadacao'; break; }
      const normalized = normalizarCodigoBarras(candidate);
      if (normalized && validarCodigoBarras(normalized)) {
        codigoIdentificado = normalized; codigoValidado = true;
        dadosCodigo = extrairDadosDoCodigoBarras(normalized); tipoBoleto = 'bancario';
        banco = dadosCodigo ? dadosCodigo.banco : banco; break;
      }
    }
    if (codigoIdentificado.length === 48) tipoBoleto = 'arrecadacao';
    const valorIA = dadosIA ? valorNumerico(dadosIA.valor_original) : null;
    const valorOriginal = dadosCodigo ? dadosCodigo.valor : valorIA;
    const vencimentoIA = dadosIA ? normalizarData(dadosIA.vencimento) : null;
    const dataVencimento = dadosCodigo && dadosCodigo.vencimentoFormatado ? dadosCodigo.vencimentoFormatado : vencimentoIA;
    const multaPercentual = dadosIA ? valorNumerico(dadosIA.multa_percentual) : null;
    const multaValor = dadosIA ? valorNumerico(dadosIA.multa_valor) : null;
    const jurosPercentual = dadosIA ? valorNumerico(dadosIA.juros_percentual) : null;
    const jurosValor = dadosIA ? valorNumerico(dadosIA.juros_valor) : null;
    const jurosRegra = dadosIA ? textoSeguro(dadosIA.juros_regra) : null;
    const descontoValor = dadosIA ? valorNumerico(dadosIA.desconto_valor) : null;
    const descontoDataLimite = dadosIA ? normalizarData(dadosIA.desconto_data_limite) : null;
    // Recalcula apenas com regras explícitas identificadas no próprio boleto.
    // Se a periodicidade dos juros ou a multa não estiver clara, não inventa um total.
    const calculo = calcularAtualizacao({
      valorOriginal,
      dataVencimento: dataVencimento,
      multaPercentual,
      multaValor,
      jurosPercentual,
      jurosValor,
      jurosRegra,
      descontoValor,
      descontoDataLimite
    });
    if (!file && !textoOCR && !codigoIdentificado) {
      return res.status(400).json({ erro: 'Envie a foto do boleto ou informe a linha digitável.' });
    }
    const verificacaoAutenticidade = avaliarAutenticidade({
      beneficiario, cnpjBeneficiario, beneficiarioFinal, cnpjBeneficiarioFinal,
      codigoValidado, qrCodePix, fonteExternaConsultada: false
    });
    const statusLeitura = codigoValidado || qrCodePix || valorOriginal !== null || dataVencimento || beneficiario || cnpjBeneficiario ? 'dados_identificados' : 'leitura_parcial';
    const motorLeitura = dadosIA ? 'NVIDIA Vision + validação local' : 'OCR local / leitura de código';
    const idLeitura = await registrarLeitura({
      tipo: tipoBoleto, status: statusLeitura, origem: file ? 'imagem' : 'camera_ou_codigo',
      codigoValidado, motor: motorLeitura, erro: erroIA
    });
    return res.json({
      sucesso: true, idLeitura, statusLeitura,
      motorLeitura,
      diagnosticoIA,
      tipoBoleto, valorOriginal, dataVencimento,
      beneficiario, cnpjBeneficiario: cnpjBeneficiario || null,
      cnpjBeneficiarioValido: cnpjBeneficiario ? validarCNPJ(cnpjBeneficiario) : null,
      beneficiarioFinal, cnpjBeneficiarioFinal: cnpjBeneficiarioFinal || null,
      cnpjBeneficiarioFinalValido: cnpjBeneficiarioFinal ? validarCNPJ(cnpjBeneficiarioFinal) : null,
      bancoEmissor, pagador, documentoPagador: documentoPagador || null,
      verificacaoAutenticidade,
      multaPercentual, multaValor, jurosPercentual, jurosValor, jurosRegra,
      descontoValor, descontoDataLimite, qrCodePix,
      dataReferenciaCalculo: calculo.dataReferencia,
      statusVencimento: calculo.statusVencimento,
      diasVencidos: calculo.diasVencidos,
      juros: calculo.juros,
      multa: calculo.multa,
      descontoAplicado: calculo.desconto,
      taxaServico: null,
      valorFinal: calculo.valorFinal,
      calculoEstimado: calculo.calculoEstimado,
      calculoCompleto: calculo.calculoCompleto,
      avisoCalculo: calculo.aviso,
      situacaoPagamento: { status: 'nao_consultado', confirmado: false, fonte: null,
        aviso: 'A leitura e o cálculo local não consultam o registro bancário. O pagamento, a baixa e a liquidação ainda precisam ser confirmados por uma instituição ou provedor autorizado.' },
      situacaoRegistro: { status: 'nao_consultado', confirmado: false, fonte: null },
      pagabilidade: { status: 'nao_confirmada', confirmado: false,
        aviso: 'Somente o banco pagador ou uma consulta oficial de registro pode confirmar se este boleto está apto a pagamento.' },
      codigoRecebido: codigoIdentificado || null, codigoValidado, codigoBanco: dadosCodigo ? dadosCodigo.banco : null, pagamentoHabilitado: false,
      textoReconhecido: null, textoCompleto: null,
      camposIA: dadosIA ? {
        linha_digitavel: dadosIA.linha_digitavel || null,
        codigo_barras: dadosIA.codigo_barras || null,
        qr_code_pix: dadosIA.qr_code_pix || null,
        banco_emissor: dadosIA.banco_emissor || null,
        beneficiario_nome: dadosIA.beneficiario_nome || null,
        beneficiario_cnpj_cpf: dadosIA.beneficiario_cnpj_cpf || null,
        beneficiario_final_nome: dadosIA.beneficiario_final_nome || null,
        beneficiario_final_cnpj_cpf: dadosIA.beneficiario_final_cnpj_cpf || null,
        pagador_nome: dadosIA.pagador_nome || null,
        pagador_cnpj_cpf: dadosIA.pagador_cnpj_cpf || null,
        valor_original: dadosIA.valor_original ?? null,
        vencimento: dadosIA.vencimento || null,
        multa_percentual: dadosIA.multa_percentual ?? null,
        multa_valor: dadosIA.multa_valor ?? null,
        juros_percentual: dadosIA.juros_percentual ?? null,
        juros_valor: dadosIA.juros_valor ?? null,
        juros_regra: dadosIA.juros_regra || null,
        desconto_valor: dadosIA.desconto_valor ?? null,
        desconto_data_limite: dadosIA.desconto_data_limite || null
      } : null,
      confianca: null,
      avisoIA: erroIA ? 'A leitura visual NVIDIA não respondeu. ' + erroIA : null
    });
  } catch (error) {
    console.error('Erro ao ler boleto:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erro: 'A imagem ultrapassa o limite de 12 MB. Envie uma foto menor.' });
    }
    return res.status(500).json({ erro: 'Erro interno ao processar a imagem do boleto.' });
  }
});
router.extrairDadosDoCodigoBarras = extrairDadosDoCodigoBarras;
router.calcularValorFinal = calcularValorFinal;
router.normalizarCodigoBarras = normalizarCodigoBarras;
router.validarCodigoBarras = validarCodigoBarras;
router.modulo10 = modulo10;
router.modulo11Boleto = modulo11Boleto;
module.exports = router;
