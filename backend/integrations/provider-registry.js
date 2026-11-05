'use strict';

// Registro de adaptadores bancários. Este módulo não conecta a nenhum banco.
// Um adaptador só pode ser registrado pelo backend após configuração e homologação.
const REQUIRED_METHODS = Object.freeze([
  'consultarCobranca',
  'iniciarPagamento',
  'consultarPagamento',
  'verificarWebhook'
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function validarAdaptador(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('O adaptador bancário deve ser um objeto.');
  }
  if (typeof adapter.id !== 'string' || !ID_PATTERN.test(adapter.id)) {
    throw new TypeError('O adaptador deve possuir um id técnico válido.');
  }
  if (typeof adapter.versao !== 'string' || !adapter.versao.trim()) {
    throw new TypeError('O adaptador deve informar sua versão.');
  }
  const ausentes = REQUIRED_METHODS.filter(method => typeof adapter[method] !== 'function');
  if (ausentes.length) {
    throw new TypeError('Contrato do adaptador incompleto. Métodos ausentes: ' + ausentes.join(', '));
  }
  return adapter;
}

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(adapter) {
    validarAdaptador(adapter);
    if (this.providers.has(adapter.id)) {
      throw new Error('Já existe um adaptador registrado com este id.');
    }
    this.providers.set(adapter.id, Object.freeze(adapter));
    return adapter.id;
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  list() {
    return [...this.providers.values()].map(provider => ({
      id: provider.id,
      versao: provider.versao,
      ativo: true
    }));
  }

  has(id) {
    return this.providers.has(id);
  }
}

module.exports = { ProviderRegistry, validarAdaptador, REQUIRED_METHODS };
