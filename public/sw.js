const STATIC='vbook-ios14-stage-static-20261014-r4';
const MODELS='vbook-nano-web-remote-models-v1';
const REV='aba295eb96a6fa6003ebe417cc1f2802a7adc1dc';
const PREFIX='/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/'+REV+'/';
const relative=x=>new URL(x,self.registration.scope);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(STATIC);
  const page=await fetch(relative('index.html'),{cache:'reload'});
  if(!page.ok)throw Error('shell failed');
  const html=await page.clone().text();
  await cache.put(relative(''),page.clone());
  await cache.put(relative('index.html'),page);
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(v=>v[1]);
  const stylesheet=[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(v=>v[1]);
  const assets=[...scripts,...stylesheet,'g2p-lexicon.json','profile.enc.json','runtime/ort/ort-wasm-simd.wasm','runtime/ort/ort-wasm.wasm'];
  for(const asset of assets){
    const url=asset.startsWith('/')?new URL(asset,location.origin):relative(asset);
    const r=await fetch(url);
    if(!r.ok)throw Error('missing static '+url.pathname);
    await cache.put(url,r);
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('vbook-ios14-stage-static-') && k!==STATIC).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 const isModel=url.hostname==='huggingface.co' && url.pathname.startsWith(PREFIX) && url.pathname.endsWith('.onnx');
 const isStatic=url.origin===location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
 if(!isModel && !isStatic)return;
 event.respondWith((async()=>{
   const c=await caches.open(isModel?MODELS:STATIC);
   const matchOpts={ignoreVary:true,ignoreSearch:!isModel};
   // Network-first for page navigation fixes old HTML being served forever
   // even after the GitHub Pages deployment has published a newer UI.
   if(isStatic && event.request.mode==='navigate'){
     try{
       const response=await fetch(event.request,{cache:'no-store'});
       if(response.ok){
         event.waitUntil(c.put(event.request,response.clone()));
         return response;
       }
     }catch{}
     const cached=await c.match(event.request,matchOpts) || await c.match(relative('index.html'));
     return cached || Response.error();
   }
   const found=await c.match(event.request,matchOpts);
   if(found)return found;
   const r=await fetch(event.request);
   if(r.ok && !isModel)event.waitUntil(c.put(event.request,r.clone()));
   // Stream model downloads to explicit model cache once, with UI progress.
   return r;
 })());
});
