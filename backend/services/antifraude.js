'use strict';

function somenteDigitos(value) {
  return String(value || '').replace(/\\D/g, '');
}

function validarCNPJ(value) {
  const cnpj = somenteDigitos(value);
  if (!/^\\d{14}$/.test(cnpj) || /^(\\d)\\1{13}$/.test(cnpj)) return false;
  const calcular = (base, pesos) => {
    const soma = base.split('').reduce((total, digito, i) => total + Number(digito) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcular(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const segundo = calcular(cnpj.slice(0, 12) + primeiro, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return Number(cnpj[12]) === primeiro && Number(cnpj[13]) === segundo;
}

function normalizarNome(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
}

function compararBeneficiarios(beneficiario, beneficiarioFinal) {
  if (!beneficiario || !beneficiarioFinal) return 'nao_comparavel';
  return normalizarNome(beneficiario) === normalizarNome(beneficiarioFinal) ? 'coincidente' : 'divergente';
}

/**
 * Avaliação conservadora: valida apenas consistência local dos dados lidos.
 * Nunca afirma que o boleto é autêntico sem consulta a uma fonte bancária/oficial.
 */
function avaliarAutenticidade(dados = {}) {
  const cnpj = somenteDigitos(dados.cnpjBeneficiario);
  const cnpjFinal = somenteDigitos(dados.cnpjBeneficiarioFinal);
  const cnpjInformado = Boolean(cnpj);
  const cnpjValido = cnpjInformado ? validarCNPJ(cnpj) : null;
  const cnpjFinalValido = cnpjFinal ? validarCNPJ(cnpjFinal) : null;
  const nomeComparacao = compararBeneficiarios(dados.beneficiario, dados.beneficiarioFinal);
  const divergencias = [];
  const alertas = [];

  if (!cnpjInformado) alertas.push('CNPJ do beneficiário não foi identificado com segurança.');
  else if (!cnpjValido) divergencias.push('O CNPJ extraído não passou na validação dos dígitos verificadores.');

  if (cnpjFinal && !cnpjFinalValido) divergencias.push('O CNPJ do beneficiário final extraído não passou na validação dos dígitos verificadores.');
  if (cnpj && cnpjFinal && cnpj !== cnpjFinal) {
    alertas.push('O CNPJ do beneficiário e o do beneficiário final são diferentes; isso pode ser legítimo, mas exige conferência.');
  }
  if (nomeComparacao === 'divergente') {
    alertas.push('Os nomes do beneficiário e do beneficiário final extraídos apresentam divergência.');
  }

  if (!dados.codigoValidado && !dados.qrCodePix) {
    alertas.push('Não foi possível validar um código bancário ou identificar um QR Code Pix.');
  }
  if (!dados.fonteExternaConsultada) {
    alertas.push('Não houve consulta ao registro bancário nem confirmação cadastral oficial do beneficiário.');
  }

  const requerConferencia = divergencias.length > 0 || nomeComparacao === 'divergente' || (cnpj && cnpjFinal && cnpj !== cnpjFinal);
  return {
    status: requerConferencia ? 'atencao' : 'inconclusivo',
    titulo: requerConferencia ? 'Atenção: confira os dados antes de pagar' : 'Autenticidade ainda não confirmada',
    cnpjIdentificado: cnpjInformado,
    cnpjValido,
    cnpjFinalValido,
    comparacaoNomes: nomeComparacao,
    codigoValidado: Boolean(dados.codigoValidado),
    fonteExternaConsultada: Boolean(dados.fonteExternaConsultada),
    autenticidadeConfirmada: false,
    divergencias,
    alertas,
    orientacao: 'Confira o beneficiário e o CPF/CNPJ exibidos na tela de confirmação do seu banco. A validação matemática do CNPJ e do código não comprova, sozinha, que o boleto pertence à empresa esperada.'
  };
}

module.exports = { somenteDigitos, validarCNPJ, normalizarNome, compararBeneficiarios, avaliarAutenticidade };
