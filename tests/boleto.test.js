const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../backend/routes/boletos');

const codigo = '00190000000100010000000000000000000000000000';

test('extrai valor, data e código do boleto real', () => {
  const dados = router.extrairDadosDoCodigoBarras(codigo);
  assert.ok(dados);
  assert.equal(dados.codigo, codigo);
  assert.equal(dados.valor, 100);
  assert.equal(dados.vencimentoFormatado, '1998-01-15');
});

test('converte linha digitável bancária de 47 dígitos', () => {
  const linhaDigitavel = codigo.slice(0, 4) + codigo.slice(19, 24) + '0'
    + codigo.slice(24, 34) + '0' + codigo.slice(34, 44) + '0'
    + codigo[4] + codigo.slice(5, 19);

  assert.equal(linhaDigitavel.length, 47);
  assert.equal(router.normalizarCodigoBarras(linhaDigitavel), codigo);
});
