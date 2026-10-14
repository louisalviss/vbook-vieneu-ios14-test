const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
 const p=await ctx.newPage(), logs=[],errs=[];
 p.on('console',m=>{if(m.text().includes('[NanoBrowser]'))logs.push(m.text().slice(0,195))});
 p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 const url='http://127.0.0.1:8765/vbook-vieneu-ios14-test/#k='+process.env.VBOOK_UNLOCK_KEY;
 try{
 await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await p.locator('#run').click();
 await p.waitForFunction(()=>['pass','fail'].includes(window.__nanoProbe?.status),null,{timeout:180000});
 const a=await p.evaluate(()=>({status:window.__nanoProbe.status,bytes:window.__nanoProbe.audioBytes,error:window.__nanoProbe.error}));
 const rev='aba295eb96a6fa6003ebe417cc1f2802a7adc1dc';
 const names=['text_encoder','duration_predictor','vector_estimator','codec_decoder'];
 let cacheState=[];
 for(let i=0;i<15;i++){
  cacheState=await p.evaluate(async({names,rev})=>{
   const c=await caches.open('vbook-nano-web-remote-models-v1');
   return await Promise.all(names.map(async name=>Boolean(await c.match('https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/'+rev+'/'+name+'.onnx'))));
  },{names,rev});
  if(cacheState.every(Boolean))break;
  await p.waitForTimeout(1000);
 }
 console.log('ONLINE',JSON.stringify({a,cacheState,lastLogs:logs.slice(-13),errs}));
 if(a.status!=='pass'||!cacheState.every(Boolean)){process.exitCode=2;return;}
 await ctx.setOffline(true);
 await p.reload({waitUntil:'domcontentloaded',timeout:30000});
 await p.locator('#run').click();
 await p.waitForFunction(()=>['pass','fail'].includes(window.__nanoProbe?.status),null,{timeout:165000});
 const z=await p.evaluate(()=>({status:window.__nanoProbe.status,bytes:window.__nanoProbe.audioBytes,error:window.__nanoProbe.error}));
 console.log('OFFLINE',JSON.stringify({z,logs:logs.slice(-13),errs}));
 if(z.status!=='pass')process.exitCode=3;
 }catch(e){console.log('SMOKE_ERROR',e.message,JSON.stringify({logs:logs.slice(-18),errs}));process.exitCode=1;}
 finally{await b.close();}
})().catch(e=>{console.log('FAILED',e.stack.slice(0,500));process.exitCode=4});
