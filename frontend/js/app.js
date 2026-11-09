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
 for(const m of s.matchAll(/(?:\d[\s.-]?){43,47}\d/g)){const d=digitos(m[0]);if([44,47,48].includes(d.length))out.add(d);}
 for(const m of s.matchAll(/\d{44}|\d{47}|\d{48}/g))out.add(m[0]);
 const grupos=s.match(/\d{4,}/g)||[];
 for(let i=0;i<grupos.length;i++){let junc='';for(let j=i;j<grupos.length&&j<i+8;j++){junc+=grupos[j];if([44,47,48].includes(junc.length))out.add(junc);if(junc.length>=48)break;}}
 return [...out].sort((a,b)=>({44:0,47:1,48:2}[a.length]-({44:0,47:1,48:2}[b.length])));
}
async function reconhecerTexto(file){
 if(!window.Tesseract||!window.Tesseract.recognize)throw new Error('O mecanismo OCR local não carregou.');
 const r=await window.Tesseract.recognize(file,'por+eng');
 return r&&r.data&&r.data.text?r.data.text:'';
}
async function lerImagem(file,img){
 if(window.ZXingBrowser&&window.ZXingBrowser.BrowserMultiFormatReader){
  try{
   const reader=new ZXingBrowser.BrowserMultiFormatReader();
   const r=await reader.decodeFromImageElement(img);
   const code=digitos(r&&r.getText?r.getText():'');
   if([44,47,48].includes(code.length))return{candidates:[code],texto:''};
  }catch(_){}
 }
 setStatus('Reconhecendo os textos e os dados impressos do boleto…');
 let texto='';
 try{texto=await reconhecerTexto(file);}catch(e){if(!file)throw e;}
 return{candidates:linhasCandidatas(texto),texto};
}
async function interpretar(codigo,textoOCR='',file=null){
 const fd=new FormData();
 fd.append('codigoBarras',codigo||'');
 fd.append('textoOCR',textoOCR||'');
 if(file)fd.append('foto',file,file.name||'boleto.jpg');
 let response;
 try{response=await fetch(apiBase+'/ler',{method:'POST',body:fd});}
 catch(_){throw new Error('Não foi possível conectar ao backend no Render.');}
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
 ultimoResultado=d;dadosEl.replaceChildren();
 const tipo=String(d.tipoBoleto||'').toLowerCase();
 adicionarLinha('Tipo de documento',tipo==='arrecadacao'?'Arrecadação / convênio':tipo==='bancario'?'Boleto bancário':d.tipoBoleto);
 adicionarLinha('Motor de leitura',d.motorLeitura);
 adicionarLinha('Beneficiário / favorecido',d.beneficiario);
 adicionarLinha('CPF/CNPJ do beneficiário',d.cpfCnpjBeneficiario);
 adicionarLinha('Pagador',d.pagador);
 adicionarLinha('CPF/CNPJ do pagador',d.cpfCnpjPagador);
 adicionarLinha('Banco emissor (código COMPE)',typeof d.banco==='object'?d.banco.codigo:d.banco);
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
async function processarArquivo(file){
 if(!file||!file.type.startsWith('image/')){setStatus('Selecione uma imagem válida.');return;}
 resultado.classList.add('oculto');ultimoResultado=null;
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 preview.replaceChildren();previewUrl=URL.createObjectURL(file);
 const frame=document.createElement('div');frame.className='scan-frame scan-frame-active';
 const img=document.createElement('img');img.className='scan-image';img.alt='Imagem selecionada do boleto';img.src=previewUrl;
 const laser=document.createElement('span');laser.className='scan-laser';laser.setAttribute('aria-hidden','true');frame.append(img,laser);preview.append(frame);
 try{
  setStatus('Preparando a imagem para leitura automática…');
  await img.decode();
  const leitura=await lerImagem(file,img);
  setStatus('Enviando a imagem para interpretação e conferência dos dados…');
  const data=await interpretar(leitura.candidates[0]||'',leitura.texto,file);
  mostrar(data);
 }catch(e){setStatus(e.message||'Não foi possível ler o boleto.');}
 finally{frame.classList.remove('scan-frame-active');}
}
fotoInput.addEventListener('change',()=>processarArquivo(fotoInput.files&&fotoInput.files[0]));
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