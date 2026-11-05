'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProviderRegistry, validarAdaptador, REQUIRED_METHODS } = require('../backend/integrations/provider-registry');

function adaptadorValido(overrides = {}) {
  return {
    id: 'banco-exemplo',
    versao: '1.0.0',
    consultarCobranca: async () => ({ status: 'cobranca_encontrada' }),
    iniciarPagamento: async () => ({ status: 'aguardando_autorizacao' }),
    consultarPagamento: async () => ({ status: 'processando' }),
    verificarWebhook: async () => false,
    segredoPrivado: 'nao-deve-ser-exposto',
    ...overrides
  };
}

test('aceita adaptador que implementa todos os métodos obrigatórios', () => {
  assert.equal(validarAdaptador(adaptadorValido()).id, 'banco-exemplo');
  assert.equal(REQUIRED_METHODS.length, 4);
});

test('rejeita adaptador sem método obrigatório', () => {
  const adapter = adaptadorValido();
  delete adapter.iniciarPagamento;
  assert.throws(() => validarAdaptador(adapter), /iniciarPagamento/);
});

test('rejeita identificador técnico inválido', () => {
  assert.throws(() => validarAdaptador(adaptadorValido({ id: 'Banco Inter' })), /id técnico válido/);
});

test('registro impede ids duplicados', () => {
  const registry = new ProviderRegistry();
  registry.register(adaptadorValido());
  assert.throws(() => registry.register(adaptadorValido()), /Já existe/);
});

test('listagem expõe apenas metadados, nunca segredos do adaptador', () => {
  const registry = new ProviderRegistry();
  registry.register(adaptadorValido());
  const listed = registry.list();
  assert.deepEqual(listed, [{ id: 'banco-exemplo', versao: '1.0.0', ativo: true }]);
  assert.equal(JSON.stringify(listed).includes('nao-deve-ser-exposto'), false);
});

test('registro vazio não presume que exista banco conectado', () => {
  const registry = new ProviderRegistry();
  assert.equal(registry.get('banco-inter'), null);
  assert.deepEqual(registry.list(), []);
});
