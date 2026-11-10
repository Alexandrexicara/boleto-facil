(() => {
'use strict';
const apiBase='https://boleto-facil-nmbd.onrender.com/api/boleto';
const fotoInput=document.getElementById('foto'),fotoNvidiaInput=document.getElementById('fotoNvidia'),statusEl=document.getElementById('status'),preview=document.getElementById('preview'),resultado=document.getElementById('resultado'),dadosEl=document.getElementById('dadosBoleto'),painelCamera=document.getElementById('painelCamera'),video=document.getElementById('videoCamera');
let ultimoResultado=null,cameraControls=null,previewUrl=null,processamento=null,etapaAtual=0;
const digitos=v=>String(v||'').replace(/\D/g,'');
const moeda=v=>v==null||v===''?null:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const setStatus=m=>{statusEl.textContent=m;};
function criarPainelProcessamento(){
 if(processamento)return processamento;
 processamento=document.createElement('section');
 processamento.id='painelProcessamento';
 processamento.className='boleto-processamento oculto';
 processamento.setAttribute('role','status');
 processamento.setAttribute('aria-live','polite');
 processamento.innerHTML='<div class="processamento-cartao"><div class="processamento-topo"><span class="processamento-selo">BOLETO FÁCIL</span><span class="processamento-ponto"></span></div><h2>Leitura do boleto em andamento</h2><p id="processamentoMensagem">Preparando a imagem...</p><div class="processamento-barra"><span id="processamentoProgresso"></span></div><ol class="processamento-etapas"><li data-etapa="1">Imagem recebida e preparada</li><li data-etapa="2">Leitura do código de barras</li><li data-etapa="3">Reconhecimento de textos (OCR)</li><li data-etapa="4">Análise visual pela inteligência artificial</li><li data-etapa="5">Validação e organização dos dados</li></ol><div class="processamento-leitura"><strong>Texto que já foi reconhecido</strong><pre id="processamentoTexto">Aguardando início do OCR...</pre></div><p id="processamentoErro" class="processamento-erro" hidden></p><button id="fecharProcessamento" type="button" class="secundario" hidden>Fechar</button></div>';
 preview.insertAdjacentElement('afterend',processamento);
 processamento.querySelector('#fecharProcessamento').addEventListener('click',()=>processamento.classList.add('oculto'));
 return processamento;
}
function atualizarEtapa(n,mensagem,percentual){
 etapaAtual=Math.max(etapaAtual,n);
 const painel=criarPainelProcessamento();
 painel.querySelector('#processamentoMensagem').textContent=mensagem;
 painel.querySelector('#processamentoProgresso').style.width=Math.max(0,Math.min(100,percentual))+'%';
 painel.querySelectorAll('[data-etapa]').forEach(el=>{
  const nEtapa=Number(el.dataset.etapa);
  el.classList.toggle('concluida',nEtapa<etapaAtual);
  el.classList.toggle('ativa',nEtapa===etapaAtual);
 });
}
function mostrarTextoOCR(texto){
 const painel=criarPainelProcessamento();
 painel.querySelector('#processamentoTexto').textContent=texto||'Nenhum texto legível foi extraído nesta etapa.';
}
function linhasCandidatas(texto){
 const s=String(texto||''),out=new Set();
 for(const m of s.matchAll(/(?:\d[\s.-]?){43,47}\d/g)){const d=digitos(m[0]);if([44,47,48].includes(d.length))out.add(d);}
 for(const m of s.matchAll(/\d{44}|\d{47}|\d{48}/g))out.add(m[0]);
 const grupos=s.match(/\d{4,}/g)||[];
 for(let i=0;i<grupos.length;i++){let junc='';for(let j=i;j<grupos.length&&j<i+8;j++){junc+=grupos[j];if([44,47,48].includes(junc.length))out.add(junc);if(junc.length>=48)break;}}
 return [...out].sort((a,b)=>({44:0,47:1,48:2}[a.length]-({44:0,47:1,48:2}[b.length])));
}
async function reconhecerTexto(file){
 if(!window.Tesseract||!window.Tesseract.recognize)throw new Error('O mecanismo OCR não carregou. Verifique a conexão e tente novamente.');
 const r=await window.Tesseract.recognize(file,'por+eng',{logger:m=>{
  if(!m||!m.status)return;
  const pct=Number.isFinite(m.progress)?Math.round(m.progress*100):0;
  const mensagens={'loading tesseract core':'Carregando mecanismo de leitura...', 'initializing tesseract':'Inicializando OCR...', 'loading language traineddata':'Carregando idioma português...', 'initializing api':'Preparando leitura da imagem...', 'recognizing text':'Reconhecendo os textos impressos no boleto...'};
  const msg=mensagens[m.status]||'Reconhecendo os textos impressos no boleto...';
  atualizarEtapa(3,msg,25+Math.round(pct*.35));
 }});
 return r&&r.data&&r.data.text?r.data.text:'';
}
async function lerCodigoImagem(img){
 if(!window.ZXingBrowser||!window.ZXingBrowser.BrowserMultiFormatReader)return '';
 try{
  atualizarEtapa(2,'Procurando o código de barras na imagem...',22);
  const reader=new ZXingBrowser.BrowserMultiFormatReader();
  const r=await reader.decodeFromImageElement(img);
  const code=digitos(r&&r.getText?r.getText():'');
  return [44,47,48].includes(code.length)?code:'';
 }catch(_){return '';}
}
async function interpretar(codigo,textoOCR='',file=null){
 const fd=new FormData();
 fd.append('codigoBarras',codigo||'');
 fd.append('textoOCR',textoOCR||'');
 if(file)fd.append('foto',file,file.name||'boleto.jpg');
 let response;
 try{response=await fetch(apiBase+'/ler',{method:'POST',body:fd});}
 catch(_){throw new Error('Não foi possível conectar ao servidor de leitura no Render. A imagem e o OCR local foram preservados nesta tela.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.erro||'Falha no servidor de leitura (HTTP '+response.status+').');
 return data;
}
function adicionarLinha(label,value){
 const dt=document.createElement('dt'),dd=document.createElement('dd');
 dt.textContent=label;
 dd.textContent=value==null||value===''?'Não identificado nesta imagem':String(value);
 dadosEl.append(dt,dd);
}
function dataBR(v){
 if(!v)return null;
 const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?m[3]+'/'+m[2]+'/'+m[1]:v;
}
function mostrar(d){
 d = d && typeof d === 'object' ? d : {};
 ultimoResultado=d;dadosEl.replaceChildren();
 const tipo=String(d.tipoBoleto||'').toLowerCase();
 adicionarLinha('Tipo de documento',tipo==='arrecadacao'?'Arrecadação / convênio':tipo==='bancario'?'Boleto bancário':d.tipoBoleto);
 adicionarLinha('Motor de leitura',d.motorLeitura);
 adicionarLinha('Tokens NVIDIA (entrada / saída / total)',d.diagnosticoIA?[(d.diagnosticoIA.promptTokens??'—'),(d.diagnosticoIA.completionTokens??'—'),(d.diagnosticoIA.totalTokens??'—')].join(' / '):null);
 adicionarLinha('Limite de saída NVIDIA',d.diagnosticoIA&&d.diagnosticoIA.maxTokensFinal?d.diagnosticoIA.maxTokensFinal+' tokens':null);
 adicionarLinha('Tentativas NVIDIA',d.diagnosticoIA&&d.diagnosticoIA.tentativas?d.diagnosticoIA.tentativas:null);
 adicionarLinha('Beneficiário / favorecido',d.beneficiario);
 adicionarLinha('CPF/CNPJ do beneficiário',d.cpfCnpjBeneficiario);
 adicionarLinha('Pagador',d.pagador);
 adicionarLinha('CPF/CNPJ do pagador',d.cpfCnpjPagador);
 adicionarLinha('Banco emissor (código COMPE)',typeof d.banco==='string'||typeof d.banco==='number'?String(d.banco):(d.banco&&typeof d.banco==='object'?JSON.stringify(d.banco):null));
 adicionarLinha('Valor original / nominal',moeda(d.valorOriginal));
 adicionarLinha('Valor impresso reconhecido pelo OCR',moeda(d.valorLidoOCR));
 adicionarLinha('Data de vencimento',dataBR(d.dataVencimento||d.vencimentoLidoOCR));
 adicionarLinha('Data de emissão',dataBR(d.dataEmissao));
 adicionarLinha('Nosso número',d.nossoNumero);
 adicionarLinha('Número do documento',d.numeroDocumento);
 adicionarLinha('Agência / código do beneficiário',d.agenciaCodigoBeneficiario);
 adicionarLinha('Dias em atraso',d.diasVencidos==null?0:d.diasVencidos);
 adicionarLinha('Juros',moeda(d.juros));
 adicionarLinha('Multa',moeda(d.multa));
 adicionarLinha('Taxa de serviço',moeda(d.taxaServico));
 adicionarLinha('Total atualizado',d.valorFinal==null?'Não calculado: aguardando regras oficiais do beneficiário':moeda(d.valorFinal));
 adicionarLinha('Linha digitável / código identificado',d.codigoRecebido);
 adicionarLinha('Validação dos dígitos',d.codigoValidado?'Dígitos verificadores aprovados':'Não validado ou código não identificado');
 adicionarLinha('Confiança da leitura (NVIDIA)',d.confianca?JSON.stringify(d.confianca):null);
 adicionarLinha('Alertas da leitura',Array.isArray(d.alertas)&&d.alertas.length?d.alertas.join(' | '):null);
 adicionarLinha('Texto completo reconhecido',d.textoCompleto||d.textoReconhecido);
 adicionarLinha('Situação do pagamento','Não pago — a leitura não efetua nem confirma pagamento');
 resultado.classList.remove('oculto');
 setStatus(d.avisoIA||d.avisoCalculo||'Leitura concluída. Confira os dados identificados.');
}
async function testarNvidiaIsolado(file){
 if(!file||!file.type.startsWith('image/')){setStatus('Escolha primeiro a foto da conta ou boleto.');return;}
 const painel=criarPainelProcessamento();
 painel.classList.remove('oculto');
 painel.querySelector('#processamentoErro').hidden=true;
 painel.querySelector('#fecharProcessamento').hidden=true;
 painel.querySelector('#processamentoMensagem').textContent='Teste isolado: enviando a imagem diretamente para a NVIDIA. Nenhum OCR alternativo será chamado.';
 painel.querySelector('#processamentoProgresso').style.width='45%';
 painel.querySelector('#processamentoTexto').textContent='Aguardando resposta direta da NVIDIA...';

 setStatus('Testando a API NVIDIA diretamente, sem fallback...');
 const fd=new FormData();
 fd.append('foto',file,file.name||'documento.jpg');
 try{
  const response=await fetch(apiBase+'/diagnostico-nvidia',{method:'POST',body:fd});
  const data=await response.json().catch(()=>({erro:'O servidor retornou uma resposta que não é JSON.'}));
  mostrarTextoOCR(JSON.stringify(data,null,2));
  const erro=painel.querySelector('#processamentoErro');
  erro.textContent=data.sucesso
   ? 'TESTE NVIDIA APROVADO: a API respondeu e devolveu JSON válido. Nenhum OCR alternativo foi executado.'
   : 'TESTE NVIDIA FALHOU: '+(data.erro||'erro sem descrição')+'. Nenhum OCR alternativo foi executado.';
  erro.hidden=false;
  painel.querySelector('#fecharProcessamento').hidden=false;
  painel.querySelector('#processamentoMensagem').textContent=data.sucesso?'A NVIDIA respondeu diretamente. Confira o diagnóstico e os campos abaixo.':'A falha ocorreu no teste direto da NVIDIA. Confira o diagnóstico técnico abaixo.';
  painel.querySelector('#processamentoProgresso').style.width=data.sucesso?'100%':'0%';
  setStatus(data.sucesso?'NVIDIA respondeu no teste isolado.':'A NVIDIA falhou no teste isolado.');
 }catch(error){
  const erro=painel.querySelector('#processamentoErro');
  erro.textContent='Não foi possível alcançar o endpoint de diagnóstico no Render: '+(error.message||'erro de conexão');
  erro.hidden=false;
  painel.querySelector('#fecharProcessamento').hidden=false;
  painel.querySelector('#processamentoMensagem').textContent='Falha de conexão com o endpoint de diagnóstico.';
  setStatus('Não foi possível conectar ao diagnóstico NVIDIA.');
 }
}
async function processarArquivo(file){
 if(!file||!file.type.startsWith('image/')){setStatus('Selecione uma imagem válida.');return;}
 resultado.classList.add('oculto');ultimoResultado=null;etapaAtual=0;
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 preview.replaceChildren();previewUrl=URL.createObjectURL(file);
 const frame=document.createElement('div');frame.className='scan-frame scan-frame-active';
 const img=document.createElement('img');img.className='scan-image';img.alt='Imagem selecionada do boleto';img.src=previewUrl;
 const laser=document.createElement('span');laser.className='scan-laser';laser.setAttribute('aria-hidden','true');frame.append(img,laser);preview.append(frame);
 const painel=criarPainelProcessamento();
 painel.classList.remove('oculto');
 painel.querySelector('#processamentoErro').hidden=true;
 painel.querySelector('#fecharProcessamento').hidden=true;
 painel.querySelector('#processamentoTexto').textContent='Aguardando início do OCR...';

 try{
  atualizarEtapa(1,'Imagem recebida. Preparando arquivo para leitura...',8);
  await img.decode();
  const codigo=await lerCodigoImagem(img);
  atualizarEtapa(3,'Lendo o documento inteiro em português e inglês...',25);
  let texto='',erroOCR=null;
  try{texto=await reconhecerTexto(file);mostrarTextoOCR(texto);}
  catch(ocrError){erroOCR=ocrError;mostrarTextoOCR('O OCR local não concluiu: '+(ocrError.message||'falha ao carregar o mecanismo de leitura')+'. A imagem original será enviada à inteligência artificial para tentar a leitura.');}
  const candidatos=linhasCandidatas(texto);
  const codigoFinal=codigo||candidatos[0]||'';
  atualizarEtapa(4,'OCR concluído. Enviando imagem e texto para análise visual da NVIDIA...',65);
  const data=await interpretar(codigoFinal,texto,file);
  atualizarEtapa(5,'Análise recebida. Validando e organizando os campos identificados...',92);
  mostrarTextoOCR(data.textoCompleto||data.textoReconhecido||texto||(erroOCR?'A imagem foi enviada à NVIDIA; o OCR local não conseguiu extrair texto.':''));
  mostrar(data);
  atualizarEtapa(5,'Leitura concluída. Confira os campos identificados abaixo.',100);
  painel.classList.add('oculto');

 }catch(e){
  console.error('[Boleto Fácil] Falha na etapa de leitura:',{etapa:etapaAtual,mensagem:e&&e.message,stack:e&&e.stack});
  const erro=painel.querySelector('#processamentoErro');
  erro.textContent=(e&&e.message?e.message:'Não foi possível concluir a leitura.')+' (etapa '+etapaAtual+')';
  erro.hidden=false;
  painel.querySelector('#fecharProcessamento').hidden=false;
  painel.querySelector('#processamentoMensagem').textContent='A leitura foi interrompida. Veja o motivo abaixo.';
  setStatus(e.message||'Não foi possível ler o boleto.');
 }finally{frame.classList.remove('scan-frame-active');}
}
fotoInput.addEventListener('change',()=>processarArquivo(fotoInput.files&&fotoInput.files[0]));
document.getElementById('testarNvidia').addEventListener('click',()=>fotoNvidiaInput.click());
fotoNvidiaInput.addEventListener('change',()=>testarNvidiaIsolado(fotoNvidiaInput.files&&fotoNvidiaInput.files[0]));
document.getElementById('abrirCamera').addEventListener('click',async()=>{
 if(!window.ZXingBrowser){setStatus('Leitor da câmera indisponível. Envie uma foto para tentar a leitura.');return;}
 try{
  ultimoResultado=null;resultado.classList.add('oculto');painelCamera.classList.remove('oculto');
  setStatus('Aponte a câmera para o código de barras do boleto.');
  const reader=new ZXingBrowser.BrowserMultiFormatReader();
  cameraControls=await reader.decodeFromVideoDevice(undefined,video,async result=>{
   if(!result||ultimoResultado)return;
   const code=digitos(result.getText());
   if(![44,47,48].includes(code.length))return;
   ultimoResultado={processando:true};cameraControls&&cameraControls.stop();
   try{mostrar(await interpretar(code));}
   catch(e){ultimoResultado=null;setStatus(e.message||'Não foi possível validar o código.');}
  });
 }catch(_){setStatus('Não foi possível acessar a câmera. Verifique a permissão ou envie uma foto.');}
});
document.getElementById('fecharCamera').addEventListener('click',()=>{
 if(cameraControls)cameraControls.stop();
 cameraControls=null;
 if(video.srcObject&&video.srcObject.getTracks)video.srcObject.getTracks().forEach(t=>t.stop());
 painelCamera.classList.add('oculto');
});
document.getElementById('copiarDados').addEventListener('click',async()=>{
 if(!ultimoResultado||ultimoResultado.processando)return;
 try{await navigator.clipboard.writeText(JSON.stringify(ultimoResultado,null,2));setStatus('Dados técnicos copiados.');}
 catch(_){setStatus('Não foi possível copiar automaticamente neste navegador.');}
});
})();