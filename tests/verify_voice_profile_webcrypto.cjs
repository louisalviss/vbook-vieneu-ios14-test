// Interoperability with browser crypto.subtle; only accepts local private QA files.
const { readFileSync }=require('node:fs');
const {webcrypto}=require('node:crypto');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const dir=process.argv[2];
if(!dir)throw Error('Supply local QA profile directory');
const encoded=s=>Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4),'base64');
(async()=>{
 const e=JSON.parse(readFileSync(join(dir,'profile.enc.json'),'utf8'));
 const secret=readFileSync(join(dir,'unlock.key'),'utf8').trim();
 const k=await webcrypto.subtle.importKey('raw',encoded(secret),{name:'AES-GCM'},false,['decrypt']);
 const decrypted=await webcrypto.subtle.decrypt({
   name:'AES-GCM',iv:encoded(e.iv),additionalData:new TextEncoder().encode(e.aad)
 },k,encoded(e.ciphertext));
 const p=JSON.parse(new TextDecoder().decode(decrypted));
 assert.equal(p.voice_speaker.length,192);
 assert.equal(p.voice_style.length,12800);
 assert.equal(p.sample_rate,24000);
 assert.equal(p.steps,16);
 console.log('WEBCRYPTO_PASS');
})().catch(e=>{console.error('WEBCRYPTO_FAIL',e.message);process.exitCode=1});
