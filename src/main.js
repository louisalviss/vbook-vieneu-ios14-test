import { phonemizeVietnamese } from './g2p.js';
import * as ort from 'onnxruntime-web';
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
const BASE = import.meta.env.BASE_URL;
const asset = name => new URL(BASE+name,location.origin).href;
ort.env.wasm.wasmPaths = asset('runtime/ort/');
const MODEL_REV='aba295eb96a6fa6003ebe417cc1f2802a7adc1dc';
const modelUrl=name=>'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/'+MODEL_REV+'/'+name+'.onnx';
const $ = q => document.querySelector(q);
const messages = [];
function report(s){messages.push(s);$('#log').textContent=messages.join('\n');console.log('[NanoBrowser]',s);}
window.__nanoProbe = { status:'idle',messages,error:null,features:{} };
if('serviceWorker' in navigator) navigator.serviceWorker.register(asset('sw.js'),{scope:BASE}).catch(e=>console.warn('SW',e));
function tensorF32(arr,dims){return new ort.Tensor('float32',Float32Array.from(arr),dims);}
function idsFromPhonemes(phon, profile) {
  const table=profile.vocab;
  let s=phon;for(const [tag,ch] of Object.entries(profile.emotion_map||{}))s=s.replaceAll(tag,ch);
  return [profile.bos_id,...Array.from(s).filter(ch=>Object.hasOwn(table,ch)).map(ch=>table[ch]),profile.eos_id];
}
function gaussian(n, seed=42) {
  let state = seed >>> 0;
  const random = () => {state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const a = new Float32Array(n);
  for(let i=0;i<n;i+=2){
    let u=Math.max(1e-9,random()),v=random();
    let q=Math.sqrt(-2*Math.log(u)),z=2*Math.PI*v;
    a[i]=q*Math.cos(z);if(i+1<n)a[i+1]=q*Math.sin(z);
  }
  return a;
}
function wavFromF32(data, sampleRate) {
  const buffer=new ArrayBuffer(44+data.length*2),v=new DataView(buffer);
  const string=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  string(0,'RIFF');v.setUint32(4,36+data.length*2,true);string(8,'WAVE');string(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);string(36,'data');v.setUint32(40,data.length*2,true);
  for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,data[i]))*32767),true);
  return new Blob([buffer],{type:'audio/wav'});
}
function decodeB64(s) {
  const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(b,ch=>ch.charCodeAt(0));
}
async function voiceProfile(){
  const stored=localStorage.getItem('vbook-ios14-voice-profile');
  if(stored) return JSON.parse(stored);
  const keyStr=new URLSearchParams(location.hash.slice(1)).get('k');
  if(!keyStr)throw Error('Thiếu khóa giọng. Mở bằng đường dẫn thử nghiệm riêng.');
  const pack=await (await fetch(asset('profile.enc.json'))).json();
  const key=await crypto.subtle.importKey('raw',decodeB64(keyStr),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decodeB64(pack.iv),additionalData:new TextEncoder().encode(pack.aad)},key,decodeB64(pack.ciphertext));
  const data=JSON.parse(new TextDecoder().decode(plain));
  if(!data.voice_speaker||!data.voice_style)throw Error('Profile giọng không hợp lệ.');
  localStorage.setItem('vbook-ios14-voice-profile',JSON.stringify(data));
  return data;
}
async function load(url) {
  const start=performance.now();
  const session=await ort.InferenceSession.create(url,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential'});
  report('loaded '+url.split('/').pop()+' in '+((performance.now()-start)/1000).toFixed(2)+'s');
  return session;
}
async function run() {
  report('starting '+navigator.userAgent);
  try{localStorage.setItem('vbook-ios14-last-step','STARTING');}catch{}
  if('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  window.__nanoProbe.status='loading';
  try{
    const profile=await voiceProfile();
    report('voice profile loaded locally');
    const lexicon=await (await fetch(asset('g2p-lexicon.json'))).json();
    const sentence=$('#sentence').value.trim();
    if(sentence.length>140) throw Error('PoC hiện giới hạn 140 ký tự mỗi lần thử.');
    const {phonemes,spokenTokens}=phonemizeVietnamese(sentence,lexicon);
    report('offline G2P '+spokenTokens+' words: '+phonemes.slice(0,180));
    const sessions={};
    for(const name of ['text_encoder','duration_predictor','vector_estimator','codec_decoder']){
      const url=modelUrl(name);
      report('loading '+name);
      try{localStorage.setItem('vbook-ios14-last-step','loading:'+name);}catch{}
      sessions[name]=await load(url);
      window.__nanoProbe.features[name]=true;
    }
    report('4 graphs loaded, starting inference');
    window.__nanoProbe.status='inferencing';
    const ids=idsFromPhonemes(phonemes,profile),L=ids.length;
    const idsT=new ort.Tensor('int64',BigInt64Array.from(ids.map(BigInt)),[1,L]);
    const style=tensorF32(profile.voice_style,[1,50,256]);
    const spk=tensorF32(profile.voice_speaker,[1,192]);
    const mask=new ort.Tensor('bool',Uint8Array.from(ids.map(x=>x===profile.pad_id?0:1)),[1,L]);
    const t0=performance.now();
    const ctx=(await sessions.text_encoder.run({ids:idsT,style})).ctx;
    report('ctx '+ctx.dims.join(',')+' in '+((performance.now()-t0)/1000).toFixed(2)+'s');
    const duration=(await sessions.duration_predictor.run({ctx,ctx_mask:mask,spk})).log_seconds;
    const secs=Math.min(Math.exp(duration.data[0]),15),frames=Math.max(1,Math.round(secs*profile.fps));
    report('predicted '+secs.toFixed(2)+'s, frames='+frames);
    let x=tensorF32(gaussian(144*frames),[1,144,frames]);
    const nullIDs=new ort.Tensor('int64',BigInt64Array.from([BigInt(profile.bos_id),BigInt(profile.eos_id)]),[1,2]);
    const nctx=(await sessions.text_encoder.run({ids:nullIDs,style:tensorF32(profile.null_style,[1,50,256])})).ctx;
    const nmask=new ort.Tensor('bool',Uint8Array.from([1,1]),[1,2]);
    const nspk=tensorF32(profile.null_speaker,[1,192]),nstyle=tensorF32(profile.null_style,[1,50,256]);
    for(let i=0;i<profile.steps;i++){
      const stepStart=performance.now(),dt=1/profile.steps;
      const t=tensorF32([i*dt],[1]);
      const v=(await sessions.vector_estimator.run({x,t,ctx,ctx_mask:mask,spk,style})).v;
      const vn=(await sessions.vector_estimator.run({x,t,ctx:nctx,ctx_mask:nmask,spk:nspk,style:nstyle})).v;
      const arr=new Float32Array(x.data.length);
      for(let j=0;j<arr.length;j++)arr[j]=x.data[j]+dt*(vn.data[j]+profile.cfg*(v.data[j]-vn.data[j]));
      x=tensorF32(arr,[1,144,frames]);
      if(i===0||i===profile.steps-1)report('flow step '+(i+1)+'/'+profile.steps+' '+((performance.now()-stepStart)/1000).toFixed(2)+'s');
    }
    const audio=(await sessions.codec_decoder.run({x})).wav;
    report('PCM samples '+audio.data.length+', total '+((performance.now()-t0)/1000).toFixed(2)+'s');
    const blob=wavFromF32(audio.data,profile.sample_rate);
    $('#audio').src=URL.createObjectURL(blob);
    window.__nanoProbe.status='pass';window.__nanoProbe.audioBytes=blob.size;
    report('PASS WAV '+blob.size+' bytes');
    try{localStorage.setItem('vbook-ios14-last-step','PASS');}catch{}
  }catch(e){window.__nanoProbe.status='fail';window.__nanoProbe.error=String(e.stack||e);report('FAIL '+String(e.stack||e).slice(0,900));
    try{localStorage.setItem('vbook-ios14-last-step','FAIL '+String(e.message).slice(0,180));}catch{}}
}
$('#run').addEventListener('click',run);
window.__runNano = run;

const getReport=()=>{
 const probe=window.__nanoProbe;
 return JSON.stringify({date:new Date().toISOString(),userAgent:navigator.userAgent,status:probe.status,step:localStorage.getItem('vbook-ios14-last-step'),error:probe.error,
   lastMessages:messages.slice(-38),online:navigator.onLine,voiceLoaded:!!localStorage.getItem('vbook-ios14-voice-profile')},null,2);
};
$('#copyReport').addEventListener('click',async()=>{
 const text=getReport();try{await navigator.clipboard.writeText(text);report('Đã sao chép báo cáo.');}catch(e){$('#reportText').value=text;$('#reportText').style.display='block';}
});
$('#offlineCheck').addEventListener('click',async()=>{
 const names=['text_encoder','duration_predictor','vector_estimator','codec_decoder'];
 const cache=await caches.open('vbook-nano-web-remote-models-v1');
 const result=[];
 for(const n of names){const r=await cache.match(modelUrl(n));result.push(n+': '+(r?'CACHED':'MISSING'));}
 let quota='unknown';
 try{const e=await navigator.storage.estimate();quota=Math.round((e.usage||0)/1048576)+'MB / '+Math.round((e.quota||0)/1048576)+'MB';}catch{}
 $('#checkResult').textContent=result.join(' · ')+'\nBộ nhớ: '+quota+'\nBước gần nhất: '+(localStorage.getItem('vbook-ios14-last-step')||'none');
});
