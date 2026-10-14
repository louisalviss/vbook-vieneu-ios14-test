// Offline readiness is a local verification only. It makes no network requests.
// A PASS still needs a real airplane-mode inference test on iPhone.
export const MAX_EXPECTED_RUNTIME_FILES = 40;
export async function offlineReadiness({hasVoice, env=globalThis,basePath='/'}={}) {
  const prefix=basePath.endsWith('/')?basePath:basePath+'/';
  const result={secure:false, serviceWorker:false, shell:false, model:false, runtime:false,
    missing:[], bytes:0, quota:0, modelBytes:null, detail:''};
  result.secure=Boolean(env.isSecureContext);
  result.serviceWorker=Boolean(env.navigator?.serviceWorker?.controller);
  try {result.model=Boolean(await hasVoice());}catch{result.model=false;}
  try {
    const estimate=await env.navigator?.storage?.estimate?.();
    result.bytes=Number(estimate?.usage||0);result.quota=Number(estimate?.quota||0);
  } catch {}
  if(!env.caches?.match || !result.secure) {result.detail='Cache Storage chưa có hoặc URL không an toàn.';return result;}
  const shell=await env.caches.match(prefix+'index.html',{ignoreSearch:true});
  result.shell=Boolean(shell);
  // Read a local cache entry, not fetch('/runtime/manifest.json'), to avoid a
  // false PASS from a successful request that used the network.
  const cachedManifest=await env.caches.match(prefix+'runtime/manifest.json',{ignoreSearch:true});
  if(!cachedManifest){result.missing.push('/runtime/manifest.json');return result;}
  let manifest;
  try {manifest=await cachedManifest.json();}catch {result.detail='Manifest offline không đọc được.';return result;}
  if(manifest?.schema!==1 || !Array.isArray(manifest.files) ||
    manifest.files.length<3 || manifest.files.length>MAX_EXPECTED_RUNTIME_FILES ||
    !manifest.files.some(x=>x.path==='/runtime/piper_phonemize.wasm') ||
    !manifest.files.some(x=>x.path==='/runtime/piper_phonemize.data') ||
    !manifest.files.some(x=>x.path.startsWith('/runtime/ort/') && x.path.endsWith('.wasm'))) {
    result.detail='Manifest runtime thiếu hoặc không hợp lệ.';return result;
  }
  for(const entry of manifest.files) {
    if(typeof entry?.path!=='string' || !/^\/runtime\/[a-zA-Z0-9_.\/-]+$/.test(entry.path) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes<10000) {
      result.detail='Manifest chứa đường dẫn hoặc dung lượng không hợp lệ.';return result;
    }
    const hit=await env.caches.match(prefix+entry.path.slice(1),{ignoreSearch:true});
    if(!hit)result.missing.push(entry.path);
  }
  result.runtime=result.missing.length===0;
  return result;
}
export function formatOfflineReport(r){
  const mark=v=>v?'PASS':'THIẾU';
  const lines=[`HTTPS: ${mark(r.secure)}`,`Service Worker điều khiển trang: ${mark(r.serviceWorker)}`,
    `Giao diện được lưu: ${mark(r.shell)}`,`Model ONNX + cấu hình: ${mark(r.model)}`,
    `Toàn bộ WASM + phonemizer: ${mark(r.runtime)}`];
  if(r.bytes)lines.push(`Đang dùng: ${(r.bytes/1048576).toFixed(1)} MB`);
  if(r.quota)lines.push(`Giới hạn trình duyệt ước tính: ${(r.quota/1048576).toFixed(0)} MB`);
  if(r.missing?.length)lines.push(`Thiếu: ${r.missing.slice(0,4).join(', ')}${r.missing.length>4?' …':''}`);
  if(r.detail)lines.push(`Ghi chú: ${r.detail}`);
  lines.push(r.secure && r.serviceWorker && r.shell && r.model && r.runtime
    ? 'Gói đã có đủ tài nguyên. Bật Chế độ máy bay, tải lại trang và thử phát WAV để nghiệm thu.'
    : 'Chưa đủ điều kiện offline. Bật mạng, tải lại ứng dụng, chuẩn bị model rồi kiểm tra lại.');
  return lines.join('\n');
}
