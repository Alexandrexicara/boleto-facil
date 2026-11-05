// ✅ INÍCIO DO APP - LEITOR DE BOLETOS COM OCR

const apiBase = '/api/boleto';
let boletoAtual = null;

const fotoInput = document.getElementById('foto');
const preview = document.getElementById('preview');
const camposUsuario = document.getElementById('camposUsuario');
const camposBoleto = document.getElementById('camposBoleto');
const btnProcessar = document.getElementById('btn');
const res = document.getElementById('res');

async function lerCodigoDeBarras(file) {
  const url = URL.createObjectURL(file);
  try {
    const imagem = await new Promise((resolve, reject) => {
      const elemento = new Image();
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => reject(new Error('Não foi possível carregar a foto.'));
      elemento.src = url;
    });

    if (!window.ZXingBrowser) return null;

    const leitor = new ZXingBrowser.BrowserMultiFormatReader();
    const tentativas = [];
    const larguraOriginal = imagem.naturalWidth;
    const alturaOriginal = imagem.naturalHeight;
    const escala = Math.min(1.5, 2200 / Math.max(larguraOriginal, alturaOriginal));

    function adicionarCanvas(corte, altoContraste = false) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(corte.largura * escala));
      canvas.height = Math.max(1, Math.round(corte.altura * escala));
      const contexto = canvas.getContext('2d', { willReadFrequently: true });
      contexto.drawImage(
        imagem,
        corte.x, corte.y, corte.largura, corte.altura,
        0, 0, canvas.width, canvas.height
      );

      if (altoContraste) {
        const pixels = contexto.getImageData(0, 0, canvas.width, canvas.height);
        for (let indice = 0; indice < pixels.data.length; indice += 4) {
          const cinza = Math.round(
            pixels.data[indice] * 0.299 +
            pixels.data[indice + 1] * 0.587 +
            pixels.data[indice + 2] * 0.114
          );
          const contraste = cinza < 160 ? 0 : 255;
          pixels.data[indice] = contraste;
          pixels.data[indice + 1] = contraste;
          pixels.data[indice + 2] = contraste;
        }
        contexto.putImageData(pixels, 0, 0);
      }
      tentativas.push(canvas);
    }

    tentativas.push(imagem);
    adicionarCanvas({ x: 0, y: 0, largura: larguraOriginal, altura: alturaOriginal });
    adicionarCanvas({
      x: 0,
      y: Math.round(alturaOriginal * 0.55),
      largura: larguraOriginal,
      altura: Math.round(alturaOriginal * 0.45)
    });
    adicionarCanvas({
      x: 0,
      y: Math.round(alturaOriginal * 0.55),
      largura: larguraOriginal,
      altura: Math.round(alturaOriginal * 0.45)
    }, true);

    for (const tentativa of tentativas) {
      try {
        if ('BarcodeDetector' in window) {
          try {
            const detector = new BarcodeDetector({ formats: ['itf', 'code_128', 'codabar'] });
            const encontrados = await detector.detect(tentativa);
            const codigoNativo = encontrados[0]?.rawValue?.replace(/\D/g, '');
            if (codigoNativo && [44, 47, 48].includes(codigoNativo.length)) return codigoNativo;
          } catch (erro) {
            console.warn('Detector nativo indisponível:', erro.message);
          }
        }

        const resultado = tentativa instanceof HTMLCanvasElement
          ? await leitor.decodeFromCanvas(tentativa)
          : await leitor.decodeFromImageElement(tentativa);
        const codigoZxing = resultado?.getText?.() || resultado?.text || '';
        const codigo = codigoZxing.replace(/\D/g, '');
        if (codigo && [44, 47, 48].includes(codigo.length)) return codigo;
      } catch (erro) {
        console.warn('Tentativa de leitura falhou:', erro.message);
      }
    }

    return null;
  } catch (erro) {
    console.warn('Leitor de código de barras não encontrou um código:', erro.message);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

fotoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    preview.innerHTML = `<img src="${event.target.result}" class="scan-image" alt="Preview do boleto">`;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);

  boletoAtual = null;
  btnProcessar.disabled = false;
  btnProcessar.textContent = '🔍 Ler Boleto';
  res.innerHTML = '';
  res.classList.remove('oculto');
  camposUsuario.classList.add('oculto');
  camposBoleto.classList.add('oculto');
});

btnProcessar.addEventListener('click', async () => {
  if (boletoAtual) {
    const cpfCnpj = document.getElementById('cpfCnpj').value.trim();
    const email = document.getElementById('emailUsuario').value.trim();

    if (!cpfCnpj || !email) {
      alert('⚠️ Informe CPF/CNPJ e e-mail antes de gerar o pagamento.');
      return;
    }

    btnProcessar.disabled = true;
    btnProcessar.textContent = '⏳ Gerando Pix...';
    res.innerHTML = '⏳ Enviando pagamento real para a API...';

    try {
      await gerarPagamento(boletoAtual);
    } finally {
      btnProcessar.disabled = false;
      btnProcessar.textContent = '💳 Gerar Pix';
    }
    return;
  }

  const file = fotoInput.files[0];
  if (!file) {
    alert('📷 Por favor, selecione uma foto primeiro!');
    return;
  }

  btnProcessar.disabled = true;
  btnProcessar.textContent = '⏳ Lendo código de barras...';
  res.innerHTML = '⏳ Lendo o código de barras automaticamente...';
  res.classList.remove('oculto');

  try {
    const codigo = await lerCodigoDeBarras(file);

    if (!codigo) {
      res.innerHTML = `
        <div style="background:#FFF3E0;border:2px solid #FFCC00;border-radius:8px;padding:20px;margin:15px 0">
          <h4>⚠️ Código não localizado na imagem</h4>
          <p>Fotografe o boleto inteiro, com a linha de barras nítida, reta e sem reflexo.</p>
          <p>O arquivo foi selecionado, mas nenhum código válido foi detectado.</p>
        </div>
      `;
      btnProcessar.disabled = false;
      btnProcessar.textContent = '🔍 Ler Boleto';
      return;
    }

    const formData = new FormData();
    formData.append('foto', file);
    formData.append('codigoBarras', codigo);

    const resp = await fetch(`${apiBase}/ler`, { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.erro) {
      res.innerHTML = `
        <div style="background:#FFF3E0;border:2px solid #FFCC00;border-radius:8px;padding:20px;margin:15px 0">
          <h4>⚠️ Não foi possível ler o código de barras</h4>
          <p>${data.erro}</p>
          <p>Tire outra foto com o código inteiro visível, sem sombra ou reflexo.</p>
        </div>
      `;
      btnProcessar.disabled = false;
      btnProcessar.textContent = '🔍 Ler Boleto';
      return;
    }

    mostrarResultados(data);
  } catch (erro) {
    console.error('❌ Erro:', erro);
    res.innerHTML = `<p style="color:red">❌ Erro ao processar: ${erro.message}</p>`;
    btnProcessar.disabled = false;
    btnProcessar.textContent = '🔍 Ler Boleto';
  }
});

function mostrarResultados(dados) {
  boletoAtual = dados;
  camposUsuario.classList.remove('oculto');
  camposBoleto.classList.remove('oculto');

  document.getElementById('valorOriginal').value = Number(dados.valorOriginal).toFixed(2);
  document.getElementById('dataVencimento').value = dados.dataVencimento;
  document.getElementById('diasVencidos').value = Number(dados.diasVencidos || 0);

  // A API é a fonte única dos valores lidos e calculados; não recalcular no navegador.
  const calc = {
    dias: Number(dados.diasVencidos || 0),
    juros: Number(dados.juros || 0),
    multa: Number(dados.multa || 0),
    taxa: Number(dados.taxaServico || 0),
    total: Number(dados.valorFinal || dados.valorOriginal || 0)
  };

  document.getElementById('juros').value = calc.juros.toFixed(2);
  document.getElementById('multa').value = calc.multa.toFixed(2);
  document.getElementById('taxa').value = calc.taxa.toFixed(2);
  document.getElementById('valorFinal').value = calc.total.toFixed(2);

  res.innerHTML = `
    <div style="background:#E8F0F8;border:2px solid #005BAA;border-radius:8px;padding:20px;margin:15px 0">
      <h3>📊 Resumo do Boleto</h3>
      <p><strong>💰 Valor Original:</strong> R$ ${Number(dados.valorOriginal).toFixed(2).replace('.', ',')}</p>
      <p><strong>📅 Data de Vencimento:</strong> ${dados.dataVencimento || 'Não informada no código'}</p>
      <p><strong>📈 Dias em Atraso:</strong> ${calc.dias} dias</p>
      <p><strong>💸 Juros estimados:</strong> R$ ${calc.juros.toFixed(2).replace('.', ',')}</p>
      <p><strong>💰 Multa estimada:</strong> R$ ${calc.multa.toFixed(2).replace('.', ',')}</p>
      <p><strong>🏦 Taxa de serviço:</strong> R$ ${calc.taxa.toFixed(2).replace('.', ',')}</p>
      <p><strong>💳 Total estimado:</strong> R$ ${calc.total.toFixed(2).replace('.', ',')}</p>
      <p style="font-size:12px;color:#8a4b08">${dados.avisoCalculo || 'O valor exato deve ser confirmado com o beneficiário.'}</p>
      <hr>
      <p><strong>📋 Código recebido:</strong> ${dados.codigoRecebido}</p>
    </div>
  `;

  btnProcessar.disabled = false;
  btnProcessar.textContent = '💳 Gerar Pix';
}

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

async function gerarPagamento(dados) {
  const cpfCnpj = document.getElementById('cpfCnpj').value.replace(/\D/g, '');
  const email = document.getElementById('emailUsuario').value.trim();

  if (!cpfCnpj || !email) {
    alert('⚠️ Preencha CPF/CNPJ e e-mail antes de pagar.');
    return;
  }

  const resp = await fetch('/api/pagamento/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoBarras: dados.codigoRecebido,
      valorFinal: Number(dados.valorFinal || dados.valorOriginal),
      valorOriginal: Number(dados.valorOriginal),
      juros: Number(dados.juros || 0),
      taxaServico: Number(dados.taxaServico || 4.9),
      cpfCnpj,
      email
    })
  });

  const r = await resp.json();

  if (!r.sucesso) {
    alert('Erro real do pagamento: ' + (r.erro || 'Falha ao gerar pagamento.'));
    return;
  }

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
    <textarea id="textoComprovante" style="width:100%;height:180px;padding:10px;border:2px solid #CCC;border-radius:8px;font-family:monospace;font-size:12px" readonly>${JSON.stringify(r.comprovante, null, 2)}</textarea>
    <button onclick="baixarPDF('${r.transacaoId}')" style="background:#16a34a;color:white;border:none;padding:12px;border-radius:8px;margin-top:10px;width:100%;font-weight:bold">⬇️ BAIXAR COMPROVANTE EM PDF</button>
  `;
}

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
