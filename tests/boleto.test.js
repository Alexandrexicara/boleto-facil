const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../backend/routes/boletos');

function makeBarcode({ value = '0000001234', factor = '1000' } = {}) {
  const partial = '001' + '9' + factor + value + '1234567890123456789012345';
  assert.equal(partial.length, 43);
  return partial.slice(0, 4) + router.modulo11Boleto(partial) + partial.slice(4);
}
function makeLine(barcode) {
  const a = barcode.slice(0, 4) + barcode.slice(19, 24);
  const b = barcode.slice(24, 34);
  const c = barcode.slice(34, 44);
  return a + router.modulo10(a) + b + router.modulo10(b) +
    c + router.modulo10(c) + barcode[4] + barcode.slice(5, 19);
}

test('extrai valor e fator de vencimento nas posições corretas', () => {
  const code = makeBarcode();
  const data = router.extrairDadosDoCodigoBarras(code);
  assert.ok(data);
  assert.equal(data.valor, 12.34);
  assert.equal(data.fatorVencimento, 1000);
  assert.equal(data.vencimentoFormatado, '2025-02-22');
});
test('converte linha digitável de 47 dígitos e valida os três campos', () => {
  const code = makeBarcode();
  const line = makeLine(code);
  assert.equal(line.length, 47);
  assert.equal(router.normalizarCodigoBarras(line), code);
  assert.equal(router.validarCodigoBarras(code), true);
});
test('rejeita linha digitável com DV de campo incorreto', () => {
  const line = makeLine(makeBarcode());
  const bad = (line[0] === '9' ? '8' : '9') + line.slice(1);
  assert.equal(router.normalizarCodigoBarras(bad), null);
});
test('rejeita DV geral incorreto', () => {
  const code = makeBarcode();
  const bad = code.slice(0, 4) + (code[4] === '9' ? '8' : '9') + code.slice(5);
  assert.equal(router.validarCodigoBarras(bad), false);
});
test('calcula encargos com regras explícitas e datas sem erro de fuso', () => {
  const calc = router.calcularValorFinal(100, '2025-02-22', {
    dataReferencia: '2025-03-24', jurosMensal: 1, multaPercentual: 2, taxaServico: 0
  });
  assert.equal(calc.dias, 30);
  assert.equal(calc.juros, 1);
  assert.equal(calc.multa, 2);
  assert.equal(calc.total, 103);
});
test('não inventa vencimento se fator for zero', () => {
  const data = router.extrairDadosDoCodigoBarras(makeBarcode({ factor: '0000' }));
  assert.equal(data.vencimentoFormatado, null);
});
test('não interpreta arrecadação de 48 dígitos como boleto bancário', () => {
  assert.equal(router.normalizarCodigoBarras('8'.repeat(48)), null);
});
