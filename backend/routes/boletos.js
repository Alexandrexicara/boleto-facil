const express = require('express');
const router = express.Router();

const DAY = 86400000;
const LEGACY_BASE = Date.UTC(1997, 9, 7);
const RESET_BASE = Date.UTC(2022, 4, 29);
const digits = value => String(value || '').replace(/\D/g, '');

function modulo10(value) {
  let sum = 0;
  let weight = 2;
  for (let i = value.length - 1; i >= 0; i--) {
    const n = Number(value[i]) * weight;
    sum += Math.floor(n / 10) + (n % 10);
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

function modulo11Boleto(value) {
  let sum = 0;
  let weight = 2;
  for (let i = value.length - 1; i >= 0; i--) {
    sum += Number(value[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const digit = 11 - (sum % 11);
  return [0, 10, 11].includes(digit) ? 1 : digit;
}

function validarCodigoBarras(code) {
  return /^\d{44}$/.test(code) &&
    code[0] !== '8' &&
    code[3] === '9' &&
    Number(code[4]) === modulo11Boleto(code.slice(0, 4) + code.slice(5));
}

function normalizarCodigoBarras(value) {
  const code = digits(value);
  if (code.length === 44) return code;
  if (code.length !== 47) return null;

  const fields = [
    [code.slice(0, 9), code[9]],
    [code.slice(10, 20), code[20]],
    [code.slice(21, 31), code[31]]
  ];

  if (fields.some(([field, digit]) => Number(digit) !== modulo10(field))) {
    return null;
  }

  // Recompõe: banco + moeda + DV geral + fator/valor + campo livre.
  return code.slice(0, 4) + code[32] + code.slice(33, 47) +
    code.slice(4, 9) + code.slice(10, 20) + code.slice(21, 31);
}

function dataVencimentoDoFator(factor) {
  if (!Number.isInteger(factor) || factor <= 0 || factor > 9999) return null;
  const base = factor >= 1000 ? RESET_BASE : LEGACY_BASE;
  return new Date(base + factor * DAY);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function extrairDadosDoCodigoBarras(value) {
  const code = normalizarCodigoBarras(value);
  if (!code || !validarCodigoBarras(code)) return null;

  const cents = Number(code.slice(9, 19));
  const factor = Number(code.slice(5, 9));
  const dueDate = dataVencimentoDoFator(factor);
  const valorDefinido = cents > 0;

  return {
    codigo: code,
    tipo: 'boleto_bancario',
    bancoCodigo: code.slice(0, 3),
    moeda: code[3],
    valorCentavos: cents,
    valorDefinido,
    valor: valorDefinido ? cents / 100 : null,
    fatorVencimento: factor,
    vencimento: dueDate ? isoDate(dueDate) : null
  };
}

const bancosConhecidos = {
  '001': 'Banco do Brasil',
  '033': 'Santander',
  '077': 'Banco Inter',
  '104': 'Caixa Econômica Federal',
  '237': 'Bradesco',
  '260': 'Nu Pagamentos',
  '290': 'PagSeguro',
  '336': 'C6 Bank',
  '341': 'Itaú Unibanco',
  '655': 'Banco Votorantim',
  '748': 'Sicredi',
  '756': 'Bancoob / Sicoob'
};

function interpretarHandler(req, res) {
  try {
    const received = digits(req.body?.codigoBarras);

    if (received.length === 48) {
      return res.status(422).json({
        erro: 'Código de arrecadação/convênio detectado. Ele exige um interpretador específico e não será tratado como boleto bancário.'
      });
    }

    if (![44, 47].includes(received.length)) {
      return res.status(400).json({
        erro: 'Informe um código de barras de 44 dígitos ou linha digitável bancária de 47 dígitos.'
      });
    }

    const data = extrairDadosDoCodigoBarras(received);
    if (!data) {
      return res.status(422).json({
        erro: 'Código inválido ou dígitos verificadores não conferem. Confira a imagem e tente novamente.'
      });
    }

    return res.json({
      sucesso: true,
      etapa: 'leitura_validada',
      codigoBarras: data.codigo,
      tipoBoleto: data.tipo,
      banco: {
        codigo: data.bancoCodigo,
        nome: bancosConhecidos[data.bancoCodigo] || null
      },
      moeda: data.moeda,
      valorOriginal: data.valor,
      dataVencimento: data.vencimento,
      fatorVencimento: data.fatorVencimento,
      validacao: { formato: true, digitosVerificadores: true },
      beneficiario: { identificado: false, fonte: null },
      encargos: { consultados: false, valorAtualizado: null },
      pagamento: { iniciado: false, liquidado: false, baixaConfirmada: false },
      proximasEtapas: [
        'consultar_beneficiario_em_fonte_autorizada',
        'consultar_valor_atualizado_com_credor',
        'obter_instrucao_de_pagamento_oficial',
        'confirmar_liquidacao_e_baixa'
      ],
      aviso: 'A leitura do código não identifica com segurança o beneficiário nem calcula encargos atuais. Esses dados exigem integração autorizada com o credor ou sistema de liquidação.'
    });
  } catch (error) {
    console.error('Erro ao interpretar boleto:', error);
    return res.status(500).json({ erro: 'Erro interno ao interpretar o boleto.' });
  }
}

// Os dois caminhos compartilham exatamente o mesmo validador e handler.
router.post(['/interpretar', '/ler'], express.json({ limit: '10kb' }), interpretarHandler);

router.extrairDadosDoCodigoBarras = extrairDadosDoCodigoBarras;
router.normalizarCodigoBarras = normalizarCodigoBarras;
router.validarCodigoBarras = validarCodigoBarras;
router.modulo10 = modulo10;
router.modulo11Boleto = modulo11Boleto;

module.exports = router;
