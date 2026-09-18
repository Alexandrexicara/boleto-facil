const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const axios = require('axios');

const ASAS = {
  CONTA_ID: process.env.ASAS_CONTA_ID || '',
  API_KEY: process.env.ASAS_API_KEY || '',
  API_URL: process.env.ASAS_API_URL || 'https://api.asas.com.br/v2',
  ENDPOINT: process.env.ASAS_ENDPOINT || '/pagamento',
  PIX_KEY: process.env.CHAVE_PIX_LOTERICA || ''
};

router.post('/gerar', async (req, res) => {
  try {
    const { codigoBarras, valorFinal, valorOriginal, juros, taxaServico, cpfCnpj, email } = req.body || {};

    if (!ASAS.CONTA_ID || !ASAS.API_KEY) {
      return res.status(400).json({
        erro: 'Credenciais da API Asas ausentes. Configure ASAS_CONTA_ID e ASAS_API_KEY no arquivo .env.'
      });
    }

    if (!codigoBarras || !valorFinal || !cpfCnpj || !email) {
      return res.status(400).json({
        erro: 'Dados do pagamento incompletos: código de barras, valor, CPF/CNPJ e e-mail são obrigatórios.'
      });
    }

    const urlCompleta = `${ASAS.API_URL}${ASAS.ENDPOINT}`;
    console.log('📤 ENVIANDO PAGAMENTO PARA:', urlCompleta);

    const respostaApi = await axios.post(
      urlCompleta,
      {
        contaId: ASAS.CONTA_ID,
        codigoBarras,
        valor: Number(valorFinal),
        cpfCnpj: String(cpfCnpj).replace(/\D/g, ''),
        email,
        valorOriginal: Number(valorOriginal || valorFinal),
        juros: Number(juros || 0),
        taxaServico: Number(taxaServico || 0)
      },
      {
        headers: {
          Authorization: ASAS.API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const dadosApi = respostaApi.data || {};

    const pixKey = ASAS.PIX_KEY || req.body?.pixKey || '';
    if (!pixKey) {
      return res.status(400).json({
        erro: 'Chave Pix não configurada. Defina CHAVE_PIX_LOTERICA no .env para gerar payload real.'
      });
    }

    const payloadPix = `00020126580014br.gov.bcb.pix0114${pixKey}5204000053039865802BR5915LOTERICA6009MONTESCLAROS62070503***${Number(valorFinal).toFixed(2).replace('.', '')}6304`;
    const qrCodeUrl = await QRCode.toDataURL(payloadPix);
    const dataHora = new Date().toLocaleString('pt-BR');

    const comprovante = {
      transacaoId: dadosApi.transacaoId || dadosApi.id || `TRX-${Date.now()}`,
      statusPagamento: dadosApi.status || 'PENDENTE',
      confirmado: Boolean(dadosApi.confirmado || dadosApi.sucesso || false),
      valorFinal: Number(valorFinal),
      codigoBarras,
      cpfCnpj: String(cpfCnpj).replace(/\D/g, ''),
      email,
      dataHoraConfirmacao: dataHora,
      urlDestino: urlCompleta
    };

    return res.json({
      sucesso: true,
      confirmado: comprovante.confirmado,
      statusPagamento: comprovante.statusPagamento,
      transacaoId: comprovante.transacaoId,
      mensagemConfirmacao: dadosApi.mensagem || 'Pagamento registrado com sucesso.',
      dataHoraConfirmacao: dataHora,
      qrCodeUrl,
      payloadPix,
      comprovante,
      mensagem: 'Pagamento enviado para a API real da Asas.'
    });
  } catch (erro) {
    console.error('❌ Erro no pagamento:', erro.response?.status, erro.response?.data || erro.message);
    return res.status(502).json({
      erro: 'Falha real ao processar pagamento: ' + (erro.response?.data?.mensagem || erro.message),
      url: `${ASAS.API_URL}${ASAS.ENDPOINT}`
    });
  }
});

module.exports = router;
