const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const REGRAS = {
  JUROS_DIA: 0.01 / 30,
  MULTA: 0.02,
  TAXA_SERVICO: 4.9,
  DATA_BASE: new Date('1997-10-07T00:00:00')
};

function formatarDataLocal(data) {
  const d = new Date(data);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function diasVencidos(dataVenc) {
  const hoje = new Date();
  const venc = new Date(dataVenc);
  const diff = hoje - venc;
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

function calcularValorFinal(valorOriginal, dataVenc) {
  const dias = diasVencidos(dataVenc);
  const juros = valorOriginal * REGRAS.JUROS_DIA * dias;
  const multa = dias > 0 ? valorOriginal * REGRAS.MULTA : 0;
  const total = valorOriginal + juros + multa + REGRAS.TAXA_SERVICO;
  return { dias, juros, multa, taxa: REGRAS.TAXA_SERVICO, total };
}

function extrairDadosDoCodigoBarras(codigo) {
  const digits = normalizarCodigoBarras(codigo);
  if (!digits || digits.length !== 44) return null;

  const valorOriginal = Number(digits.slice(4, 14) || '0');
  const fatorVencimento = Number(digits.slice(14, 18) || '0');

  const vencimento = new Date(REGRAS.DATA_BASE.getTime() + fatorVencimento * 24 * 60 * 60 * 1000);
  return {
    codigo: digits,
    valor: valorOriginal,
    fatorVencimento,
    vencimento,
    vencimentoFormatado: formatarDataLocal(vencimento)
  };
}

function normalizarCodigoBarras(codigo) {
  const digits = String(codigo || '').replace(/\D/g, '');
  if (digits.length === 44) return digits;

  if (digits.length === 47) {
    return digits.slice(0, 4) + digits[32] + digits.slice(33, 47)
      + digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31);
  }

  if (digits.length === 48) {
    return [0, 12, 24, 36].map((inicio) => digits.slice(inicio, inicio + 11)).join('');
  }

  return null;
}

router.post('/ler', upload.single('foto'), async (req, res) => {
  try {
    console.log('══════════════════════════════════════════════════');
    console.log('📸 FOTO:', req.file ? '✅ CHEGOU! Tamanho: ' + req.file.size + ' bytes' : '❌ NÃO CHEGOU!');
    console.log('══════════════════════════════════════════════════');

    const codigoBarras = req.body?.codigoBarras || '';

    if (!codigoBarras) {
      return res.status(400).json({
        erro: 'Não consegui ler o código de barras automaticamente. Tire uma foto mais nítida.'
      });
    }

    const codigoLimpo = normalizarCodigoBarras(codigoBarras);
    if (!codigoLimpo) {
      return res.status(400).json({ erro: 'O código de barras lido não possui um formato válido.' });
    }

    const dados = extrairDadosDoCodigoBarras(codigoLimpo);
    if (!dados) {
      return res.status(400).json({ erro: 'Código de barras inválido.' });
    }

    const calc = calcularValorFinal(dados.valor, dados.vencimentoFormatado);

    return res.json({
      sucesso: true,
      codigoRecebido: dados.codigo,
      valorOriginal: dados.valor,
      dataVencimento: dados.vencimentoFormatado,
      diasVencidos: calc.dias,
      juros: calc.juros,
      multa: calc.multa,
      taxaServico: calc.taxa,
      valorFinal: calc.total
    });
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
    return res.status(500).json({ erro: 'Erro ao processar boleto: ' + erro.message });
  }
});

router.extrairDadosDoCodigoBarras = extrairDadosDoCodigoBarras;
router.calcularValorFinal = calcularValorFinal;
router.normalizarCodigoBarras = normalizarCodigoBarras;

module.exports = router;
