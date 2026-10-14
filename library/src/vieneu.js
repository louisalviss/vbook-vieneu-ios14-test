import * as ort from 'onnxruntime-web';
import { phonemizeVietnamese } from './vieneu-g2p.js';

// VieNeu v3 Nano, isolated to the reader staging, never overriding Piper.
export const voiceId='vieneu-nano-namminh-like';
export const modelRevision='vieneu-v3-nano-aba295e-16steps';
export const MODEL_NAMES=['text_encoder','duration_predictor','vector_estimator','codec_decoder'];
const MODEL_REV='aba295eb96a6fa6003ebe417cc1f2802a7adc1dc';
const MODEL_PREFIX='https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/'+MODEL_REV+'/';
const MODEL_CACHE='vbook-nano-web-remote-models-v1'; // shared across GitHub Pages paths
const MODEL_SIZES=[26519943,727809,155132418,99319941];
const BASE=import.meta.env.BASE_URL;
const asset=name=>new URL(BASE+name,location.origin).href;
const stageAsset=name=>new URL(BASE+'../'+name,location.origin).href;
const modelUrl=name=>MODEL_PREFIX+name+'.onnx';
let profile=null,lexicon=null,sessions=null,pending=null;
const MB=n=>(n/1048576).toFixed(1)+' MB';
function progress(cb,message){try{cb(message);}catch{}}

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


async function localAsset(url) {
  const cached=await caches.match(url,{ignoreSearch:true,ignoreVary:true});
  if(cached)return cached;
  const response=await fetch(url);
  if(!response.ok)throw Error('Không tải được dữ liệu cần thiết: HTTP '+response.status);
  const cache=await caches.open('vbook-vieneu-library-assets-v1');
  await cache.put(url,response.clone());
  return response;
}
async function getProfile() {
  if(profile)return profile;
  const cached=localStorage.getItem('vbook-ios14-voice-profile');
  if(cached) {profile=JSON.parse(cached);return profile;}
  const key=new URLSearchParams(location.hash.slice(1)).get('k');
  if(!key)throw Error('VieNeu chưa được mở khóa. Nhấn "Mở giọng VieNeu" trong Cài đặt, thử giọng ở trang trước, rồi quay lại Library.');
  const pack=await (await localAsset(stageAsset('profile.enc.json'))).json();
  const imported=await crypto.subtle.importKey('raw',decodeB64(key),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decodeB64(pack.iv),additionalData:new TextEncoder().encode(pack.aad)},imported,decodeB64(pack.ciphertext));
  profile=JSON.parse(new TextDecoder().decode(plain));
  if(!profile.voice_style||!profile.voice_speaker)throw Error('Profile VieNeu không hợp lệ.');
  localStorage.setItem('vbook-ios14-voice-profile',JSON.stringify(profile));
  return profile;
}
async function getLexicon(){
  if(lexicon)return lexicon;
  lexicon=await (await localAsset(stageAsset('g2p-lexicon.json'))).json();
  return lexicon;
}
export async function hasVoice(){
  try{
    if(!localStorage.getItem('vbook-ios14-voice-profile')&&!profile)return false;
    const cache=await caches.open(MODEL_CACHE);
    const results=await Promise.all(MODEL_NAMES.map(n=>cache.match(modelUrl(n),{ignoreVary:true})));
    return results.every(Boolean);
  }catch{return false;}
}
async function downloadModel(name,index,cb){
  const cache=await caches.open(MODEL_CACHE);
  const url=modelUrl(name);
  if(await cache.match(url,{ignoreVary:true})){
    progress(cb,'VieNeu: model '+index+'/4 '+name+' đã lưu; sử dụng lại bộ nhớ.');
    return;
  }
  progress(cb,'VieNeu: kết nối tải model '+index+'/4 '+name+' …');
  const response=await fetch(url,{mode:'cors'});
  if(!response.ok)throw Error('Không tải được '+name+': HTTP '+response.status);
  if(!response.body?.getReader)throw Error('Trình duyệt không hỗ trợ tải model theo luồng.');
  const reader=response.body.getReader();
  let count=0,last=0;
  const stream=new ReadableStream({
    async pull(controller) {
      const piece=await reader.read();
      if(piece.done){controller.close();return;}
      count+=piece.value.byteLength;
      controller.enqueue(piece.value);
      if(performance.now()-last>180){
        progress(cb,'VieNeu: '+name+' '+MB(count)+' / '+MB(MODEL_SIZES[index-1])+' (model '+index+'/4)');
        last=performance.now();
      }
    },
    cancel(reason){return reader.cancel(reason);}
  });
  await cache.put(url,new Response(stream,{headers:{'Content-Type':'application/octet-stream'}}));
  if(count<MODEL_SIZES[index-1]*0.98)throw Error('Model '+name+' tải chưa đủ.');
  progress(cb,'VieNeu: đã lưu '+name+' ('+MB(count)+').');
}
async function loadModel(name,index,cb){
  const cache=await caches.open(MODEL_CACHE);
  const response=await cache.match(modelUrl(name),{ignoreVary:true});
  if(!response)throw Error('Chưa có model '+name+' trong cache offline.');
  progress(cb,'VieNeu: nạp model '+index+'/4 '+name+' vào RAM…');
  const blobUrl=URL.createObjectURL(await response.blob());
  try{
    return await ort.InferenceSession.create(blobUrl,{
      executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential'
    });
  }finally{URL.revokeObjectURL(blobUrl);}
}
export async function prepareVoice(onProgress=()=>{}){
  if(sessions)return sessions;
  if(pending)return pending;
  pending=(async()=>{
    const pg=await getProfile();
    await getLexicon();
    ort.env.wasm.numThreads=1;
    ort.env.wasm.simd=true;
    ort.env.wasm.wasmPaths=asset('runtime/ort/');
    for(let i=0;i<MODEL_NAMES.length;i++)
      await downloadModel(MODEL_NAMES[i],i+1,onProgress);
    const opened={};
    for(let i=0;i<MODEL_NAMES.length;i++)
      opened[MODEL_NAMES[i]]=await loadModel(MODEL_NAMES[i],i+1,onProgress);
    sessions=opened;
    progress(onProgress,'VieNeu: 4 model đã nạp. Có thể tổng hợp giọng offline.');
    return sessions;
  })();
  try{return await pending;}finally{pending=null;}
}
export async function synthesize(raw,onProgress=()=>{}){
  await prepareVoice(onProgress);
  const p=await getProfile();
  const {phonemes}=phonemizeVietnamese(raw,await getLexicon());
  const ids=idsFromPhonemes(phonemes,p),L=ids.length;
  const idsT=new ort.Tensor('int64',BigInt64Array.from(ids.map(BigInt)),[1,L]);
  const style=tensorF32(p.voice_style,[1,50,256]);
  const spk=tensorF32(p.voice_speaker,[1,192]);
  const mask=new ort.Tensor('bool',Uint8Array.from(ids.map(x=>x===p.pad_id?0:1)),[1,L]);
  const ctx=(await sessions.text_encoder.run({ids:idsT,style})).ctx;
  const duration=(await sessions.duration_predictor.run({ctx,ctx_mask:mask,spk})).log_seconds;
  const seconds=Math.min(Math.exp(duration.data[0]),15);
  const frames=Math.max(1,Math.round(seconds*p.fps));
  let x=tensorF32(gaussian(144*frames),[1,144,frames]);
  const nullIDs=new ort.Tensor('int64',BigInt64Array.from([BigInt(p.bos_id),BigInt(p.eos_id)]),[1,2]);
  const nctx=(await sessions.text_encoder.run({ids:nullIDs,style:tensorF32(p.null_style,[1,50,256])})).ctx;
  const nmask=new ort.Tensor('bool',Uint8Array.from([1,1]),[1,2]);
  const nspk=tensorF32(p.null_speaker,[1,192]),nstyle=tensorF32(p.null_style,[1,50,256]);
  for(let i=0;i<p.steps;i++){
    const dt=1/p.steps,t=tensorF32([i*dt],[1]);
    const v=(await sessions.vector_estimator.run({x,t,ctx,ctx_mask:mask,spk,style})).v;
    const vn=(await sessions.vector_estimator.run({x,t,ctx:nctx,ctx_mask:nmask,spk:nspk,style:nstyle})).v;
    const arr=new Float32Array(x.data.length);
    for(let j=0;j<arr.length;j++)
      arr[j]=x.data[j]+dt*(vn.data[j]+p.cfg*(v.data[j]-vn.data[j]));
    x=tensorF32(arr,[1,144,frames]);
    if(i===0||i===p.steps-1||(i+1)%4===0)
      progress(onProgress,'VieNeu: tổng hợp '+(i+1)+'/'+p.steps+' bước…');
  }
  const audio=(await sessions.codec_decoder.run({x})).wav;
  return wavFromF32(audio.data,p.sample_rate);
}
export async function clearVoice(){
  if(sessions||pending)throw Error('VieNeu đang nạp trong RAM. Đóng toàn bộ tab Library, mở lại rồi xóa.');
  await caches.delete(MODEL_CACHE);
}
