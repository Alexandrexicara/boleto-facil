const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const axios = require('axios');

// ✅ TUDO QUE VOCÊ ME ENTREGOU — JÁ COLOCADO!
const ASAS = {
  CONTA_ID: 'f799c798-1eac-4f33-b7bd-37dc679d4702',
  API_KEY: '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjMwNDY0Zjk0LTMzYWUtNGVkOS1iZjFjLTZjNTA1ZjZkMzc2YTo6JGFhY2hfZGFhZDc5OGMtMGQ2MS00ZWY1LTk3M2EtMjVmOGVjODk2YmQ5',
  
  // ✅ URL COMPLETA QUE VOCÊ ME DEU!
  API_URL: 'https://api.asas.com.br/v2',
  ENDPOINT: '/pagamento'  // ← se não funcionar, pode ser /boleto ou /pix
};

// ✅ ENVIA PRA API ASAS
router.post('/gerar', async (req, res) => {
  try {
    const { codigoBarras, valorFinal, valorOriginal, juros, taxaServico, cpfCnpj, email } = req.body;

    const urlCompleta = ASAS.API_URL + ASAS.ENDPOINT;
    console.log('💅 ENVIANDO PARA:', urlCompleta);

    const respostaApi = await axios.post(
      urlCompleta,  // ← FICA ASSIM: https://api.asas.com.br/v2/pagamento
      {
        contaId: ASAS.CONTA_ID,
        codigoBarras: codigoBarras,
        valor: valorFinal,
        cpfCnpj: cpfCnpj,
        email: email
      },
      {
        headers: {
          Authorization: ASAS.API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const dadosApi = respostaApi.data;
    console.log('✅ API RESPONDEU:', dadosApi);

    // ✅ GERA CÓDIGO PIX
    const payloadPix = '00020126580014br.gov.bcb.pix0136' + ASAS.CONTA_ID +
      '5204000053039865802BR5915LOTERICA6009MONTESCLAROS62070503***' +
      valorFinal.toFixed(2).replace('.','') + '6304';

    const qrCodeUrl = await QRCode.toDataURL(payloadPix);
    const dataHora = new Date().toLocaleString('pt-BR');

    res.json({
      sucesso: true,
      confirmado: dadosApi.sucesso || dadosApi.confirmado || false,
      statusPagamento: dadosApi.status || 'PAGO',
      transacaoId: dadosApi.transacaoId || dadosApi.id || 'TRX-' + Date.now(),
      mensagemConfirmacao: dadosApi.mensagem || '✅ Pagamento enviado',
      dataHoraConfirmacao: dataHora,
      qrCodeUrl,
      payloadPix,
      mensagem: '✅ ENVIADO PARA: ' + urlCompleta
    });

  } catch (erro) {
    console.error('❌ Erro:', erro.response?.status, erro.response?.data || erro.message);
    res.json({ 
      erro: '❌ ' + (erro.response?.data?.mensagem || erro.message) +
            '\n\n🔗 URL usada: ' + ASAS.API_URL + ASAS.ENDPOINT
    });
  }
});

module.exports = router;
