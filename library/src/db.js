const DB_NAME='vbook-web-offline-r0'; const DB_VERSION=2;
function openDB() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      for(const store of ['books','payloads','positions','chapterAudio']) if(!db.objectStoreNames.contains(store)) db.createObjectStore(store,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function transact(name,mode,fn) {
  const db=await openDB();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(name,mode);const req=fn(tx.objectStore(name));
    let value;
    req.onsuccess=()=>{value=req.result;};
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export const books=()=>transact('books','readonly',s=>s.getAll());
export const getPayload=(id)=>transact('payloads','readonly',s=>s.get(id));
export const getPosition=(id)=>transact('positions','readonly',s=>s.get(id));
export const setPosition=(id,cfi)=>transact('positions','readwrite',s=>s.put({id,cfi,updated:Date.now()}));
export async function saveBook(file,metadata) {
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const id=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  await transact('payloads','readwrite',s=>s.put({id,blob:new Blob([bytes],{type:'application/epub+zip'})}));
  await transact('books','readwrite',s=>s.put({id,title:metadata.title||file.name.replace(/\.epub$/i,''),author:metadata.creator||'Không rõ tác giả',addedAt:Date.now(),bytes:bytes.byteLength}));
  return id;
}
export const deleteBook=async(id)=>{
  for(const store of ['books','payloads','positions']) await transact(store,'readwrite',s=>s.delete(id));
  const audio=await chapterAudioRecords();
  for(const record of audio) if(record.bookId===id) await removeChapterAudio(record.id);
};

// Completed locally generated chapter WAVs are stored separately from the
// EPUB payload, and may be removed without losing any reading position.
export const getChapterAudio=(id)=>transact('chapterAudio','readonly',s=>s.get(id));
export const putChapterAudio=(record)=>transact('chapterAudio','readwrite',s=>s.put(record));
export const removeChapterAudio=(id)=>transact('chapterAudio','readwrite',s=>s.delete(id));
export const chapterAudioRecords=()=>transact('chapterAudio','readonly',s=>s.getAll());
export async function clearAllChapterAudio(){
  await transact('chapterAudio','readwrite',s=>s.clear());
}
