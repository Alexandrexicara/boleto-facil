const express = require('express');
const router = express.Router();
const multer = require('multer');
const tesseract = require('node-tesseract-ocr');

// ✅ UPLOAD CONFIGURADO EXATAMENTE COMO FUNCIONAVA NO INÍCIO
const upload = multer({ storage: multer.memoryStorage() });

const REGRAS = {
  JUROS_DIA: 0.01 / 30,
  MULTA: 0.02,
  TAXA_SERVICO: 4.90
};

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

// ✅ FUNÇÃO: LER CÓDIGO DE BARRAS USANDO OCR REAL
async function extrairCodigoBarrasOCR(buffer) {
  try {
    const tempPath = '/tmp/boleto-' + Date.now() + '.png';
    require('fs').writeFileSync(tempPath, buffer);
    
    tesseract
      .recognize(tempPath, {
        lang: 'por',
        oem: 3,
        psm: 6,
        timeout: 10000
      })
      .then((text) => {
        require('fs').unlinkSync(tempPath);
        
        // ✅ EXTRAIR os 44 dígitos do código de barras FEBRABAN
        // Padrão: os dígitos normalmente estão na região do código de barras
        const codigoMatch = text.match(/\\d{44}/);
        if (codigoMatch && codigoMatch[0].length === 44) {
          return codigoMatch[0];
        }
        
        // ✅ Tentar encontrar qualquer sequência de 44 dígitos
        const allNumbers = text.replace(/\D/g, '');
        if (allNumbers.length >= 44) {
          return allNumbers.substring(0, 44);
        }
        
        return null;
      })
      .catch((erro) => {
        require('fs').unlinkSync(tempPath);
        console.error('❌ Erro OCR:', erro.message);
        return null;
      });
  } catch (erro) {
    console.error('❌ Erro ao processar OCR:', erro.message);
    return null;
  }
}

// ✅ ROTA DE UPLOAD — COM LEITOR REAL DE CÓDIGO DE BARRAS
router.post('/ler', upload.single('foto'), async (req, res) => {
  try {
    // ✅ MOSTRA NO TERMINAL SE A FOTO CHEGOU
    console.log('══════════════════════════════════════════════════');
    console.log('📸 FOTO:', req.file ? '✅ CHEGOU! Tamanho: ' + req.file.size + ' bytes' : '❌ NÃO CHEGOU!');
    console.log('══════════════════════════════════════════════════');

    let codigoBarras = '';
    
    // ✅ TENTAR LER COM OCR PRIMEIRO
    if (req.file) {
      codigoBarras = await extrairCodigoBarrasOCR(req.file.buffer);
    }
    
    // ✅ SE OCR falhar, pedir para usuário digitar manualmente
    if (!codigoBarras) {
      return res.json({ 
        erro: 'Não consegui ler o código de barras da imagem. '
      + 'Por favor, digite os 44 números do código de barras manualmente.'
      + '<br><input type="text" id="codigoManual" maxlength="44" style="padding:10px;width:100%;margin:10px 0;">'
      + '<button onclick="document.getElementById(\'codigoManual\').focus()" style="padding:8px 15px">Focar para digitar</button>'
      });
    }
    
    if (!codigoBarras || codigoBarras.length !== 44) {
      return res.json({ erro: 'Digite os 44 números do código de barras!' });
    }

    const dados = extrairDadosDoCodigoBarras(codigoBarras);
    if (!dados) {
      return res.json({ erro: 'Código de barras inválido!' });
    }

    const calc = calcularValorFinal(dados.valor, dados.vencimento);

    res.json({
      sucesso: true,
      codigoRecebido: codigoBarras,
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
    res.json({ erro: 'Erro: ' + erro.message });
  }
});

module.exports = router;
