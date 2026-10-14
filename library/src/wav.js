// Concatenate local Piper PCM WAV segments into a single audio file.
// A single media source avoids needing JavaScript to wake for every sentence
// while the screen is locked. All processing happens on the device.
function parseWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error('Đoạn âm thanh không phải WAV hợp lệ.');
  }
  let pos = 12, format = null, pcm = null;
  while (pos + 8 <= bytes.byteLength) {
    const type = view.getUint32(pos, false);
    const size = view.getUint32(pos + 4, true);
    const start = pos + 8;
    if (size > bytes.byteLength - start) throw new Error('WAV bị cắt giữa chừng.');
    if (type === 0x666d7420) {
      if (size < 16) throw new Error('WAV thiếu định dạng.');
      format = {codec:view.getUint16(start, true), channels:view.getUint16(start+2,true), rate:view.getUint32(start+4,true), bits:view.getUint16(start+14,true)};
    }
    if (type === 0x64617461) pcm = bytes.subarray(start, start+size);
    pos = start + size + (size & 1);
  }
  if (!format || !pcm || format.codec !== 1 || format.channels !== 1 || format.bits !== 16 || !format.rate || pcm.byteLength%2) {
    throw new Error('Chỉ hỗ trợ WAV PCM 16-bit mono từ Piper.');
  }
  return {rate:format.rate, pcm};
}
export async function combineWav(blobs, pauseMs = 90) {
  if (!Array.isArray(blobs) || !blobs.length) throw new Error('Không có âm thanh để ghép.');
  const pieces=[];let rate=0,total=0;
  for (const blob of blobs) {
    const parsed=parseWav(new Uint8Array(await blob.arrayBuffer()));
    if (rate && parsed.rate!==rate) throw new Error('Các WAV có sample rate khác nhau.');
    rate=parsed.rate;pieces.push(parsed.pcm);
    total+=parsed.pcm.byteLength;
  }
  const silenceBytes=Math.round(rate*pauseMs/1000)*2;
  total+=(pieces.length-1)*silenceBytes;
  if (total > 128*1024*1024) throw new Error('Chương quá dài để ghép thành WAV trên iPhone.');
  const out=new Uint8Array(44+total), view=new DataView(out.buffer);
  view.setUint32(0,0x52494646,false);view.setUint32(4,36+total,true);
  view.setUint32(8,0x57415645,false);view.setUint32(12,0x666d7420,false);
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);
  view.setUint32(36,0x64617461,false);view.setUint32(40,total,true);
  let pos=44;
  for(let i=0;i<pieces.length;i++){
    out.set(pieces[i],pos);pos+=pieces[i].byteLength;
    if(i<pieces.length-1)pos+=silenceBytes;
  }
  return new Blob([out],{type:'audio/wav'});
}
