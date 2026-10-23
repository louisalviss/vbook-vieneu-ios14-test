// Manual acceptance: npm install --no-save playwright, install Chromium.
// Set VBOOK_UNLOCK_KEY only in your shell. Never commit or log the fragment key.
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH}:{})});
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
const page=await ctx.newPage(),errs=[];
page.on('pageerror',e=>errs.push(e.message));
page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAV',f.url().split('#')[0]);});
const base='https://louisalviss.github.io/vbook-vieneu-ios14-test/';
try{
  const key=process.env.VBOOK_UNLOCK_KEY?.trim();
  if(!key)throw Error('VBOOK_UNLOCK_KEY must be set in the shell (not committed).');
  await page.goto(base+'#k='+key,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#run').click();
  await page.waitForFunction(()=>['pass','fail'].includes(window.__nanoProbe?.status),null,{timeout:170000});
  console.log('VOICE_STAGE',await page.evaluate(()=>window.__nanoProbe.status));
  if((await page.evaluate(()=>window.__nanoProbe.status))!=='pass')throw Error('Voice stage failed');
  await page.goto(base+'library/?r=1',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#sampleBookBtn').click();
  await page.locator('#readerView:not(.hidden)').waitFor({timeout:30000});
  console.log('SAMPLE_TITLE',await page.locator('#readingTitle').innerText());
  await page.locator('#readerVoiceSelect').selectOption('vieneu');
  await page.locator('#speakBtn').click();
  await page.waitForFunction(()=>{
   const a=document.querySelector('#audioPlayer')?.getAttribute('src'),s=document.querySelector('#audioStatus')?.textContent||'';
   return a?.startsWith('blob:')||s.includes('Lỗi')||s.includes('Không thể')||s.includes('Thiếu phiên âm');
  },null,{timeout:70000}).catch(async(e)=>{console.log('TIMEOUT_DIAG',await page.evaluate(()=>({stage:document.querySelector('#audioStatus')?.textContent,toast:document.querySelector('#toast')?.textContent,button:document.querySelector('#speakBtn')?.disabled,src:document.querySelector('#audioPlayer')?.getAttribute('src')})));throw e;});
  const state=await page.evaluate(()=>({engine:localStorage.getItem('vbook-library-voice-engine'),src:document.querySelector('#audioPlayer')?.getAttribute('src'),status:document.querySelector('#audioStatus')?.textContent}));
  console.log('LIBRARY_VIENEU',JSON.stringify({state,errs}));
  if(!state.src?.startsWith('blob:')||errs.length)throw Error('Online VieNeu EPUB WAV failed');
  await page.waitForFunction(()=>navigator.serviceWorker?.controller?.scriptURL?.includes('/library/sw.js'),null,{timeout:30000});
  console.log('LIBRARY_SW',await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL));
  await page.locator('#homeBtn').click();
  await ctx.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});
  console.log('OFFLINE_SHELF',await page.locator('.book-title').count());
  await page.locator('.book-title').first().click();
  await page.locator('#readerView:not(.hidden)').waitFor({timeout:20000});
  await page.locator('#speakBtn').click();
  await page.waitForFunction(()=>{
    const a=document.querySelector('#audioPlayer')?.getAttribute('src');
    const s=document.querySelector('#audioStatus')?.textContent||'';
    return a?.startsWith('blob:')||s.includes('Lỗi')||s.includes('Không thể')||s.includes('Thiếu phiên âm');
  },null,{timeout:85000});
  const offline=await page.evaluate(()=>({engine:localStorage.getItem('vbook-library-voice-engine'),src:document.querySelector('#audioPlayer')?.getAttribute('src'),status:document.querySelector('#audioStatus')?.textContent,online:navigator.onLine}));
  console.log('OFFLINE_VIENEU',JSON.stringify({offline,errs}));
  if(!offline.src?.startsWith('blob:')||errs.length)throw Error('Offline VieNeu EPUB WAV failed: '+offline.status);
  await page.locator('#readerVoiceSelect').selectOption('piper');
  console.log('PIPER_SWITCH',await page.evaluate(()=>localStorage.getItem('vbook-library-voice-engine')));
  console.log('INTEGRATION_ONLINE_OFFLINE_PASS');
}catch(e){console.log('FAIL',e.message.slice(0,400),errs.slice(-6));process.exitCode=1;}
finally{await browser.close();}
})();