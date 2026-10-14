import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeNumberWords, phonemizeVietnamese} from '../src/vieneu-g2p.js';
const lex=JSON.parse(await readFile(new URL('../../public/g2p-lexicon.json',import.meta.url),'utf8'));
test('VieNeu pronounces numeric EPUB chapter titles',()=>{
 for(const input of ['Chương 1','Chương 15','Chương 2026','Chương 001','Chương 4.5']){
  const parsed=phonemizeVietnamese(input,lex);
  assert.ok(parsed.phonemes.length>3,input);
 }
});
test('normalizes Vietnamese number words in a predictable way',()=>{
 assert.deepEqual(normalizeNumberWords('1'),['một']);
 assert.deepEqual(normalizeNumberWords('15'),['mười','lăm']);
 assert.deepEqual(normalizeNumberWords('21'),['hai','mươi','mốt']);
 assert.deepEqual(normalizeNumberWords('2026'),['hai','nghìn','không','trăm','hai','mươi','sáu']);
 assert.deepEqual(normalizeNumberWords('001'),['không','không','một']);
});
