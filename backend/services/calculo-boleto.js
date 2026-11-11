'use strict';

const DAY_MS = 86400000;
const TIME_ZONE = 'America/Sao_Paulo';

function dataLocalHoje(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

function dataISOValida(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function diasEntreDatas(inicio, fim) {
  if (!dataISOValida(inicio) || !dataISOValida(fim)) return null;
  const [ay, am, ad] = inicio.split('-').map(Number);
  const [by, bm, bd] = fim.split('-').map(Number);
  return Math.floor((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function calcularAtualizacao(dados = {}, now = new Date()) {
  const hoje = dataLocalHoje(now);
  const vencimento = dados.dataVencimento;
  const valor = Number(dados.valorOriginal);
  const valorValido = dados.valorOriginal !== null && dados.valorOriginal !== undefined && Number.isFinite(valor) && valor >= 0;
  const dataValida = dataISOValida(vencimento);
  const dias = dataValida ? diasEntreDatas(vencimento, hoje) : null;
  const vencido = dias !== null && dias > 0;
  const hojeVence = dias === 0;
  const statusVencimento = !dataValida ? 'nao_identificado' : vencido ? 'vencido' : hojeVence ? 'vence_hoje' : 'a_vencer';

  const base = {
    dataReferencia: hoje,
    diasVencidos: vencido ? dias : 0,
    statusVencimento,
    juros: null,
    multa: null,
    desconto: 0,
    taxaServico: null,
    valorFinal: null,
    calculoEstimado: false,
    calculoCompleto: false,
    aviso: ''
  };

  if (!valorValido) {
    return { ...base, aviso: 'Não foi possível calcular: o valor original não foi identificado com segurança.' };
  }
  if (!dataValida) {
    return { ...base, aviso: 'Valor nominal identificado. Informe ou confirme a data de vencimento para calcular os encargos.' };
  }

  const money = n => arredondar(Math.max(0, n));
  const descontoValor = dados.descontoValor == null ? null : Number(dados.descontoValor);
  const descontoLimite = dataISOValida(dados.descontoDataLimite) ? dados.descontoDataLimite : null;
  const descontoAplicavel = descontoValor !== null && Number.isFinite(descontoValor) && descontoValor >= 0 &&
    descontoLimite && hoje <= descontoLimite && !vencido;
  const desconto = descontoAplicavel ? money(descontoValor) : 0;

  if (!vencido) {
    return {
      ...base,
      desconto,
      valorFinal: money(valor - desconto),
      calculoEstimado: Boolean(desconto),
      calculoCompleto: true,
      aviso: desconto
        ? 'Valor nominal com desconto impresso aplicado dentro do prazo. Confirme o total na tela do banco.'
        : 'Boleto ainda não está vencido. Valor nominal exibido; a confirmação do valor para pagamento deve ser feita no banco.'
    };
  }

  let multa = null;
  if (dados.multaValor !== null && dados.multaValor !== undefined && Number.isFinite(Number(dados.multaValor)) && Number(dados.multaValor) >= 0) {
    multa = money(Number(dados.multaValor));
  } else if (dados.multaPercentual !== null && dados.multaPercentual !== undefined &&
      Number.isFinite(Number(dados.multaPercentual)) && Number(dados.multaPercentual) >= 0) {
    multa = money(valor * Number(dados.multaPercentual) / 100);
  }

  let juros = null;
  const regra = String(dados.jurosRegra || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const jurosValor = dados.jurosValor == null ? null : Number(dados.jurosValor);
  const jurosPercentual = dados.jurosPercentual == null ? null : Number(dados.jurosPercentual);
  if (jurosValor !== null && Number.isFinite(jurosValor) && jurosValor >= 0) {
    if (/por dia|ao dia|diari/.test(regra)) juros = money(jurosValor * dias);
    else if (/por mes|ao mes|mensal/.test(regra)) juros = money(jurosValor * dias / 30);
    else if (/fixo|uma unica vez|valor unico/.test(regra)) juros = money(jurosValor);
  } else if (jurosPercentual !== null && Number.isFinite(jurosPercentual) && jurosPercentual >= 0) {
    if (/por dia|ao dia|diari/.test(regra)) juros = money(valor * jurosPercentual / 100 * dias);
    else if (/por mes|ao mes|mensal/.test(regra)) juros = money(valor * jurosPercentual / 100 * dias / 30);
    else if (/por ano|ao ano|anual/.test(regra)) juros = money(valor * jurosPercentual / 100 * dias / 365);
  }

  if (multa === null || juros === null) {
    return {
      ...base,
      multa,
      juros,
      aviso: 'Boleto vencido há ' + dias + ' dia(s). Não foi possível fechar um total confiável porque a multa e/ou a periodicidade dos juros não foram identificadas. Consulte o valor atualizado no banco ou com o beneficiário.'
    };
  }

  const total = money(valor + multa + juros);
  return {
    ...base,
    multa,
    juros,
    desconto: 0,
    valorFinal: total,
    calculoEstimado: true,
    calculoCompleto: true,
    aviso: 'Estimativa calculada somente com encargos e regras impressos identificados no boleto. O valor oficial pode ser diferente; confirme na tela do banco antes de pagar.'
  };
}

module.exports = { dataLocalHoje, dataISOValida, diasEntreDatas, calcularAtualizacao };
