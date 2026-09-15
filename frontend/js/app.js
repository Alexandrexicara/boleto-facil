// ✅ INÍCIO DO APP - LEITOR DE BOLETOS COM OCR

const apiBase = '/api/boleto';

// Elementos do DOM
const fotoInput = document.getElementById('foto');
const preview = document.getElementById('preview');
const camposUsuario = document.getElementById('camposUsuario');
const btnProcessar = document.getElementById('btn');
const res = document.getElementById('res');

// ✅ PREVISUALIZAR IMAGEM SELECIONADA
fotoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // ✅ Mostrar preview da imagem
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = `<img src="${e.target.result}" class="scan-image" alt="Preview do boleto">`;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
  
  // ✅ Habilitar botão e processar
  btnProcessar.disabled = false;
  res.innerHTML = '';
  camposUsuario.classList.add('oculto');
});

// ✅ PROCESSAR BOLETO - ENVIAR IMAGEM PARA OCR
btnProcessar.addEventListener('click', async () => {
  const file = fotoInput.files[0];
  if (!file) {
    alert('📷 Por favor, selecione uma foto primeiro!');
    return;
  }
  
  btnProcessar.disabled = true;
  btnProcessar.textContent = '⏳ Processando OCR...';
  res.innerHTML = '⏳ Analisando imagem com OCR...';
  
  // ✅ Enviar imagem para o backend
  const formData = new FormData();
  formData.append('foto', file);
  
  try {
    const resp = await fetch(`${apiBase}/ler`, {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    
    btnProcessar.disabled = true;
    btnProcessar.textContent = '🔍 Processar Boleto';
    
    if (data.erro) {
      // ✅ Se OCR falhar, mostrar campo para digitar manualmente
      res.innerHTML = `
        <div style="background:#FFF3E0;border:2px solid #FFCC00;border-radius:8px;padding:20px;margin:15px 0">
          <h4>⚠️ OCR não conseguiu ler o código de barras</h4>
          <p>Erro: ${data.erro}</p>
          <p>O código de barras do boleto padrão FEBRABAN tem 44 dígitos. Você pode:</p>
          <ol>
            <li>Tirar uma foto mais clara, bem alinhada, sem sombra e sem reflexo</li>
            <li>Digitar o código manualmente: <input type="text" id="codigoManual" maxlength="44" style="width:100%;padding:10px;margin:10px 0;border:2px solid #CCC;border-radius:6px;font-size:16px"></li>
            <li>Clique em "Usar código manual" quando digitar</li>
          </ol>
          <button onclick="lerCodigoManual()" style="background:#005BAA;color:white;border:none;padding:10px;border-radius:8px;width:100%;margin-top:10px;font-weight:bold">✏️ Usar código manual</button>
        </div>
      `;
      btnProcessar.disabled = false;
      btnProcessar.textContent = '🔍 Processar Boleto';
      return;
    }
    
    // ✅ Mostrar resultados do OCR
    mostrarResultados(data);
  } catch (erro) {
    console.error('❌ Erro:', erro);
    res.innerHTML = `<p style="color:red">❌ Erro ao processar: ${erro.message}</p>`;
    btnProcessar.disabled = false;
    btnProcessar.textContent = '🔍 Processar Boleto';
  }
});

// ✅ LER CÓDIGO MANUALMENTE
function lerCodigoManual() {
  const codigo = document.getElementById('codigoManual').value.trim();
  if (!codigo || codigo.length !== 44) {
    alert('⚠️ Por favor, digite exatamente 44 números!');
    return;
  }
  
  // ✅ Enviar código manual para o backend
  fetch(`${apiBase}/ler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigoBarras: codigo })
  }).then(async (resp) => {
    const data = await resp.json();
    if (data.sucesso) {
      mostrarResultados(data);
    } else {
      alert('❌ ' + data.erro);
    }
  });
}

// ✅ MOSTRAR RESULTADOS NO INTERFACE
function mostrarResultados(dados) {
  camposUsuario.classList.remove('oculto');
  
  // ✅ Preencher dados automatically (pode ser editado)
  const valorFormatado = dados.valorOriginal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  document.getElementById('valorOriginal').value = dados.valorOriginal;
  document.getElementById('dataVencimento').value = dados.dataVencimento;
  document.getElementById('diasVencidos').value = dados.diasVencidos || 0;
  
  // ✅ Calcular valores
  const calc = calcularValorFinal(dados.valorOriginal, dados.dataVencimento);
  
  document.getElementById('juros').value = calc.juros.toFixed(2);
  document.getElementById('multa').value = calc.multa.toFixed(2);
  document.getElementById('taxa').value = calc.taxa.toFixed(2);
  document.getElementById('valorFinal').value = calc.total.toFixed(2);
  
  // ✅ Mostrar resumo
  res.innerHTML = `
    <div style="background:#E8F0F8;border:2px solid #005BAA;border-radius:8px;padding:20px;margin:15px 0">
      <h3>📊 Resumo do Boleto</h3>
      <p><strong>💰 Valor Original:</strong> R$ ${calc.total.toFixed(2).replace('.', ',')}</p>
      <p><strong>📅 Data de Vencimento:</strong> ${dados.dataVencimento}</p>
      <p><strong>📈 Dias em Atraso:</strong> ${calc.dias} dias</p>
      <p><strong>💸 Juros:</strong> R$ ${calc.juros.toFixed(2).replace('.', ',')}</p>
      <p><strong>💰 Multa:</strong> R$ ${calc.multa.toFixed(2).replace('.', ',')}</p>
      <p><strong>🏦 taxa de serviço:</strong> R$ ${calc.taxa.toFixed(2).replace('.', ',')}</p>
      <hr>
      <p><strong>📋 Código recebido:</strong> ${dados.codigoRecebido}</p>
    </div>
  `;
  
  // ✅ Habilitar botão de pagar
  btnProcessar.disabled = false;
  btnProcessar.textContent = '💳 Gerar Pix';
}

// ✅ CALCULAR VALORES (copiado do backend)
function calcularValorFinal(valorOriginal, dataVenc) {
  const hoje = new Date();
  const venc = new Date(dataVenc);
  const diff = hoje - venc;
  const dias = diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
  const juros = valorOriginal * 0.01 / 30 * dias;
  const multa = dias > 0 ? valorOriginal * 0.02 : 0;
  const total = valorOriginal + juros + multa + 4.90;
  return { dias, juros, multa, taxa: 4.90, total };
}

// ✅ GERAR PIX
async function gerarPagamento(dados) {
  const cpfCnpj = document.getElementById('cpfCnpj').value.replace(/\D/g, '');
  const email = document.getElementById('emailUsuario').value;
  
  const resp = await fetch('/api/pagamento/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoBarras: dados.codigoRecebido,
      valorFinal: dados.valorFinal,
      valorOriginal: dados.valorOriginal,
      juros: dados.juros,
      taxaServico: dados.taxaServico,
      cpfCnpj: cpfCnpj,
      email: email
    })
  });
  const r = await resp.json();
  
  if (r.sucesso) {
    const corStatus = r.confirmado ? 'green' : 'orange';
    res.innerHTML = `
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
  } else {
    alert('Erro: ' + r.erro);
  }
}

// ✅ BAIXA COMPROVANTE EM PDF DE VERDADE
function baixarPDF(transacaoId) {
  const texto = document.getElementById('textoComprovante').value;
  const janela = window.open('', '_blank');
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
