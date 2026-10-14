
const DIGITS=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
function smallNumber(n) {
  if(n<10)return [DIGITS[n]];
  if(n<20)return n===10?['mười']:['mười',n===15?'lăm':DIGITS[n%10]];
  const tens=Math.floor(n/10),ones=n%10;
  return [DIGITS[tens],'mươi',...(ones===0?[]:[ones===1?'mốt':ones===5?'lăm':DIGITS[ones]])];
}
function threeDigits(n,full=false) {
  if(n<100&&!full)return smallNumber(n);
  const hundred=Math.floor(n/100),rest=n%100;
  const a=[DIGITS[hundred],'trăm'];
  if(rest===0)return a;
  if(rest<10)return [...a,'lẻ',DIGITS[rest]];
  return [...a,...smallNumber(rest)];
}
function integerWords(raw) {
  if(raw.length>1&&raw[0]==='0')return [...raw].map(c=>DIGITS[Number(c)]);
  if(raw.length>9)return [...raw].map(c=>DIGITS[Number(c)]);
  const n=Number(raw);
  if(!Number.isSafeInteger(n))return [...raw].map(c=>DIGITS[Number(c)]);
  if(n<1000)return threeDigits(n);
  if(n<1000000){
    const high=Math.floor(n/1000),rest=n%1000;
    return [...threeDigits(high),'nghìn',...(rest===0?[]:threeDigits(rest,rest<100))];
  }
  const high=Math.floor(n/1000000),rem=n%1000000;
  const million=[...threeDigits(high),'triệu'];
  if(rem===0)return million;
  const thousand=Math.floor(rem/1000),low=rem%1000;
  return [...million,
    ...(thousand? [...threeDigits(thousand,thousand<100),'nghìn']:['không','nghìn']),
    ...(low?threeDigits(low,low<100):[])];
}
export function normalizeNumberWords(raw){
  const pieces=raw.split(/[.,]/);
  return pieces.flatMap((part,i)=>[...(i?['phẩy']:[]),...(i?Array.from(part).map(c=>DIGITS[Number(c)]):integerWords(part))]);
}

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
    const spoken=/^\d/.test(item)?normalizeNumberWords(item):[item];
    for(const word of spoken) {
      const ph=lex[word];
      if(!ph){unrecognized.push(word);continue;}
      if(phones && !/\s$/.test(phones))phones+=' ';
      phones+=ph;
      tokens++;
    }
  }
  if(!/[.!?]$/.test(phones))phones+='.';
  if(unrecognized.length) {
    throw Error('Thiếu phiên âm: '+[...new Set(unrecognized)].slice(0,15).join(', '));
  }
  return {phonemes:phones,spokenTokens:tokens};
}
