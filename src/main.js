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
const MODEL_SIZES={text_encoder:26519943,duration_predictor:727809,vector_estimator:155132418,codec_decoder:99319941};
const MODEL_NAMES=Object.keys(MODEL_SIZES);
const TOTAL_MODEL_BYTES=Object.values(MODEL_SIZES).reduce((a,b)=>a+b,0);
const MODEL_CACHE='vbook-nano-web-remote-models-v1';
let busy=false, cachedBytes=0, lastProgressTime=0;
const humanBytes=n=>(n/1048576).toFixed(1)+' MB';
function status(stage,detail='',pct=null){
 const a=$('#progressStage'),b=$('#progressDetail'),c=$('#progressBar'),d=$('#progressPercent');
 if(a)a.textContent=stage;
 if(b)b.textContent=detail;
 if(c&&pct!==null&&Number.isFinite(pct))c.value=Math.max(0,Math.min(100,pct));
 if(d&&pct!==null&&Number.isFinite(pct))d.textContent=Math.round(pct)+'%';
 if(window.__nanoProbe)window.__nanoProbe.stage=stage;
 try{localStorage.setItem('vbook-ios14-last-step',stage+': '+detail.slice(0,100));}catch{}
}
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
async function ensureModel(name,index){
 const url=modelUrl(name),cache=await caches.open(MODEL_CACHE);
 const prior=await cache.match(url,{ignoreVary:true});
 const prefix='Model '+index+'/'+MODEL_NAMES.length+': '+name;
 if(prior){
   cachedBytes+=MODEL_SIZES[name];
   status(prefix+' (đã lưu)',humanBytes(cachedBytes)+' / '+humanBytes(TOTAL_MODEL_BYTES),cachedBytes/TOTAL_MODEL_BYTES*85);
   report('cache hit '+name); return;
 }
 status('Đang kết nối tải '+prefix,'Chờ phản hồi máy chủ; tổng tải 281,7 MB',cachedBytes/TOTAL_MODEL_BYTES*85);
 await paint();
 let response;
 try{response=await fetch(url,{mode:'cors'});}
 catch(e){throw new Error('Không kết nối được nơi lưu model '+name+': '+e.message);}
 if(!response.ok)throw new Error('Không tải được '+name+': HTTP '+response.status);
 if(!response.body||typeof response.body.getReader!=='function')throw new Error('Trình duyệt không hỗ trợ tải theo luồng cho '+name);
 const reader=response.body.getReader();
 let received=0, last=performance.now();
 const stream=new ReadableStream({
   async pull(controller){
     const part=await reader.read();
     if(part.done){controller.close();return;}
     received+=part.value.byteLength;
     controller.enqueue(part.value);
     const now=performance.now();
     if(now-last>140){
       status('Đang tải '+prefix,humanBytes(received)+' / '+humanBytes(MODEL_SIZES[name])+' · Tổng '+humanBytes(cachedBytes+received)+' / '+humanBytes(TOTAL_MODEL_BYTES),Math.min(85,(cachedBytes+received)/TOTAL_MODEL_BYTES*85));
       last=now;
     }
   },
   cancel(reason){return reader.cancel(reason);}
 });
 try{
   await cache.put(url,new Response(stream,{status:200,headers:{'Content-Type':'application/octet-stream'}}));
 }catch(e){
   throw new Error('Không lưu được model '+name+' vào bộ nhớ offline: '+e.message);
 }
 if(received<MODEL_SIZES[name]*0.98)throw new Error('Tải thiếu dữ liệu '+name+': '+humanBytes(received));
 cachedBytes+=received;
 status('Đã lưu '+prefix,humanBytes(cachedBytes)+' / '+humanBytes(TOTAL_MODEL_BYTES),Math.min(85,cachedBytes/TOTAL_MODEL_BYTES*85));
 report('saved '+name+' '+humanBytes(received));
}

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
  if(busy)return;
  busy=true;cachedBytes=0;lastProgressTime=0;
  const runBtn=$('#run');
  runBtn.disabled=true;runBtn.textContent='Đang tải / xử lý…';
  window.__nanoProbe.status='loading';window.__nanoProbe.error=null;window.__nanoProbe.features={};
  status('Đã nhận lệnh tải','Đang khởi động engine; giao diện sẽ cập nhật từng bước…',0);
  report('starting '+navigator.userAgent);
  await paint();
  try{
    status('Đang mở profile giọng','Kiểm tra khóa mở giọng và cache cục bộ…',1);
    const profile=await voiceProfile();
    report('voice profile loaded locally');
    status('Profile giọng sẵn sàng','Đang nạp bộ phiên âm tiếng Việt…',2);
    if('serviceWorker' in navigator){
      status('Kiểm tra ứng dụng offline','Đang kích hoạt bộ lưu offline (tối đa 30 giây)…',3);
      try{
        await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service Worker không sẵn sàng')),30000))]);
        report('service worker ready');
      }catch(e){throw new Error('Không kích hoạt được lưu offline: '+e.message+'. Hãy tải lại trang.');}
    }
    const lexicon=await (await fetch(asset('g2p-lexicon.json'))).json();
    const sentence=$('#sentence').value.trim();
    if(sentence.length>140) throw Error('PoC hiện giới hạn 140 ký tự mỗi lần thử.');
    const {phonemes,spokenTokens}=phonemizeVietnamese(sentence,lexicon);
    report('offline G2P '+spokenTokens+' words: '+phonemes.slice(0,180));
    for(let i=0;i<MODEL_NAMES.length;i++)await ensureModel(MODEL_NAMES[i],i+1);
    status('Model đã lưu đủ','Đang khởi tạo bộ tổng hợp ONNX từ model offline…',86);
    const sessions={};
    for(let i=0;i<MODEL_NAMES.length;i++){
      const name=MODEL_NAMES[i],url=modelUrl(name);
      status('Nạp model '+(i+1)+'/4: '+name,'Đã tải xong; đang chuẩn bị bộ nhớ tổng hợp…',86+i*2);
      report('loading '+name);
      await paint();
      sessions[name]=await load(url);
      window.__nanoProbe.features[name]=true;
    }
    report('4 graphs loaded, starting inference');
    status('Đang tổng hợp giọng','Thực thi ONNX trên thiết bị; bước 0/'+profile.steps,94);
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
      status('Đang tạo tiếng nói','Bước '+(i+1)+'/'+profile.steps+' · Đang xử lý âm thanh…',94+(i+1)/profile.steps*5);
      if(i===0||i===profile.steps-1)report('flow step '+(i+1)+'/'+profile.steps+' '+((performance.now()-stepStart)/1000).toFixed(2)+'s');
    }
    const audio=(await sessions.codec_decoder.run({x})).wav;
    report('PCM samples '+audio.data.length+', total '+((performance.now()-t0)/1000).toFixed(2)+'s');
    const blob=wavFromF32(audio.data,profile.sample_rate);
    $('#audio').src=URL.createObjectURL(blob);
    window.__nanoProbe.status='pass';window.__nanoProbe.audioBytes=blob.size;
    report('PASS WAV '+blob.size+' bytes');
    status('PASS — Đã tạo giọng','WAV '+Math.round(blob.size/1024)+' KB · nhấn nút phát ở trên để nghe.',100);
    try{localStorage.setItem('vbook-ios14-last-step','PASS');}catch{}
  }catch(e){
    window.__nanoProbe.status='fail';window.__nanoProbe.error=String(e.stack||e);
    report('FAIL '+String(e.stack||e).slice(0,900));
    status('Lỗi — không thể tiếp tục',String(e.message||e).slice(0,450),null);
  }finally{
    busy=false;runBtn.disabled=false;runBtn.textContent='Tải model & tạo WAV';
  }
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
