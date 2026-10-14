// Sentence-aware chunking for Vietnamese narration.
export function cleanText(text) {
  return String(text ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
export function splitForSpeech(text, maxLength = 220) {
  if (!Number.isFinite(maxLength) || maxLength < 30) throw new RangeError('maxLength must be at least 30');
  const source = cleanText(text);
  if (!source) return [];
  const sentences = source.match(/[^.!?…。！？\n]+(?:[.!?…。！？]+|$)/gu) || [source];
  const chunks = []; let current = '';
  function push() { if (current.trim()) chunks.push(current.trim()); current = ''; }
  function append(piece) {
    if (!piece) return;
    if (current && current.length + 1 + piece.length > maxLength) push();
    current = current ? `${current} ${piece}` : piece;
  }
  for(const rawSentence of sentences) {
    const sentence = cleanText(rawSentence);
    if (!sentence) continue;
    if (sentence.length <= maxLength) { append(sentence); continue; }
    const words=sentence.split(' '); let part='';
    for(const word of words) {
      if(word.length > maxLength) {
        if(part) { append(part); part=''; }
        for(let i=0;i<word.length;i+=maxLength) append(word.slice(i,i+maxLength));
      } else if(part && part.length+1+word.length>maxLength) { append(part); part=word; }
      else part = part ? `${part} ${word}` : word;
    }
    if(part) append(part);
  }
  push(); return chunks;
}
