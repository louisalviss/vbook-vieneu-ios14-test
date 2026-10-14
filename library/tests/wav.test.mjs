import test from 'node:test';
import assert from 'node:assert/strict';
import { combineWav } from '../src/wav.js';
function wav(samples, rate=22050) {
  const arr=new Uint8Array(44+samples.length*2), v=new DataView(arr.buffer);
  v.setUint32(0,0x52494646,false);v.setUint32(4,arr.length-8,true);
  v.setUint32(8,0x57415645,false);v.setUint32(12,0x666d7420,false);
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);
  v.setUint16(34,16,true);v.setUint32(36,0x64617461,false);v.setUint32(40,samples.length*2,true);
  samples.forEach((n,i)=>v.setInt16(44+i*2,n,true));
  return new Blob([arr],{type:'audio/wav'});
}
test('joins two PCM segments and adds silence without changing samples',async()=>{
  const output=await combineWav([wav([100,-100]),wav([200,-200])],100);
  const a=new Uint8Array(await output.arrayBuffer()),v=new DataView(a.buffer);
  assert.equal(output.type,'audio/wav');
  assert.equal(v.getUint32(24,true),22050);
  assert.equal(v.getUint32(40,true),8+4410);
  assert.equal(v.getInt16(44,true),100);
  assert.equal(v.getInt16(46,true),-100);
  assert.equal(v.getInt16(44+4+4410,true),200);
  assert.equal(v.getInt16(44+6+4410,true),-200);
});
test('rejects inconsistent sample rates',async()=>{
  await assert.rejects(combineWav([wav([1],22050),wav([1],16000)]),/sample rate/);
});
test('rejects corrupt WAV and empty playlist',async()=>{
  await assert.rejects(combineWav([]),/Không có/);
  await assert.rejects(combineWav([new Blob(['bad'])]),/WAV/);
});
