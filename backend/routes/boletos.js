const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const { registrarLeitura } = require('../config/database');
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
async function interpretarComNvidia(file) {
  const key = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || process.env.NGC_API_KEY;
  if (!key || !file) return null;
  const model = process.env.NVIDIA_VISION_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';
  const endpoint = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
  const mime = file.mimetype && file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
  const image = 'data:' + mime + ';base64,' + file.buffer.toString('base64');
  const prompt = [
    'Analise a imagem de um boleto ou documento de cobrança brasileiro.',
    'Leia visualmente o documento inteiro. Não invente nem complete dígitos ilegíveis.',
    'Retorne SOMENTE JSON válido, sem Markdown, com as chaves: tipo_documento, texto_completo, linha_digitavel, codigo_barras, banco, beneficiario, cpf_cnpj_beneficiario, pagador, cpf_cnpj_pagador, valor, vencimento, data_emissao, nosso_numero, numero_documento, agencia_codigo_beneficiario, confianca, alertas.',
    'Use null quando um campo não estiver legível. Datas em YYYY-MM-DD. Valor como número decimal.',
    'Em confianca, informe valores de 0 a 1 para os campos que conseguiu ler. Em alertas, liste trechos duvidosos.',
    'Diferencie valor nominal, valor cobrado e encargos. Não calcule juros, multa ou valor atualizado.',
    'Copie a linha digitável e o código de barras somente quando os dígitos estiverem realmente visíveis.'
  ].join(' ');
  const response = await axios.post(endpoint, {
    model,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: prompt }
    ] }],
    temperature: 0,
    max_tokens: 4096,
    stream: false
  }, {
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    timeout: 90000,
    maxBodyLength: 20 * 1024 * 1024
  });
  const choice = response.data && response.data.choices && response.data.choices[0];
  const message = choice && choice.message;
  const content = message && message.content;
  const parsed = extrairJson(content) || extrairJson(response.data && response.data.output_text);
  if (!parsed) {
    const preview = textoDaRespostaNvidia(content).slice(0, 500).replace(/\s+/g, ' ');
    const finish = choice && choice.finish_reason ? String(choice.finish_reason) : 'sem finish_reason';
    console.error('Resposta NVIDIA sem JSON válido:', JSON.stringify({ model, finish_reason: finish, content_type: typeof content, preview }));
    throw new Error('A NVIDIA respondeu, mas o conteúdo não veio em JSON válido (modelo: ' + model + ', finalização: ' + finish + ').');
  }
  return parsed;
}
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
    let dadosIA = null, erroIA = null;
    if (file) {
      try { dadosIA = await interpretarComNvidia(file); }
      catch (error) {
        erroIA = error.response ? 'NVIDIA retornou HTTP ' + error.response.status : error.message;
        console.error('Falha na leitura visual NVIDIA:', erroIA);
      }
    }
    const textoIA = dadosIA ? String(dadosIA.texto_completo || dadosIA.texto_reconhecido || '').slice(0, 20000) : '';
    const textoOCR = [textoIA, localOCR].filter(Boolean).join('\n').slice(0, 20000);
    const camposOCR = extrairCamposOCR(textoOCR);
    const aiCode = dadosIA ? digits(dadosIA.linha_digitavel || dadosIA.codigo_barras || '') : '';
    const candidates = [received, aiCode].concat(extrairCandidatos(textoOCR)).filter(code => [44, 47, 48].includes(code.length));
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
    const beneficiario = textoSeguro((dadosIA && dadosIA.beneficiario) || camposOCR.beneficiario);
    const cpfCnpj = textoSeguro((dadosIA && (dadosIA.cpf_cnpj_beneficiario || dadosIA.cpfCnpjBeneficiario)) || camposOCR.cpfCnpjBeneficiario);
    const valorIA = dadosIA ? valorNumerico(dadosIA.valor) : null;
    const valorOriginal = dadosCodigo ? dadosCodigo.valor : (valorIA !== null ? valorIA : camposOCR.valorImpresso);
    const vencimentoIA = dadosIA ? normalizarData(dadosIA.vencimento) : null;
    const dataVencimento = dadosCodigo && dadosCodigo.vencimentoFormatado ? dadosCodigo.vencimentoFormatado : (vencimentoIA || camposOCR.vencimentoImpresso);
    const calculo = calcularValorFinal(valorOriginal, dataVencimento);
    const pagador = dadosIA ? textoSeguro(dadosIA.pagador) : null;
    const cpfCnpjPagador = dadosIA ? textoSeguro(dadosIA.cpf_cnpj_pagador || dadosIA.cpfCnpjPagador) : null;
    const dataEmissao = dadosIA ? normalizarData(dadosIA.data_emissao) : null;
    const nossoNumero = dadosIA ? textoSeguro(dadosIA.nosso_numero) : null;
    const numeroDocumento = dadosIA ? textoSeguro(dadosIA.numero_documento) : null;
    const agenciaCodigoBeneficiario = dadosIA ? textoSeguro(dadosIA.agencia_codigo_beneficiario) : null;
    const alertas = dadosIA && Array.isArray(dadosIA.alertas) ? dadosIA.alertas.map(v => String(v)).slice(0, 20) : [];
    if (!file && !textoOCR && !codigoIdentificado) {
      return res.status(400).json({ erro: 'Envie a foto do boleto ou informe a linha digitável.' });
    }
    const statusLeitura = codigoValidado || beneficiario || valorOriginal !== null || dataVencimento ? 'dados_identificados' : 'leitura_parcial';
    const motorLeitura = dadosIA ? 'NVIDIA Vision + validação local' : 'OCR local / leitura de código';
    const idLeitura = await registrarLeitura({
      tipo: tipoBoleto, status: statusLeitura, origem: file ? 'imagem' : 'camera_ou_codigo',
      codigoValidado, motor: motorLeitura, erro: erroIA
    });
    return res.json({
      sucesso: true, idLeitura, statusLeitura,
      motorLeitura,
      tipoBoleto, banco, beneficiario, cpfCnpjBeneficiario: cpfCnpj, pagador, cpfCnpjPagador,
      valorOriginal, valorLidoOCR: camposOCR.valorImpresso, dataVencimento,
      vencimentoLidoOCR: camposOCR.vencimentoImpresso, dataEmissao, nossoNumero,
      numeroDocumento, agenciaCodigoBeneficiario, diasVencidos: calculo.dias,
      juros: calculo.juros, multa: calculo.multa, taxaServico: calculo.taxa,
      valorFinal: calculo.total, calculoEstimado: calculo.calculoEstimado, avisoCalculo: calculo.aviso,
      codigoRecebido: codigoIdentificado || null, codigoValidado, pagamentoHabilitado: false,
      textoReconhecido: textoOCR || null, textoCompleto: textoOCR || null,
      camposIA: dadosIA, confianca: dadosIA ? (dadosIA.confianca || null) : null,
      alertas, avisoIA: erroIA ? 'A leitura NVIDIA não respondeu; foram usados os dados do OCR local. ' + erroIA : null
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
