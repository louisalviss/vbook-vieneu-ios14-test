import * as piper from './tts.js';

export const PIPER='piper';
export const VIENEU='vieneu';
export const choices=[PIPER,VIENEU];
let selected=localStorage.getItem('vbook-library-voice-engine')===VIENEU?VIENEU:PIPER;
let vieModule=null;
async function nano(){return vieModule ||= await import('./vieneu.js');}
export function currentVoice(){return selected;}
export function chooseVoice(engine){
  if(!choices.includes(engine))throw Error('Không nhận dạng được engine giọng.');
  selected=engine;
  localStorage.setItem('vbook-library-voice-engine',selected);
}
export function voiceId(){return selected===VIENEU?'vieneu-nano-namminh-like':piper.voiceId;}
export function modelRevision(){return selected===VIENEU?'vieneu-v3-nano-aba295e-16steps':piper.modelRevision;}
export async function hasVoice(){
 return selected===VIENEU?(await nano()).hasVoice():piper.hasVoice();
}
export async function prepareVoice(onProgress=()=>{}){
 return selected===VIENEU?(await nano()).prepareVoice(onProgress):piper.prepareVoice(onProgress);
}
export async function synthesize(text,onProgress=()=>{}){
 return selected===VIENEU?(await nano()).synthesize(text,onProgress):piper.synthesize(text);
}
export async function clearVoice(){
 return selected===VIENEU?(await nano()).clearVoice():piper.clearVoice();
}
export function preferredChunkLength(){return selected===VIENEU?115:210;}
