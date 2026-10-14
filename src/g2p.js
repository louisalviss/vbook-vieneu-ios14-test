
export function phonemizeVietnamese(raw, lex) {
  const text=String(raw || '').normalize('NFC').toLocaleLowerCase('vi-VN').trim();
  if(!text) throw Error('Văn bản rỗng');
  // The dictionary already contains SEA-G2P output; this path targets Vietnamese
  // literary prose. Numeric and foreign-name normalization will be extended later.
  const parts=text.match(/[\p{L}\p{M}]+|\d+(?:[.,]\d+)*|[.,!?;:]/gu)||[];
  let phones='',unrecognized=[],tokens=0;
  for(const item of parts) {
    if (/^[.,!?;:]$/.test(item)) {
      if (phones) phones=phones.trimEnd()+(({';':',',':':','}[item])||item);
      continue;
    }
    let ph=lex[item];
    if(!ph && /^\d/.test(item)) {unrecognized.push(item);continue;}
    if(!ph) {unrecognized.push(item);continue;}
    if(phones && !/\s$/.test(phones))phones+=' ';
    phones+=ph;
    tokens++;
  }
  if(!/[.!?]$/.test(phones))phones+='.';
  if(unrecognized.length) {
    throw Error('Thiếu phiên âm: '+[...new Set(unrecognized)].slice(0,15).join(', '));
  }
  return {phonemes:phones,spokenTokens:tokens};
}
