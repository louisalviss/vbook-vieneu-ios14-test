import { mkdir, copyFile, stat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcOnnx = path.join(root, 'node_modules/onnxruntime-web/dist');
const srcPhon = path.join(root, 'node_modules/@diffusionstudio/piper-wasm/build');
const dest = path.join(root,'public/runtime');
const destOnnx = path.join(dest,'ort');
await rm(dest,{recursive:true,force:true});
await mkdir(destOnnx,{recursive:true});
const manifest={schema:1,engine:'piper-onnx-wasm',files:[]};
let wasmCount=0;
for(const file of ['ort-wasm-simd.wasm','ort-wasm.wasm']) {
  {
    await copyFile(path.join(srcOnnx,file),path.join(destOnnx,file));
    const size=(await stat(path.join(destOnnx,file))).size;
    manifest.files.push({path:`/runtime/ort/${file}`,bytes:size});
    wasmCount++;
  }
}
if(!wasmCount) throw new Error('No ONNX Runtime WASM assets found');
for(const file of ['piper_phonemize.wasm','piper_phonemize.data']) {
  const origin=path.join(srcPhon,file);
  const size=(await stat(origin)).size;
  if(!size) throw new Error(`Empty phonemizer asset: ${file}`);
  await copyFile(origin,path.join(dest,file));
  manifest.files.push({path:`/runtime/${file}`,bytes:size});
}
if(!manifest.files.some(f=>f.path.includes('ort-wasm')))throw new Error('No compatible ORT runtime found');
await writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${wasmCount} ORT runtimes, two Piper phonemizer assets, and offline manifest.`);
