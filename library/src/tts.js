import { TtsSession, remove } from '@mintplex-labs/piper-tts-web';

const VOICE = 'vi_VN-vais1000-medium';
let session = null;
let pending = null;
export const voiceId = VOICE;
// Update this on every model replacement so old cached WAVs cannot be mistaken for the new voice.
export const modelRevision = 'piper-vais1000-medium-baseline-1';
export async function hasVoice() {
  // The package's `stored()` checks only the .onnx filename. An interrupted
  // download can leave the JSON missing and make offline inference fail.
  try {
    if (!navigator.storage?.getDirectory) return false;
    const root=await navigator.storage.getDirectory();
    const dir=await root.getDirectoryHandle('piper');
    const files=[`${VOICE}.onnx`,`${VOICE}.onnx.json`];
    const [model,config]=await Promise.all(files.map(async name => {
      const handle=await dir.getFileHandle(name);
      return handle.getFile();
    }));
    if(model.size < 55*1024*1024 || config.size < 100) return false;
    try {
      const parsed=JSON.parse(await config.text());
      return Number(parsed?.audio?.sample_rate)>8000 &&
        typeof parsed?.espeak?.voice==='string' &&
        parsed?.inference?.length_scale != null;
    } catch {return false;}
  } catch {return false;}
}
export async function prepareVoice(onProgress=()=>{}) {
  if(session) return session;
  if(pending) return pending;
  if(!navigator.storage?.getDirectory) throw new Error('Trình duyệt chưa hỗ trợ lưu model bằng OPFS.');
  if(!navigator.onLine && !await hasVoice()) throw new Error('Thiếu model hoặc cấu hình. Hãy tải đầy đủ khi có Internet.');
  const path=new URL(`${import.meta.env.BASE_URL}runtime/`,location.origin).href;
  const start=performance.now();
  pending=(async()=>{
    onProgress('Đang nạp giọng đọc và runtime…');
    const instance=await TtsSession.create({
      voiceId:VOICE,
      logger:()=>{},
      wasmPaths:{onnxWasm:`${path}ort/`,piperData:`${path}piper_phonemize.data`,piperWasm:`${path}piper_phonemize.wasm`},
      progress:(evt)=>{
        const pct=evt.total>0?Math.floor(evt.loaded*100/evt.total):null;
        onProgress(`Đang tải model ${pct===null?'…':`${pct}%`} (${(evt.loaded/1048576).toFixed(1)} MB)`);
      }
    });
    onProgress('Đang tạo âm thanh thử để kiểm tra model…');
    const sample=await instance.predict('Xin chào. Đây là bản thử giọng đọc offline.');
    if(!sample || sample.size<1000) throw new Error('Model không tạo được WAV hợp lệ.');
    if(!await hasVoice()) throw new Error('Tạo WAV thành công nhưng model chưa được lưu đầy đủ vào OPFS. Hãy kiểm tra bộ nhớ và tải lại khi có mạng.');
    session=instance;
    onProgress(`Đã tạo WAV thử (${(sample.size/1024).toFixed(0)} KB) sau ${((performance.now()-start)/1000).toFixed(1)} giây. Hãy thử tiếp ở Chế độ máy bay.`);
    return session;
  })();
  try{return await pending;} finally{pending=null;}
}
export async function synthesize(text) {
  const instance=await prepareVoice();
  return instance.predict(text);
}
export async function clearVoice() {
  if(session) throw new Error('Hãy tải lại trang trước khi xóa model đang được sử dụng.');
  await remove(VOICE);
}
