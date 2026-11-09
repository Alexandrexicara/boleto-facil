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
      if ([44, 47, 48].includes(digits.length)) candidatas.add(digits);
    }

    for (const match of String(texto || '').matchAll(/\d{44}|\d{47}|\d{48}/g)) {
      candidatas.add(match[0]);
    }

    return [...candidatas];
  }

  async function interpretar(codigo, file = null) {
    const formData = new FormData();
    if (file) formData.append('foto', file);
    formData.append('codigoBarras', codigo);
    if (file && window.Tesseract?.recognize) {
      try {
        const ocr = await window.Tesseract.recognize(file, 'por+eng');
        formData.append('textoOCR', ocr?.data?.text || '');
      } catch (error) {
        console.warn('OCR complementar não disponível:', error);
        formData.append('textoOCR', '');
      }
    } else {
      formData.append('textoOCR', '');
    }
    const response = await fetch(`${apiBase}/ler`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || 'Não foi possível validar o boleto.');
    return data;
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
    adicionarLinha('Banco emissor (código COMPE)', (data.banco?.codigo || data.banco));
    adicionarLinha('Instituição identificada', data.banco?.nome || 'Nome não identificado');
    adicionarLinha('Valor original impresso', data.valorOriginal != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.valorOriginal)
      : null);
    adicionarLinha('Vencimento codificado', data.dataVencimento);
    adicionarLinha('Beneficiário / dono da cobrança', data.beneficiario || 'Não confirmado pelo código de barras — consultar fonte autorizada');
    adicionarLinha('Valor atualizado', 'Pendente de consulta ao credor');
    adicionarLinha('Situação da dívida', 'Não consultada');
    adicionarLinha('Situação do pagamento', 'Não iniciado');
    adicionarLinha('Validação dos dígitos', data.pagamentoHabilitado === false ? 'Validação específica pendente' : 'Aprovada');
    adicionarLinha('Código identificado', data.codigoRecebido || data.codigoBarras);
    resultado.classList.remove('oculto');
    setStatus(data.avisoCalculo || data.aviso || 'Leitura concluída. Confira os dados.');
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
      mostrar(await interpretar(code, file));
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
        if (![44, 47, 48].includes(code.length)) return;

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
