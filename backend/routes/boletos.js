const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
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
    return code.slice(0, 4) + code[32] + code.slice(33, 47) +
      code.slice(4, 9) + code.slice(10, 20) + code.slice(21, 31);
  }
  // 48 dígitos é arrecadação/convênio, não linha digitável bancária.
  return null;
}

function dataVencimentoDoFator(fator) {
  if (!Number.isInteger(fator) || fator <= 0 || fator > 9999) return null;
  // Fator reiniciado em 22/02/2025: fator 1000 corresponde a essa data.
  const base = fator >= 1000 ? RESET_BASE : LEGACY_BASE;
  return new Date(base + fator * DAY);
}

function isoDate(date) { return date.toISOString().slice(0, 10); }

function diasEntreDatas(inicio, fim) {
  const [y1, m1, d1] = inicio.split('-').map(Number);
  const [y2, m2, d2] = fim.split('-').map(Number);
  return Math.max(0, Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY));
}

function calcularValorFinal(valorOriginal, dataVenc, regras = {}) {
  const hoje = regras.dataReferencia || isoDate(new Date());
  const jurosMensal = Number(regras.jurosMensal ?? process.env.BOLETO_JUROS_MENSAL ?? 0);
  const multaPercentual = Number(regras.multaPercentual ?? process.env.BOLETO_MULTA_PERCENTUAL ?? 0);
  const taxaServico = Number(regras.taxaServico ?? process.env.BOLETO_TAXA_SERVICO ?? 0);
  if (!Number.isFinite(valorOriginal) || valorOriginal < 0 ||
      ![jurosMensal, multaPercentual, taxaServico].every(Number.isFinite)) {
    throw new Error('Valor ou regras de cobrança inválidos.');
  }
  const dias = dataVenc ? diasEntreDatas(dataVenc, hoje) : 0;
  const juros = dias ? valorOriginal * (jurosMensal / 100) * (dias / 30) : 0;
  const multa = dias ? valorOriginal * (multaPercentual / 100) : 0;
  const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
  return {
    dias, juros: money(juros), multa: money(multa), taxa: money(taxaServico),
    total: money(valorOriginal + juros + multa + taxaServico),
    calculoEstimado: true,
    aviso: 'Encargos exatos dependem das instruções do beneficiário. Consulte o emissor antes de cobrar ou pagar.'
  };
}

function extrairDadosDoCodigoBarras(value) {
  const code = normalizarCodigoBarras(value);
  if (!code || code.length !== 44 || !validarCodigoBarras(code)) return null;
  const cents = Number(code.slice(9, 19));
  const factor = Number(code.slice(5, 9));
  const due = dataVencimentoDoFator(factor);
  return {
    codigo: code, tipo: 'bancario', banco: code.slice(0, 3), moeda: code[3],
    valor: cents / 100, valorCentavos: cents, fatorVencimento: factor,
    vencimento: due, vencimentoFormatado: due ? isoDate(due) : null
  };
}

function extrairCamposOCR(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const juntar = linhas.join(' ');
  const cpf = juntar.match(/(?:CPF|CNPJ)(?:\s*\/\s*CPF)?\s*[:.]?\s*([\d.\/-]{11,18})/i);
  const valor = juntar.match(/(?:valor\s*(?:do\s*)?documento|valor\s*cobrado|valor\s*a\s*pagar|valor\s*nominal)\s*[:R$\s]*([\d.]+,\d{2})/i);
  const venc = juntar.match(/(?:vencimento|pagar\s*at[eé])\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const beneficiario = juntar.match(/(?:benefici[aá]rio|cedente|favorecido)\s*[:.]?\s*([^\n]{3,100})/i);
  const dataIso = venc ? venc[1].split('/').reverse().join('-') : null;
  return { cpfCnpjBeneficiario: cpf ? cpf[1].replace(/\s/g, '') : null, valorImpresso: valor ? Number(valor[1].replace(/\./g, '').replace(',', '.')) : null, vencimentoImpresso: dataIso, beneficiario: beneficiario ? beneficiario[1].trim().slice(0, 100) : null };
}
router.post('/ler', upload.single('foto'), async (req, res) => {
  try {
    const received = digits(req.body?.codigoBarras);
    const textoOCR = String(req.body?.textoOCR || '').slice(0, 20000);
    const camposOCR = extrairCamposOCR(textoOCR);
    if (![44, 47, 48].includes(received.length)) {
      return res.status(400).json({ erro: 'Código incompleto. Informe o código de barras bancário (44 dígitos) ou a linha digitável (47 dígitos).' });
    }
    if (received.length === 48) {
      return res.json({ sucesso: true, tipoBoleto: 'arrecadacao', codigoRecebido: received, banco: null, valorOriginal: camposOCR.valorImpresso, dataVencimento: camposOCR.vencimentoImpresso, diasVencidos: 0, juros: 0, multa: 0, taxaServico: 0, valorFinal: camposOCR.valorImpresso, beneficiario: camposOCR.beneficiario, cpfCnpjBeneficiario: camposOCR.cpfCnpjBeneficiario, textoReconhecido: textoOCR, calculoEstimado: false, pagamentoHabilitado: false, avisoCalculo: 'Boleto de arrecadação/convênio identificado. Os campos foram extraídos por OCR quando legíveis; a validação e o cálculo dependem das regras específicas do convênio/emissor.' });
    }
    const normalized = normalizarCodigoBarras(received);
    if (!normalized) return res.status(422).json({ erro: 'Linha digitável inválida: um dos dígitos verificadores dos campos não confere.' });
    if (!validarCodigoBarras(normalized)) return res.status(422).json({ erro: 'Código de barras inválido: o dígito verificador geral não confere.' });
    const data = extrairDadosDoCodigoBarras(normalized);
    if (!data) return res.status(422).json({ erro: 'Não foi possível interpretar este boleto bancário.' });
    const calc = calcularValorFinal(data.valor, data.vencimentoFormatado);
    return res.json({
      sucesso: true, codigoRecebido: data.codigo, tipoBoleto: data.tipo, banco: data.banco,
      valorOriginal: data.valor, dataVencimento: data.vencimentoFormatado,
      diasVencidos: calc.dias, juros: calc.juros, multa: calc.multa,
      taxaServico: calc.taxa, valorFinal: calc.total, calculoEstimado: true,
      avisoCalculo: calc.aviso, requerConsultaEmissor: true,
      beneficiario: camposOCR.beneficiario, cpfCnpjBeneficiario: camposOCR.cpfCnpjBeneficiario,
      valorLidoOCR: camposOCR.valorImpresso, vencimentoLidoOCR: camposOCR.vencimentoImpresso,
      textoReconhecido: textoOCR, pagamentoHabilitado: true
    });
  } catch (error) {
    console.error('Erro ao ler boleto:', error);
    return res.status(500).json({ erro: 'Erro interno ao processar boleto.' });
  }
});

router.extrairDadosDoCodigoBarras = extrairDadosDoCodigoBarras;
router.calcularValorFinal = calcularValorFinal;
router.normalizarCodigoBarras = normalizarCodigoBarras;
router.validarCodigoBarras = validarCodigoBarras;
router.modulo10 = modulo10;
router.modulo11Boleto = modulo11Boleto;
module.exports = router;
