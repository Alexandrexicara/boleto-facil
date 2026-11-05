(() => {
  'use strict';

  const apiBase = '/api/boleto';
  const fotoInput = document.getElementById('foto');
  const statusEl = document.getElementById('status');
  const preview = document.getElementById('preview');
  const resultado = document.getElementById('resultado');
  const dadosEl = document.getElementById('dadosBoleto');
  const painelCamera = document.getElementById('painelCamera');
  const video = document.getElementById('videoCamera');

  let ultimoResultado = null;
  let cameraControls = null;
  let previewUrl = null;

  const setStatus = message => { statusEl.textContent = message; };
  const somenteDigitos = value => String(value || '').replace(/\D/g, '');

  function linhasCandidatas(texto) {
    const compactado = String(texto || '').replace(/\s+/g, '');
    const candidatas = new Set();

    for (const match of compactado.matchAll(/(?:\d[.\s-]?){43,47}\d/g)) {
      const digits = somenteDigitos(match[0]);
      if ([44, 47].includes(digits.length)) candidatas.add(digits);
    }

    for (const match of String(texto || '').matchAll(/\d{44}|\d{47}/g)) {
      candidatas.add(match[0]);
    }

    return [...candidatas];
  }

  async function interpretar(codigo) {
    const response = await fetch(`${apiBase}/interpretar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoBarras: codigo })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || 'Não foi possível validar o boleto.');
    return data;
  }

  async function tentarZXing(file, objectUrl) {
    if (!window.ZXingBrowser) return null;

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem para leitura do código.'));
      img.src = objectUrl;
    });

    const reader = new ZXingBrowser.BrowserMultiFormatReader();
    const canvases = [];
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(2, 2400 / largestSide);
    const crops = [
      { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight },
      { x: 0, y: image.naturalHeight * 0.45, w: image.naturalWidth, h: image.naturalHeight * 0.55 },
      { x: 0, y: image.naturalHeight * 0.65, w: image.naturalWidth, h: image.naturalHeight * 0.35 }
    ];

    for (const crop of crops) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(crop.w * scale));
      canvas.height = Math.max(1, Math.round(crop.h * scale));
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      canvases.push(canvas);
    }

    for (const canvas of canvases) {
      try {
        const result = await reader.decodeFromCanvas(canvas);
        const code = somenteDigitos(result?.getText?.());
        if ([44, 47].includes(code.length)) return code;
      } catch (_) {
        // Tenta outras áreas da imagem antes de recorrer ao OCR.
      }
    }

    return null;
  }

  async function lerImagem(file) {
    const objectUrl = URL.createObjectURL(file);

    try {
      if (window.ZXingBrowser) {
        try {
          const code = await tentarZXing(file, objectUrl);
          if (code) return code;
        } catch (error) {
          console.warn('Leitura ZXing indisponível para esta imagem:', error);
        }
      }

      // OCR continua disponível mesmo quando o CDN do ZXing não carrega.
      if (window.Tesseract?.recognize) {
        setStatus('Código de barras não localizado. Tentando ler a linha digitável por OCR…');
        const ocr = await window.Tesseract.recognize(file, 'por');
        const candidates = linhasCandidatas(ocr?.data?.text || '');

        for (const candidate of candidates) {
          try {
            await interpretar(candidate);
            return candidate;
          } catch (_) {
            // Uma linha só é aceita depois da validação matemática no backend.
          }
        }
      }

      if (!window.ZXingBrowser && !window.Tesseract?.recognize) {
        throw new Error('Os leitores de imagem não carregaram. Verifique a conexão e tente novamente.');
      }

      throw new Error('Não foi possível reconhecer uma linha digitável válida. Tente outra foto, bem iluminada e sem cortes.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function adicionarLinha(label, value) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value === null || value === undefined || value === ''
      ? 'Não disponível na leitura'
      : String(value);
    dadosEl.append(dt, dd);
  }

  function mostrar(data) {
    ultimoResultado = data;
    dadosEl.replaceChildren();
    adicionarLinha('Banco emissor (código COMPE)', data.banco?.codigo);
    adicionarLinha('Instituição identificada', data.banco?.nome || 'Código identificado; nome depende da tabela atualizada');
    adicionarLinha('Valor original impresso', data.valorOriginal != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.valorOriginal)
      : null);
    adicionarLinha('Vencimento codificado', data.dataVencimento);
    adicionarLinha('Beneficiário / dono da cobrança', 'Não confirmado pelo código de barras — consultar fonte autorizada');
    adicionarLinha('Valor atualizado', 'Pendente de consulta ao credor');
    adicionarLinha('Situação da dívida', 'Não consultada');
    adicionarLinha('Situação do pagamento', 'Não iniciado');
    adicionarLinha('Validação dos dígitos', 'Aprovada');
    resultado.classList.remove('oculto');
    setStatus('Leitura validada. Aguardando consulta autorizada ao credor.');
  }

  async function processarArquivo(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Selecione uma imagem válida.');
      return;
    }

    resultado.classList.add('oculto');
    ultimoResultado = null;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    preview.replaceChildren();
    previewUrl = URL.createObjectURL(file);

    const img = document.createElement('img');
    img.className = 'scan-image';
    img.alt = 'Imagem selecionada do boleto';
    img.src = previewUrl;
    preview.append(img);

    try {
      setStatus('Analisando imagem e procurando código de barras…');
      const code = await lerImagem(file);
      setStatus('Validando os dígitos do boleto…');
      mostrar(await interpretar(code));
    } catch (error) {
      setStatus(error.message || 'Não foi possível ler o boleto.');
    }
  }

  fotoInput.addEventListener('change', () => processarArquivo(fotoInput.files?.[0]));

  document.getElementById('abrirCamera').addEventListener('click', async () => {
    if (!window.ZXingBrowser) {
      setStatus('Leitor da câmera indisponível. Envie uma foto para tentar a leitura por OCR.');
      return;
    }

    try {
      ultimoResultado = null;
      resultado.classList.add('oculto');
      painelCamera.classList.remove('oculto');
      setStatus('Aponte a câmera para o código de barras do boleto.');

      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      cameraControls = await reader.decodeFromVideoDevice(undefined, video, async result => {
        if (!result || ultimoResultado) return;

        const code = somenteDigitos(result.getText());
        if (![44, 47].includes(code.length)) return;

        ultimoResultado = { processando: true };
        cameraControls?.stop();

        try {
          mostrar(await interpretar(code));
        } catch (error) {
          ultimoResultado = null;
          setStatus(error.message || 'Não foi possível validar o código.');
        }
      });
    } catch (error) {
      setStatus('Não foi possível acessar a câmera. Verifique a permissão ou envie uma foto.');
    }
  });

  document.getElementById('fecharCamera').addEventListener('click', () => {
    cameraControls?.stop();
    cameraControls = null;
    video.srcObject?.getTracks?.().forEach(track => track.stop());
    painelCamera.classList.add('oculto');
  });

  document.getElementById('copiarDados').addEventListener('click', async () => {
    if (!ultimoResultado || ultimoResultado.processando) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(ultimoResultado, null, 2));
      setStatus('Dados técnicos copiados.');
    } catch (_) {
      setStatus('Não foi possível copiar automaticamente neste navegador.');
    }
  });
})();
