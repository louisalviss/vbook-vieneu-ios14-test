import ePub from 'epubjs';
import './style.css';
import { books, saveBook, getPayload, getPosition, setPosition, deleteBook, getChapterAudio, putChapterAudio, chapterAudioRecords, clearAllChapterAudio } from './db.js';
import { cleanText, splitForSpeech } from './text.js';
import { hasVoice, prepareVoice, synthesize, clearVoice, currentVoice, chooseVoice, voiceId, modelRevision, preferredChunkLength } from './voice-choice.js';
import { combineWav } from './wav.js';
import { audioCacheKey, canCacheWav } from './audio-cache.js';
import { offlineReadiness, formatOfflineReport } from './offline-check.js';
import { registerSW } from 'virtual:pwa-register';

const el=(id)=>document.getElementById(id);
const $={
  library:el('libraryView'),reader:el('readerView'),grid:el('bookGrid'),empty:el('emptyLibrary'),
  file:el('fileInput'),toast:el('toast'),settings:el('settingsDialog'),toc:el('tocDialog'),
  audio:el('audioPlayer'),voiceDot:el('voiceDot'),status:el('audioStatus')
};
let activeBook=null,activeRendition=null,activeId=null,activeTitle='';
let readerReady=false;
let playlist=[],playIndex=0,readToken=0,currentAudioUrl=null,chapterAudioBlob=null;
let toastTimer;
const progressText='Model phải được tải & kiểm thử ít nhất một lần khi có Internet.';

function notify(message) { $.toast.textContent=message;$.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$.toast.classList.remove('show'),4200); }
function status(message) { $.status.textContent=message; }
function setNetwork(){ el('networkTag').textContent=navigator.onLine?'● Có mạng':'○ Ngoại tuyến';el('networkTag').classList.toggle('offline',!navigator.onLine); }
const safeDate=(millis)=>new Date(millis).toLocaleDateString('vi-VN');
function showLibrary(){ stopReading();$.reader.classList.add('hidden');$.library.classList.remove('hidden');refreshLibrary(); }
function showReader(){ $.library.classList.add('hidden');$.reader.classList.remove('hidden'); }
function button(label,klass,onClick){const node=document.createElement('button');node.textContent=label;node.className=klass;node.addEventListener('click',onClick);return node;}
async function refreshLibrary() {
  const items=await books();items.sort((a,b)=>b.addedAt-a.addedAt);
  $.grid.replaceChildren();el('bookCount').textContent=String(items.length);$.empty.classList.toggle('hidden',items.length>0);
  for(const item of items){
    const card=document.createElement('article');card.className='book-card';
    const cover=document.createElement('div');cover.className='book-cover';
    const label=document.createElement('span');label.className='cover-title';label.textContent=item.title;
    const emblem=document.createElement('span');emblem.className='cover-emblem';emblem.textContent='V';
    cover.append(emblem,label);cover.addEventListener('click',()=>openBook(item.id));
    const info=document.createElement('div');info.className='book-info';
    const name=document.createElement('button');name.className='book-title';name.textContent=item.title;name.addEventListener('click',()=>openBook(item.id));
    const author=document.createElement('div');author.className='book-author';author.textContent=item.author;
    const date=document.createElement('small');date.textContent=`Đã nhập ${safeDate(item.addedAt)}`;
    const actions=document.createElement('div');actions.className='book-actions';
    actions.append(button('Tiếp tục đọc →','read-link',()=>openBook(item.id)),button('Xóa','delete-link',async()=>{
      if(!confirm(`Xóa "${item.title}" khỏi thư viện trên máy này?`))return;
      if(activeId===item.id)await closeBook();await deleteBook(item.id);await refreshLibrary();notify('Đã xóa sách khỏi thiết bị.');
    }));
    info.append(name,author,date,actions);card.append(cover,info);$.grid.append(card);
  }
}
async function importFile(file){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.epub') && file.type!=='application/epub+zip')throw Error('Chỉ hỗ trợ EPUB.');
  if(file.size>150*1024*1024)throw Error('File vượt giới hạn bản thử 150 MB.');
  const bytes=await file.arrayBuffer();
  const probe=ePub(bytes);
  let metadata={};
  try{await probe.opened;metadata=await probe.loaded.metadata;}finally{try{probe.destroy();}catch{}}
  const id=await saveBook(file,metadata||{});
  try { await navigator.storage.persist?.(); } catch{}
  await refreshLibrary();notify('Đã lưu EPUB trên thiết bị.');await openBook(id);
}
async function closeBook(){
  readerReady=false;
  stopReading();
  try{activeRendition?.destroy();}catch{}
  try{activeBook?.destroy();}catch{}
  activeBook=null;activeRendition=null;activeId=null;
  el('epubReader').replaceChildren();
}
async function openBook(id){
  try {
    if(activeId===id && activeRendition){showReader();return;}
    await closeBook();
    el('speakBtn').disabled=true;el('chapterAudioBtn').disabled=true;
    const payload=await getPayload(id);if(!payload?.blob)throw Error('Không tìm thấy dữ liệu EPUB được lưu.');
    const book=ePub(await payload.blob.arrayBuffer());await book.opened;
    activeBook=book;activeId=id;
    const metadata=await book.loaded.metadata;activeTitle=metadata?.title||'Sách của tôi';
    el('readingTitle').textContent=activeTitle;
    showReader();
    status('Đang nạp nội dung EPUB. Nút đọc sẽ được mở khi sách sẵn sàng…');
    const rendition=book.renderTo('epubReader',{width:'100%',height:'100%',flow:'paginated',spread:'none',allowScriptedContent:false});
    activeRendition=rendition;
    rendition.themes.default({'body':{'font-family':'Georgia, serif !important','font-size':'19px !important','line-height':'1.75 !important','color':'#302b23 !important'},'p':{'line-height':'1.75 !important'}});
    rendition.on('relocated',location=>{
      const cfi=location?.start?.cfi;
      if(cfi && activeId===id)setPosition(id,cfi).catch(console.error);
      const loc=location?.start;
      el('readingProgress').textContent=loc?.percentage!=null?`${Math.round(loc.percentage*100)}%`:'Đang đọc';
      el('readingSection').textContent=loc?.href?.split('/').pop()||'Chương hiện tại';
      if(playlist.length)stopReading();
    });
    const saved=await getPosition(id);await rendition.display(saved?.cfi||undefined);
    await renderToc();
    status(await hasVoice()?'Model '+currentVoice()+' đã lưu. Nhấn Đọc chương để kiểm thử.':progressText);
    readerReady=true;
    el('speakBtn').disabled=false;el('chapterAudioBtn').disabled=false;
  } catch(error){await closeBook();notify(`Lỗi mở sách: ${error.message}`);showLibrary();}
}
async function renderToc(){
  const toc=(await activeBook?.loaded?.navigation)?.toc||[];
  const holder=el('tocList');holder.replaceChildren();
  function add(items,depth=0){for(const entry of items){
    const btn=button(entry.label||'Chương không tên','toc-entry',async()=>{
      $.toc.close();try{await activeRendition?.display(entry.href);}catch(e){notify(e.message);}
    });btn.style.paddingLeft=`${14+Math.min(depth,5)*18}px`;holder.append(btn);
    if(entry.subitems?.length)add(entry.subitems,depth+1);
  }}
  add(toc);if(!toc.length){const n=document.createElement('p');n.textContent='EPUB không cung cấp mục lục.';holder.append(n);}
}
function chapterText(){
  if(!activeRendition)throw Error('Chưa mở sách.');
  const contents=activeRendition.getContents?.()||[];
  const text=contents.map(content=>{
    const body=content?.document?.body;
    if(!body)return '';
    const copy=body.cloneNode(true);
    copy.querySelectorAll('script,style,nav,svg,button,aside').forEach(x=>x.remove());
    return copy.innerText||copy.textContent||'';
  }).join(' ');
  return cleanText(text);
}
// The EPUB iframe can appear before epub.js finishes populating its body.
async function readyChapterText(){
  for(let attempt=0;attempt<50;attempt++){
    try {
      const source=chapterText();
      if(source.length>8)return source;
    }catch(e){if(attempt===49)throw e;}
    status('Đang chờ nội dung chương EPUB hiển thị… ('+(attempt+1)+'/50)');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('Nội dung chương chưa sẵn sàng. Hãy chuyển trang rồi thử lại.');
}
function resetAudio(){if(currentAudioUrl){URL.revokeObjectURL(currentAudioUrl);currentAudioUrl=null;}$.audio.removeAttribute('src');$.audio.load();}
function stopReading(){readToken++;playlist=[];playIndex=0;$.audio.pause();resetAudio();chapterAudioBlob=null;el('downloadAudioBtn').disabled=true;el('chapterAudioBtn').disabled=!readerReady;el('stopBtn').disabled=true;el('speakBtn').disabled=!readerReady;$.voiceDot.classList.remove('active');}
async function nextSpeechPart(token){
  if(token!==readToken)return;
  if(playIndex>=playlist.length){status('Đã đọc hết phần văn bản của chương đang hiển thị.');stopReading();return;}
  const number=playIndex+1;const source=playlist[playIndex++];const start=performance.now();
  try{
    status(`Đang tổng hợp câu ${number}/${playlist.length} trên thiết bị…`);
    const wav=await synthesize(source,message=>status(message));
    if(token!==readToken)return;
    $.audio.pause();resetAudio();currentAudioUrl=URL.createObjectURL(wav);$.audio.src=currentAudioUrl;
    $.audio.playbackRate=Number(el('speedSelect').value);
    const seconds=((performance.now()-start)/1000).toFixed(1);
    status(`Câu ${number}/${playlist.length} · tạo WAV trong ${seconds} giây. Nếu iOS chặn tự phát, nhấn ▶ trên thanh audio.`);
    await $.audio.play();
  }catch(error){if(token===readToken){status(`Không thể phát tự động: ${error.message}. Hãy nhấn Play thủ công, hoặc kiểm tra model.`);}}
}
async function beginSpeech(){
  let text;
  try{text=await readyChapterText();}catch(e){status(e.message);notify(e.message);return;}
  const segments=splitForSpeech(text,preferredChunkLength());
  if(!segments.length){notify('Chưa trích được văn bản của chương.');return;}
  if(segments.length>350){notify('Chương dài; đọc tối đa 350 đoạn trong bản thử.');}
  stopReading();playlist=segments.slice(0,350);playIndex=0;
  const token=readToken;
  el('speakBtn').disabled=true;el('stopBtn').disabled=false;$.voiceDot.classList.add('active');
  try{await prepareVoice(message=>status(message));if(token!==readToken)return;await nextSpeechPart(token);}
  catch(error){status(`Lỗi model: ${error.message}. Cần chuẩn bị model khi có mạng.`);stopReading();}
}
// Precompute a bounded chapter excerpt as ONE media file. Playback needs no
// background JS synthesis between sentences, although iOS may still interrupt.
async function prepareChapterAudio(){
  let source;
  try {source=await readyChapterText();}catch(e){status(e.message);notify(e.message);return;}
  const segments=splitForSpeech(source,preferredChunkLength());
  if(!segments.length){notify('Chưa có chữ để đọc.');return;}
  const maximum=80;
  const chosen=segments.slice(0,maximum);
  const bookId=activeId;
  stopReading();const token=readToken;
  el('chapterAudioBtn').disabled=true;el('speakBtn').disabled=true;el('stopBtn').disabled=false;
  const waves=[],start=performance.now();
  try {
    const key=await audioCacheKey(bookId,voiceId(),chosen.join('\n'),maximum,modelRevision());
    const cached=await getChapterAudio(key);
    if(token!==readToken)return;
    if(cached?.blob?.size>44 && cached.blob.type.startsWith('audio/')){
      chapterAudioBlob=cached.blob;
      status(`Đã mở WAV lưu trên thiết bị (${(cached.blob.size/1048576).toFixed(1)} MB). Không chạy TTS lại.`);
    } else {
      await prepareVoice(message=>status(message));
      for(let i=0;i<chosen.length;i++){
        if(token!==readToken)return;
        status(`Đang tạo audio offline: ${i+1}/${chosen.length} đoạn…`);
        waves.push(await synthesize(chosen[i],message=>status(message)));
      }
      if(token!==readToken)return;
      chapterAudioBlob=await combineWav(waves);
      let persistMessage='';
      if(canCacheWav(chapterAudioBlob)) {
        try {
          await putChapterAudio({id:key,bookId,voiceId:voiceId(),createdAt:Date.now(),blob:chapterAudioBlob,segmentCount:chosen.length});
          persistMessage=' Audio đã được lưu trên máy.';
        } catch(e) { persistMessage=` Không thể lưu lâu dài (${e.name||'lỗi bộ nhớ'}); vẫn phát được trong phiên này.`; }
      } else {persistMessage=' WAV vượt giới hạn 70 MB để lưu lâu dài.';}
      status(`Đã ghép ${chosen.length} đoạn thành một WAV (${(chapterAudioBlob.size/1048576).toFixed(1)} MB; ${((performance.now()-start)/1000).toFixed(1)} giây).${persistMessage} ${segments.length>maximum?'Bản thử chỉ tạo 80 đoạn đầu. ':''}`);
    }
    if(token!==readToken)return;
    currentAudioUrl=URL.createObjectURL(chapterAudioBlob);
    $.audio.src=currentAudioUrl;
    $.audio.playbackRate=Number(el('speedSelect').value);
    el('downloadAudioBtn').disabled=false;
    try {await $.audio.play();}catch{ /* iOS may require a fresh tap */ }
  } catch(e){if(token===readToken){status(`Lỗi audio: ${e.message}`);stopReading();}}
  finally {if(token===readToken){el('chapterAudioBtn').disabled=false;el('speakBtn').disabled=false;}}
}
function downloadChapterAudio(){
  if(!chapterAudioBlob)return;
  const url=URL.createObjectURL(chapterAudioBlob);
  const a=document.createElement('a');a.href=url;a.download=`${activeTitle.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}-offline.wav`;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
async function openSample(){
  try{
    const response=await fetch(`${import.meta.env.BASE_URL}sample-vietnamese.epub`);
    if(!response.ok)throw new Error('Không tải được EPUB mẫu.');
    const blob=await response.blob();
    await importFile(new File([blob],'sample-vietnamese.epub',{type:'application/epub+zip'}));
  }catch(e){notify(e.message);}
}
async function changeNarrator(name) {
  if(name===currentVoice())return;
  stopReading();
  chooseVoice(name);
  reflectVoiceChoices();
  try{await syncVoiceStatus();status('Đã chọn '+(name==='vieneu'?'VieNeu Nano':'Piper')+'. Nếu chưa có model, mở Cài đặt để tải.');}
  catch(e){notify('Lỗi chọn giọng: '+e.message);}
}
function reflectVoiceChoices(){
  const value=currentVoice();
  el('voiceEngineSelect').value=value;
  el('readerVoiceSelect').value=value;
  const nano=value==='vieneu';
  el('voiceName').textContent=nano?'VieNeu Nano · NamMinh-like':'Piper · tiếng Việt';
  el('voiceExplanation').textContent=nano
    ?'Giọng đã chấp nhận qua mẫu nghe, engine offline đang thử nghiệm. Model dùng chung với bản test iPhone.'
    :'Giọng nền Piper, vẫn được giữ làm dự phòng.';
  el('voiceDetail').textContent=nano?'VieNeu v3 Nano · offline, thử nghiệm':'Piper tiếng Việt · offline';
  el('unlockVoiceHelp').classList.toggle('hidden',!nano);
}

function registerEvents(){
  for(const btn of ['importBtn','emptyImportBtn'])el(btn).addEventListener('click',()=>$.file.click());
  el('sampleBookBtn').addEventListener('click',openSample);
  el('readerVoiceSelect').addEventListener('change',event=>changeNarrator(event.target.value));
  el('voiceEngineSelect').addEventListener('change',event=>changeNarrator(event.target.value));
  $.file.addEventListener('change',async()=>{const file=$.file.files?.[0];$.file.value='';if(!file)return;try{await importFile(file);}catch(e){notify(`Nhập EPUB thất bại: ${e.message}`);}});
  el('homeBtn').addEventListener('click',showLibrary);el('backToShelfBtn').addEventListener('click',showLibrary);
  el('prevBtn').addEventListener('click',()=>activeRendition?.prev());el('nextBtn').addEventListener('click',()=>activeRendition?.next());
  el('openSettingsBtn').addEventListener('click',()=>{$.settings.showModal();syncVoiceStatus();});
  el('settingsClose').addEventListener('click',()=>$.settings.close());
  el('tocBtn').addEventListener('click',()=>$.toc.showModal());el('tocClose').addEventListener('click',()=>$.toc.close());
  el('prepareVoiceBtn').addEventListener('click',async()=>{
    const b=el('prepareVoiceBtn');b.disabled=true;el('prepareStatus').textContent='Đang chuẩn bị…';
    try{
      await prepareVoice(s=>el('prepareStatus').textContent=s);
      if(currentVoice()==='vieneu'){
        el('prepareStatus').textContent='Đang tạo một câu WAV kiểm thử VieNeu bằng model trên máy…';
        const sample=await synthesize('Đêm ấy, cơn mưa kéo dài không dứt.',s=>el('prepareStatus').textContent=s);
        if(!sample||sample.size<1000)throw Error('VieNeu chưa tạo được WAV kiểm thử.');
        el('prepareStatus').textContent='PASS: VieNeu đã tạo WAV '+Math.round(sample.size/1024)+' KB. Có thể thử đọc EPUB.';
      }
      await syncVoiceStatus();
    }
    catch(e){el('prepareStatus').textContent=`Lỗi: ${e.message}`;await syncVoiceStatus();}
    finally{b.disabled=false;}
  });
  el('checkOfflineBtn').addEventListener('click',async()=>{
    const b=el('checkOfflineBtn');b.disabled=true;el('offlineCheckReport').textContent='Đang kiểm tra bộ nhớ cục bộ…';
    try {const report=await offlineReadiness({hasVoice,basePath:import.meta.env.BASE_URL});el('offlineCheckReport').textContent=formatOfflineReport(report);}
    catch(e){el('offlineCheckReport').textContent=`Lỗi kiểm tra: ${e.message}`;}
    finally{b.disabled=false;}
  });
  el('clearAudioBtn').addEventListener('click',async()=>{
    if(!confirm('Xóa toàn bộ WAV đã lưu? Sách và vị trí đọc được giữ nguyên.'))return;
    try {await clearAllChapterAudio();notify('Đã xóa WAV trong cache.');} catch(e){notify(`Lỗi xóa audio: ${e.message}`);}
  });
  el('clearVoiceBtn').addEventListener('click',async()=>{
    if(!confirm('Xóa model offline khỏi bộ nhớ iPhone?'))return;
    try{await clearVoice();await syncVoiceStatus();notify('Đã xóa model.');}catch(e){notify(e.message);}
  });
  el('chapterAudioBtn').addEventListener('click',prepareChapterAudio);el('downloadAudioBtn').addEventListener('click',downloadChapterAudio);
  el('speakBtn').addEventListener('click',beginSpeech);el('stopBtn').addEventListener('click',()=>{stopReading();status('Đã dừng đọc.');});
  $.audio.addEventListener('ended',()=>{if(chapterAudioBlob){status('Đã phát hết WAV chương. Có thể lưu file hoặc phát lại.');return;}if(playIndex<playlist.length)nextSpeechPart(readToken);else{status('Đã đọc hết chương.');stopReading();}});
  el('speedSelect').addEventListener('change',()=>{$.audio.playbackRate=Number(el('speedSelect').value);});
  el('themeBtn').addEventListener('click',()=>{const light=document.documentElement.classList.toggle('light');localStorage.setItem('vbook-theme',light?'light':'dark');});
  window.addEventListener('online',setNetwork);window.addEventListener('offline',setNetwork);
  document.addEventListener('keydown',e=>{if($.reader.classList.contains('hidden')||$.toc.open||$.settings.open)return;if(e.key==='ArrowRight')activeRendition?.next();if(e.key==='ArrowLeft')activeRendition?.prev();});
}
async function syncVoiceStatus(){
  reflectVoiceChoices();
  const yes=await hasVoice();
  el('modelState').textContent=yes?'Model đã lưu':'Chưa tải model';
  el('modelState').classList.toggle('ready',yes);
}
async function init(){
  if(localStorage.getItem('vbook-theme')==='light')document.documentElement.classList.add('light');
  setNetwork();reflectVoiceChoices();registerEvents();
  try{registerSW({immediate:true,onOfflineReady:()=>notify('Giao diện đã lưu offline. Hãy tải giọng trong Cài đặt.'),onNeedRefresh:()=>notify('Đã có bản cập nhật. Tải lại trang để áp dụng.')});}catch(e){console.error(e);}
  if(!('indexedDB' in window)){notify('Trình duyệt không hỗ trợ IndexedDB.');return;}
  try{await refreshLibrary();}catch(e){notify(`Không mở được thư viện: ${e.message}`);}
  await syncVoiceStatus();
}
init();
