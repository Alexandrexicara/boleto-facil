const test = require('node:test');
const assert = require('node:assert/strict');
const boletos = require('../backend/routes/boletos');

function modulo11(value) {
  let sum = 0;
  let weight = 2;
  for (let i = value.length - 1; i >= 0; i--) {
    sum += Number(value[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const digit = 11 - (sum % 11);
  return [0, 10, 11].includes(digit) ? 1 : digit;
}

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

function boletoValido(valor = '0000012345') {
  const base = '0019' + '0' + '1000' + valor + '0'.repeat(25);
  return base.slice(0, 4) +
    String(modulo11(base.slice(0, 4) + base.slice(5))) +
    base.slice(5);
}

function linhaDigitavel(code) {
  const a = code.slice(0, 4) + code.slice(19, 24);
  const b = code.slice(24, 34);
  const c = code.slice(34, 44);
  const d = code[4] + code.slice(5, 19);
  return a + modulo10(a) + b + modulo10(b) + c + modulo10(c) + d;
}

test('interpreta boleto bancário de 44 dígitos', () => {
  const code = boletoValido();
  const result = boletos.extrairDadosDoCodigoBarras(code);
  assert.ok(result);
  assert.equal(result.bancoCodigo, '001');
  assert.equal(result.valor, 123.45);
  assert.equal(result.vencimento, '2025-02-22');
});

test('converte linha digitável de 47 dígitos para código de barras', () => {
  const code = boletoValido();
  const line = linhaDigitavel(code);
  assert.equal(line.length, 47);
  assert.equal(boletos.normalizarCodigoBarras(line), code);
  assert.ok(boletos.extrairDadosDoCodigoBarras(line));
});

test('rejeita dígito verificador geral incorreto', () => {
  const code = boletoValido();
  const invalid = code.slice(0, 4) + (code[4] === '9' ? '0' : '9') + code.slice(5);
  assert.equal(boletos.extrairDadosDoCodigoBarras(invalid), null);
});

test('rejeita código com moeda diferente de real', () => {
  const code = boletoValido();
  const invalid = code.slice(0, 3) + '8' + code.slice(4);
  assert.equal(boletos.extrairDadosDoCodigoBarras(invalid), null);
});

test('não confunde arrecadação de 48 dígitos com boleto bancário', () => {
  assert.equal(boletos.normalizarCodigoBarras('8'.repeat(48)), null);
});

test('não aceita entrada com comprimento arbitrário', () => {
  assert.equal(boletos.normalizarCodigoBarras('123456'), null);
});

test('não apresenta R$ 0,00 quando o boleto não codifica valor nominal', () => {
  const code = boletoValido('0000000000');
  const result = boletos.extrairDadosDoCodigoBarras(code);
  assert.ok(result);
  assert.equal(result.valorCentavos, 0);
  assert.equal(result.valorDefinido, false);
  assert.equal(result.valor, null);
});
