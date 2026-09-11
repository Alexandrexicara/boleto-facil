// ... (mantém o resto igual)

async function gerarPagamento(dados){
  const resp=await fetch('/api/pagamento/gerar',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      codigoBarras: dados.codigoBarras,
      valorFinal: dados.valorFinal,
      valorOriginal: dados.valorOriginal,
      juros: dados.juros,
      taxaServico: dados.taxaServico,
      cpfCnpj: cpfCnpj.value,
      email: emailUsuario.value
    })
  });
  const r=await resp.json();

  if(r.sucesso){
    const corStatus = r.confirmado ? 'green' : 'orange';
    res.innerHTML=`
      <h2 style="color:${corStatus};text-align:center">${r.confirmado ? '✅ PAGAMENTO CONFIRMADO!' : '⏳ PIX GERADO — AGUARDANDO CONFIRMAÇÃO'}</h2>
      <p style="text-align:center">Transação: <strong>${r.transacaoId}</strong></p>
      <p style="text-align:center;color:${corStatus}">${r.mensagemConfirmacao}</p>
      <p style="text-align:center">Data/Hora: ${r.dataHoraConfirmacao}</p>
      <div style="text-align:center;margin:15px 0"><img src="${r.qrCodeUrl}" style="width:220px;height:220px"></div>
      <p><strong>📋 CÓDIGO PIX — COPIE E COLE NO BANCO:</strong></p>
      <div style="background:#E8F0F8;border:2px solid #005BAA;border-radius:8px;padding:10px;word-break:break-all;font-size:12px">${r.payloadPix}</div>
      <button onclick="navigator.clipboard.writeText(document.querySelector('div[style*=background]').textContent);alert('✅ Copiado! Cole no app do banco!')" style="background:#005BAA;color:white;border:none;padding:10px;border-radius:8px;margin:8px 0;width:100%">📋 COPIAR CÓDIGO PIX</button>
      <hr style="margin:15px 0;border-color:#FFCC00">
      <h3>📄 COMPROVANTE DE PAGAMENTO</h3>
      <textarea id="textoComprovante" style="width:100%;height:180px;padding:10px;border:2px solid #CCC;border-radius:8px;font-family:monospace;font-size:12px" readonly>${JSON.stringify(r.comprovante,null,2)}</textarea>
      <button onclick="baixarPDF('${r.transacaoId}')" style="background:#16a34a;color:white;border:none;padding:12px;border-radius:8px;margin-top:10px;width:100%;font-weight:bold">⬇️ BAIXAR COMPROVANTE EM PDF</button>
    `;
  }else alert('Erro: '+r.erro);
}

// ✅ BAIXA COMPROVANTE EM PDF DE VERDADE
function baixarPDF(transacaoId){
  const texto=document.getElementById('textoComprovante').value;
  const janela=window.open('','_blank');
  janela.document.write(`
    <html><head><title>Comprovante-${transacaoId}</title>
    <style>body{font-family:Arial;padding:30px;line-height:1.6}h1{color:#005BAA}pre{background:#f5f5f5;padding:20px;border-radius:8px;white-space:pre-wrap}</style>
    </head><body>
    <h1>📄 COMPROVANTE DE PAGAMENTO</h1>
    <hr>
    <pre>${texto}</pre>
    <hr>
    <p>Data de emissão: ${new Date().toLocaleString('pt-BR')}</p>
    <button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer">🖨️ SALVAR COMO PDF</button>
    </body></html>
  `);
  janela.document.close();
}
