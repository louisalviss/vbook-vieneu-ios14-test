import { cleanText } from './text.js';

// A stable content-addressed key prevents a saved WAV from being played for
// a different section, voice, or TTS chunking policy.
export async function audioCacheKey(bookId, voiceId, text, segmentLimit = 80, modelRevision = 'base-r3') {
  if (!bookId || !voiceId || !Number.isInteger(segmentLimit) || segmentLimit <= 0 || !modelRevision) {
    throw new Error('Thiếu thông tin để định danh audio offline.');
  }
  const normalized = cleanText(text);
  if (!normalized) throw new Error('Chương không có văn bản.');
  const payload = JSON.stringify(['vbook-audio-r3',bookId,voiceId,modelRevision,segmentLimit,normalized]);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  const hash = Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${bookId}:${hash}`;
}

export const MAX_CACHED_WAV_BYTES = 70 * 1024 * 1024;
export function canCacheWav(blob) {
  return !!blob && blob.type.startsWith('audio/') && blob.size > 44 && blob.size <= MAX_CACHED_WAV_BYTES;
}
