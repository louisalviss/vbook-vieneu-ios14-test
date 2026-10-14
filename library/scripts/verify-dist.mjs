import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root=path.join(process.cwd(),'dist');
async function file(relative,minimum=1){
  const f=path.join(root,relative),s=await stat(f);
  if(!s.isFile()||s.size<minimum)throw Error(`Missing or incomplete build artifact: ${relative}`);
  console.log(`${relative}: ${s.size} bytes`);
}
await file('index.html',500);
await file('sample-vietnamese.epub',1000);
await file('runtime/piper_phonemize.data',100000);
await file('runtime/manifest.json',100);
await file('runtime/piper_phonemize.wasm',100000);
const manifest=JSON.parse(await readFile(path.join(root,'runtime/manifest.json'),'utf8'));
if(manifest.schema!==1 || !Array.isArray(manifest.files) || manifest.files.length<3)throw Error('Runtime manifest invalid');
for(const x of manifest.files) {
  if(!x.path.startsWith('/runtime/') || !Number.isFinite(x.bytes) || x.bytes<10000)throw Error('Malformed runtime manifest entry');
  await file(x.path.slice(1),x.bytes);
}
const runtime=await readdir(path.join(root,'runtime/ort'));
if(!runtime.some(x=>x.endsWith('.wasm')))throw Error('Missing ONNX wasm runtime');
const all=await readdir(root);
const sw=all.find(x=>/^sw\.js$/.test(x));
if(!sw)throw Error('PWA service worker missing');
const swText=await readFile(path.join(root,sw),'utf8');
if(!swText.includes('/vbook-vieneu-ios14-test/library/index.html'))throw Error('Service Worker offline navigation fallback points outside isolated Library');
if(swText.includes('/vbook-web-offline-r3/index.html'))throw Error('Obsolete production route leaked into Library service worker');
for(const relative of ['runtime/manifest.json','runtime/piper_phonemize.data','runtime/piper_phonemize.wasm']) {
  if(!swText.includes(relative)) throw Error(`Required offline asset missing from service-worker precache: ${relative}`);
}
for(const wasm of runtime.filter(x=>x.endsWith('.wasm'))) {
  if(!swText.includes(wasm)) throw Error(`Offline ORT module missing from service-worker precache: ${wasm}`);
}
const index=await readFile(path.join(root,'index.html'),'utf8');
if(!index.includes('manifest'))throw Error('Missing manifest link');
const buildAssets=await readdir(path.join(root,'assets'));
if(!buildAssets.some(x=>x.endsWith('.js'))||!buildAssets.some(x=>x.endsWith('.css')))throw Error('Missing bundle JS/CSS');
console.log(`DIST_CONTRACT_PASS (${runtime.filter(x=>x.endsWith('.wasm')).length} ORT WASM files)`);
