(() => {
'use strict';
const apiBase='https://boleto-facil-nmbd.onrender.com/api/boleto';
const fotoInput=document.getElementById('foto'),statusEl=document.getElementById('status'),preview=document.getElementById('preview'),resultado=document.getElementById('resultado'),dadosEl=document.getElementById('dadosBoleto'),painelCamera=document.getElementById('painelCamera'),video=document.getElementById('videoCamera');
let ultimoResultado=null,cameraControls=null,previewUrl=null;
const digitos=v=>String(v||'').replace(/\D/g,'');
const moeda=v=>v==null||v===''?null:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const setStatus=m=>{statusEl.textContent=m;};
function linhasCandidatas(texto){
 const s=String(texto||''),out=new Set();
 for(const m of s.matchAll(/(?:\d[\s.\-]?){43,47}\d/g)){const d=digitos(m[0]);if([44,47,48].includes(d.length))out.add(d);}
 for(const m of s.matchAll(/\d{44}|\d{47}|\d{48}/g))out.add(m[0]);
 const grupos=s.match(/\d{4,}/g)||[];
 for(let i=0;i<grupos.length;i++){let junc='';for(let j=i;j<grupos.length&&j<i+8;j++){junc+=grupos[j];if([44,47,48].includes(junc.length))out.add(junc);if(junc.length>=48)break;}}
 return [...out].sort((a,b)=>({44:0,47:1,48:2}[a.length]-({44:0,47:1,48:2}[b.length])));
}
async function reconhecerTexto(file){
 if(!window.Tesseract?.recognize)throw new Error('O mecanismo OCR não carregou. Atualize a página e tente novamente.');
 const r=await window.Tesseract.recognize(file,'por+eng');return r?.data?.text||'';
}
async function lerImagem(file,img){
 if(window.ZXingBrowser?.BrowserMultiFormatReader){try{const reader=new ZXingBrowser.BrowserMultiFormatReader();const r=await reader.decodeFromImageElement(img);const code=digitos(r?.getText?.());if([44,47,48].includes(code.length))return{candidates:[code],texto:''};}catch(_){}}
 setStatus('Aplicando reconhecimento OCR na imagem do boleto…');
 const texto=await reconhecerTexto(file),candidates=linhasCandidatas(texto);
 if(!candidates.length)throw new Error('Não identifiquei os 44/47 dígitos. Envie uma foto nítida e sem cortes, mostrando a linha digitável ou o código de barras.');
 return{candidates,texto};
}
async function interpretar(codigo,textoOCR=''){
 const fd=new FormData();fd.append('codigoBarras',codigo);fd.append('textoOCR',textoOCR);
 let response;try{response=await fetch(apiBase+'/ler',{method:'POST',body:fd});}catch(_){throw new Error('Não foi possível conectar ao backend no Render. O servidor de leitura está indisponível.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.erro||'Falha no servidor de leitura (HTTP '+response.status+').');
 return data;
}
function adicionarLinha(label,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value==null||value===''?'Não identificado nesta imagem':String(value);dadosEl.append(dt,dd);}
function dataBR(v){if(!v)return null;const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:v;}
function mostrar(d){
 ultimoResultado=d;dadosEl.replaceChildren();
 adicionarLinha('Tipo de boleto',d.tipoBoleto==='arrecadacao'?'Arrecadação / convênio':'Bancário');
 adicionarLinha('Banco emissor (código COMPE)',typeof d.banco==='object'?d.banco?.codigo:d.banco);
 adicionarLinha('Beneficiário / favorecido (OCR)',d.beneficiario);
 adicionarLinha('CPF/CNPJ identificado (OCR)',d.cpfCnpjBeneficiario);
 adicionarLinha('Valor original do boleto',moeda(d.valorOriginal));
 adicionarLinha('Valor impresso reconhecido por OCR',moeda(d.valorLidoOCR));
 adicionarLinha('Vencimento',dataBR(d.dataVencimento||d.vencimentoLidoOCR));
 adicionarLinha('Dias em atraso',d.diasVencidos??0);
 adicionarLinha('Juros calculados',moeda(d.juros??0));
 adicionarLinha('Multa calculada',moeda(d.multa??0));
 adicionarLinha('Taxa de serviço',moeda(d.taxaServico??0));
 adicionarLinha('VALOR TOTAL ESTIMADO',moeda(d.valorFinal));
 adicionarLinha('Validação do código',d.pagamentoHabilitado===false?'Validação específica do convênio pendente':'Dígitos verificadores aprovados');
 adicionarLinha('Situação do pagamento','Não pago — a leitura não efetua pagamento');
 adicionarLinha('Código identificado',d.codigoRecebido||d.codigoBarras);
 resultado.classList.remove('oculto');setStatus(d.avisoCalculo||'Leitura concluída. Confira os dados extraídos.');
}
async function processarArquivo(file){
 if(!file||!file.type.startsWith('image/')){setStatus('Selecione uma imagem válida.');return;}
 resultado.classList.add('oculto');ultimoResultado=null;if(previewUrl)URL.revokeObjectURL(previewUrl);preview.replaceChildren();previewUrl=URL.createObjectURL(file);
 const frame=document.createElement('div');frame.className='scan-frame scan-frame-active';
 const img=document.createElement('img');img.className='scan-image';img.alt='Imagem selecionada do boleto';img.src=previewUrl;
 const laser=document.createElement('span');laser.className='scan-laser';laser.setAttribute('aria-hidden','true');frame.append(img,laser);preview.append(frame);
 try{
  setStatus('Preparando a imagem para leitura automática…');await img.decode();
  const leitura=await lerImagem(file,img);let erro;
  for(const code of leitura.candidates){try{setStatus('Código encontrado. Validando os dígitos e calculando os valores…');const data=await interpretar(code,leitura.texto);mostrar(data);return;}catch(e){erro=e;if(/conectar ao backend|HTTP 5\d\d|servidor de leitura/i.test(e.message))throw e;}}
  throw erro||new Error('O código foi localizado, mas não passou na validação.');
 }catch(e){setStatus(e.message||'Não foi possível ler o boleto.');}finally{frame.classList.remove('scan-frame-active');}
}
fotoInput.addEventListener('change',()=>processarArquivo(fotoInput.files?.[0]));
document.getElementById('abrirCamera').addEventListener('click',async()=>{
 if(!window.ZXingBrowser){setStatus('Leitor da câmera indisponível. Envie uma foto para tentar a leitura por OCR.');return;}
 try{ultimoResultado=null;resultado.classList.add('oculto');painelCamera.classList.remove('oculto');setStatus('Aponte a câmera para o código de barras do boleto.');
 const reader=new ZXingBrowser.BrowserMultiFormatReader();cameraControls=await reader.decodeFromVideoDevice(undefined,video,async result=>{
  if(!result||ultimoResultado)return;const code=digitos(result.getText());if(![44,47,48].includes(code.length))return;ultimoResultado={processando:true};cameraControls?.stop();
  try{mostrar(await interpretar(code));}catch(e){ultimoResultado=null;setStatus(e.message||'Não foi possível validar o código.');}
 });}catch(_){setStatus('Não foi possível acessar a câmera. Verifique a permissão ou envie uma foto.');}
});
document.getElementById('fecharCamera').addEventListener('click',()=>{cameraControls?.stop();cameraControls=null;video.srcObject?.getTracks?.().forEach(t=>t.stop());painelCamera.classList.add('oculto');});
document.getElementById('copiarDados').addEventListener('click',async()=>{if(!ultimoResultado||ultimoResultado.processando)return;try{await navigator.clipboard.writeText(JSON.stringify(ultimoResultado,null,2));setStatus('Dados técnicos copiados.');}catch(_){setStatus('Não foi possível copiar automaticamente neste navegador.');}});
})();