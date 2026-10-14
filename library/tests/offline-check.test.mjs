import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineReadiness,formatOfflineReport } from '../src/offline-check.js';
const manifest={schema:1,files:[
  {path:'/runtime/piper_phonemize.wasm',bytes:600000},
  {path:'/runtime/piper_phonemize.data',bytes:19000000},
  {path:'/runtime/ort/ort-wasm-simd.wasm',bytes:8000000}
]};
function fake({missing=[],model=true,worker=true,secure=true,manifestOverride=manifest}={}){
  return {isSecureContext:secure, navigator:{serviceWorker:{controller:worker?{}:null},storage:{estimate:async()=>({usage:120000000,quota:1200000000})}},
    caches:{match:async(path)=>{if(missing.includes(path))return undefined;
      return path==='/runtime/manifest.json'?{json:async()=>manifestOverride}:{};}}};
}
test('all local runtime assets and voice ready => passes',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>true,env:fake()});
 assert.equal(x.runtime,true);assert.equal(x.shell,true);assert.equal(x.model,true);
 assert.match(formatOfflineReport(x),/Gói đã có đủ tài nguyên/);
});
test('missing WASM file never passes offline check',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>true,env:fake({missing:['/runtime/ort/ort-wasm-simd.wasm']})});
 assert.equal(x.runtime,false);assert.equal(x.missing.length,1);
});
test('missing local manifest is not fetched remotely',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>true,env:fake({missing:['/runtime/manifest.json']})});
 assert.equal(x.runtime,false);assert.deepEqual(x.missing,['/runtime/manifest.json']);
});
test('model absent is reported even with cached runtime',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>false,env:fake()});
 assert.equal(x.model,false);assert.equal(x.runtime,true);
 assert.match(formatOfflineReport(x),/Chưa đủ điều kiện offline/);
});
test('invalid manifest is rejected without network',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>true,env:fake({manifestOverride:{schema:1,files:[{path:'/runtime/nope',bytes:10000}]}})});
 assert.equal(x.runtime,false);assert.match(x.detail,/Manifest/);
});
test('non-secure context does not pretend to have offline cache',async()=>{
 const x=await offlineReadiness({hasVoice:async()=>true,env:fake({secure:false})});
 assert.equal(x.runtime,false);assert.equal(x.secure,false);
});

test('GitHub Pages subpath uses prefixed offline cache keys',async()=>{
 const actual=[];const env=fake();const match=env.caches.match;env.caches.match=async(path,opt)=>{actual.push(path);return match(path.replace('/vbook-web-offline-r3',''),opt)};
 const r=await offlineReadiness({hasVoice:async()=>true,env,basePath:'/vbook-web-offline-r3/'});
 assert.equal(r.runtime,true);assert(actual.every(x=>x.startsWith('/vbook-web-offline-r3/')));
});
