import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanText,splitForSpeech} from '../src/text.js';
test('cleans whitespace preserving Vietnamese',()=>assert.equal(cleanText('  Đọc\u00a0 truyện\n ngày  mai  '),'Đọc truyện ngày mai'));
test('empty input returns empty list',()=>assert.deepEqual(splitForSpeech('  '),[]));
test('short Vietnamese is one segment',()=>assert.deepEqual(splitForSpeech('Xin chào. Đây là truyện.'),['Xin chào. Đây là truyện.']));
test('sentences split at configured length',()=>{
 const parts=splitForSpeech('Đây là chương thứ nhất. Đây là chương thứ hai. Đây là chương thứ ba.',39);
 assert.ok(parts.length>=2);assert.ok(parts.every(x=>x.length<=39));
});
test('long word bounded safely',()=>{const parts=splitForSpeech('a'.repeat(91),30);assert.deepEqual(parts.map(x=>x.length),[30,30,30,1]);});
test('does not lose Vietnamese words',()=>{const s='Một ngày nọ, có người bước vào rừng sâu và nhìn thấy một cánh cửa kỳ lạ.';const parts=splitForSpeech(s,40);assert.equal(parts.join(' '),s);});
