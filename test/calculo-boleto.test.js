'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularAtualizacao, dataISOValida } = require('../backend/services/calculo-boleto');

test('valida datas ISO reais', () => {
  assert.equal(dataISOValida('2026-02-28'), true);
  assert.equal(dataISOValida('2026-02-30'), false);
});

test('identifica boleto a vencer sem inventar encargos', () => {
  const result = calcularAtualizacao({ valorOriginal: 100, dataVencimento: '2026-11-12' }, new Date('2026-11-11T15:00:00Z'));
  assert.equal(result.statusVencimento, 'a_vencer');
  assert.equal(result.valorFinal, 100);
  assert.equal(result.calculoCompleto, true);
});

test('calcula multa e juros diários quando as regras estão explícitas', () => {
  const result = calcularAtualizacao({
    valorOriginal: 100,
    dataVencimento: '2026-11-08',
    multaPercentual: 2,
    jurosPercentual: 0.033,
    jurosRegra: 'juros de 0,033% ao dia'
  }, new Date('2026-11-11T15:00:00Z'));
  assert.equal(result.diasVencidos, 3);
  assert.equal(result.multa, 2);
  assert.equal(result.juros, 0.1);
  assert.equal(result.valorFinal, 102.1);
  assert.equal(result.calculoEstimado, true);
});

test('não fecha total vencido quando a regra de juros é desconhecida', () => {
  const result = calcularAtualizacao({
    valorOriginal: 100,
    dataVencimento: '2026-11-08',
    multaPercentual: 2,
    jurosPercentual: 1
  }, new Date('2026-11-11T15:00:00Z'));
  assert.equal(result.valorFinal, null);
  assert.equal(result.calculoCompleto, false);
});

test('aplica desconto apenas dentro da data limite', () => {
  const result = calcularAtualizacao({
    valorOriginal: 100,
    dataVencimento: '2026-11-12',
    descontoValor: 5,
    descontoDataLimite: '2026-11-11'
  }, new Date('2026-11-11T15:00:00Z'));
  assert.equal(result.desconto, 5);
  assert.equal(result.valorFinal, 95);
});
