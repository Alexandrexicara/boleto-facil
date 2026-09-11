const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// ✅ REGRAS OFICIAIS — SEM DADOS FIXOS!
const REGRAS = {
  JUROS_DIA: 0.01 / 30,
  MULTA: 0.02,
  TAXA_SERVICO: 4.90
};

// ✅ CALCULA DIAS VENCIDOS
function diasVencidos(dataVenc) {
  const hoje = new Date();
  const venc = new Date(dataVenc);
  const diff = hoje - venc;
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

// ✅ CALCULA VALORES
function calcularValorFinal(valorOriginal, dataVenc) {
  const dias = diasVencidos(dataVenc);
  const juros = valorOriginal * REGRAS.JUROS_DIA * dias;
  const multa = dias > 0 ? valorOriginal * REGRAS.MULTA : 0;
  const total = valorOriginal + juros + multa + REGRAS.TAXA_SERVICO;
  return { dias, juros, multa, taxa: REGRAS.TAXA_SERVICO, total };
}

// ✅ ROTA DE LEITURA — SEM DADOS FIXOS! VAI LER DE VERDADE!
router.post('/ler', upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.json({erro: 'Envie a foto do boleto!'});

    // ⚠️ AQUI VAI ENTRAR O LEITOR REAL DE CÓDIGO DE BARRAS
    // ENQUANTO ISSO, EXTRAÍ DO PRÓPRIO CÓDIGO DE BARRAS
    const codigoBarras = extrairCodigoBarrasDaImagem(req.file.buffer);
    
    if (!codigoBarras || codigoBarras.length !== 44) {
      return res.json({
        erro: '❌ Não consegui ler o código de barras!\n\nTire a foto mais nítida, bem alinhado, sem sombra e sem reflexo.'
      });
    }

    // ✅ EXTRAI VALOR E VENCIMENTO DO PRÓPRIO CÓDIGO DE BARRAS
    const dados = extrairDadosDoCodigoBarras(codigoBarras);
    if (!dados) {
      return res.json({erro: '❌ Código de barras inválido ou não reconhecido!'});
    }

    // ✅ CALCULA TUDO
    const calc = calcularValorFinal(dados.valor, dados.vencimento);

    res.json({
      sucesso: true,
      codigoBarras: codigoBarras,
      valorOriginal: dados.valor,
      dataVencimento: dados.vencimentoFormatado,
      diasVencidos: calc.dias,
      juros: calc.juros,
      multa: calc.multa,
      taxaServico: calc.taxa,
      valorFinal: calc.total,
      mensagem: calc.dias > 0 
        ? `⚠️ Vencido há ${calc.dias} dias. Juros e multa aplicados.`
        : '✅ Conta dentro do vencimento. Sem acréscimos.'
    });

  } catch (erro) {
    console.error('❌ Erro:', erro.message);
    res.json({erro: 'Erro ao ler: ' + erro.message});
  }
});

// ✅ FUNÇÃO: INTERPRETA CÓDIGO DE BARRAS PADRÃO FEBRABAN
function extrairDadosDoCodigoBarras(codigo) {
  try {
    // Código: 44 dígitos — Padrão Febraban
    const campoValor = codigo.substring(9, 19);
    const valor = parseInt(campoValor) / 100;

    const campoVenc = codigo.substring(33, 43);
    const fator = parseInt(campoVenc);
    
    // ✅ CALCULA DATA PELO FATOR DE VENCIMENTO
    const dataBase = new Date('1997-10-07');
    const vencimento = new Date(dataBase);
    vencimento.setDate(dataBase.getDate() + fator);

    return {
      valor: valor,
      vencimento: vencimento.toISOString().split('T')[0],
      vencimentoFormatado: vencimento.toLocaleDateString('pt-BR')
    };
  } catch {
    return null;
  }
}

// ✅ LEITOR — AQUI VAI O OCR REAL DEPOIS
function extrairCodigoBarrasDaImagem(buffer) {
  // ⚠️ AQUI VAI O LEITOR REAL DE CÓDIGO DE BARRAS
  // POR ENQUANTO, USUÁRIO PODE DIGITAR OU EU COLOCO LEITOR
  return null; // ← VAI RETORNAR ERRO PRA NÃO USAR DADOS FALSOS!
}

module.exports = router;
