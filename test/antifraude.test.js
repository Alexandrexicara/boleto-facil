'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCNPJ, avaliarAutenticidade } = require('../backend/services/antifraude');

test('valida CNPJ com dígitos verificadores corretos', () => {
  assert.equal(validarCNPJ('11.222.333/0001-81'), true);
});

test('rejeita CNPJ com dígitos inválidos e sequências repetidas', () => {
  assert.equal(validarCNPJ('11.222.333/0001-80'), false);
  assert.equal(validarCNPJ('00.000.000/0000-00'), false);
});

test('não declara autenticidade sem fonte bancária externa', () => {
  const resultado = avaliarAutenticidade({ cnpjBeneficiario: '11.222.333/0001-81', codigoValidado: true });
  assert.equal(resultado.autenticidadeConfirmada, false);
  assert.equal(resultado.status, 'inconclusivo');
  assert.equal(resultado.fonteExternaConsultada, false);
});

test('pede conferência quando os nomes extraídos divergem, sem declarar fraude', () => {
  const resultado = avaliarAutenticidade({
    beneficiario: 'Empresa Alfa Ltda',
    beneficiarioFinal: 'Pessoa Desconhecida',
    cnpjBeneficiario: '11.222.333/0001-81',
    codigoValidado: true
  });
  assert.equal(resultado.status, 'atencao');
  assert.equal(resultado.autenticidadeConfirmada, false);
});
