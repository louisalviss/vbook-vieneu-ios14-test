import test from 'node:test';
import assert from 'node:assert/strict';
import { audioCacheKey, canCacheWav, MAX_CACHED_WAV_BYTES } from '../src/audio-cache.js';
test('same book voice text and limit generate deterministic address',async()=>{
  assert.equal(await audioCacheKey('b','v','Xin chào!'),await audioCacheKey('b','v','Xin  chào!'));
});
test('different books, models and text invalidate audio',async()=>{
  const base=await audioCacheKey('b','v','Xin chào!');
  for(const candidate of [
    await audioCacheKey('other','v','Xin chào!'),
    await audioCacheKey('b','v2','Xin chào!'),
    await audioCacheKey('b','v','Chào bạn!'),
    await audioCacheKey('b','v','Xin chào!',100)
  ])assert.notEqual(base,candidate);
});
test('rejects empty inputs and unsafe output size',async()=>{
  await assert.rejects(audioCacheKey('b','v',' '),/không có/);
  await assert.rejects(audioCacheKey('','v','x'),/Thiếu/);
  assert.equal(canCacheWav(new Blob(['short'],{type:'audio/wav'})),false);
  assert.equal(canCacheWav({type:'audio/wav',size:MAX_CACHED_WAV_BYTES+1}),false);
  assert.equal(canCacheWav({type:'audio/wav',size:900}),true);
});

test('changing model revision invalidates cached narrator audio',async()=>{
 const a=await audioCacheKey('book','vi', 'Xin chào',80,'old');
 const b=await audioCacheKey('book','vi', 'Xin chào',80,'new');
 assert.notEqual(a,b);
});
