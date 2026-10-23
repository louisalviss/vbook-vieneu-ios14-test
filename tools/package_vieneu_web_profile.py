#!/usr/bin/env python3
"""AES-256-GCM private browser profile packager for a newly enrolled VieNeu voice.

Publishes nothing. Use an OFFLINE PRIVATE full-profile template, and an
ephemeral speaker/style JSON created by tools/clone_vieneu_nano.py.
The resulting profile.enc.json is ciphertext; unlock.key is a bearer secret
and must never be committed, placed in a URL response, or printed to stdout.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import math
import os
import re
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NECESSARY=('null_speaker','null_style','vocab','bos_id','eos_id','pad_id',
           'emotion_map','fps','steps','cfg','sample_rate')
SPEAKER_SHAPE=192
STYLE_SHAPE=50*256

def b64(data:bytes)->str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')

def numeric_array(value,length,name):
    if not isinstance(value,list): raise ValueError(name+' must be a list')
    flat=value
    if len(flat)==50 and name=='style' and all(isinstance(x,list) and len(x)==256 for x in flat):
        flat=[y for row in flat for y in row]
    if len(flat)!=length:raise ValueError(name+' must contain '+str(length)+' floats')
    out=[float(x) for x in flat]
    if not all(math.isfinite(x) for x in out):raise ValueError(name+' contains invalid numbers')
    return out

def build(template:dict,voice:dict,steps:int|None=None):
    if not isinstance(template,dict) or not isinstance(voice,dict):raise ValueError('invalid JSON object')
    for k in NECESSARY:
        if k not in template:raise ValueError('Private base profile missing '+k)
    speaker=numeric_array(voice['speaker_emb'],SPEAKER_SHAPE,'speaker_emb')
    style=numeric_array(voice['style'],STYLE_SHAPE,'style')
    null_speaker=numeric_array(template['null_speaker'],SPEAKER_SHAPE,'null_speaker')
    null_style=numeric_array(template['null_style'],STYLE_SHAPE,'null_style')
    if int(template['sample_rate'])!=24000:raise ValueError('Expected 24 kHz VieNeu Nano')
    if int(template['bos_id'])==int(template['eos_id']):raise ValueError('Invalid BOS/EOS config')
    if steps is not None and not 4<=steps<=32:raise ValueError('Steps must be 4..32')
    if not isinstance(template['vocab'],dict) or len(template['vocab'])<100:raise ValueError('Missing vocab')
    # Prevent prior user's speaker/audio sample from being inherited.
    payload={k:template[k] for k in NECESSARY}
    payload.update({'schema':'vbook-vieneu-nano-web-profile-v2',
                    'voice_speaker':speaker,'voice_style':style,
                    'null_speaker':null_speaker,'null_style':null_style,
                    'steps':int(steps or template['steps'])})
    return payload

def write_exclusive(path:Path,data:bytes,mode:int=0o600):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--private-template',type=Path,required=True)
    ap.add_argument('--embedding-json',type=Path,required=True)
    ap.add_argument('--output-dir',type=Path,required=True)
    ap.add_argument('--voice-id',required=True,help='Letters, digits and dashes only')
    ap.add_argument('--reference-sha256',required=True,help='Hash of input audio; no raw audio embedded')
    ap.add_argument('--steps',type=int,default=None)
    args=ap.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,49}',args.voice_id):ap.error('Invalid voice-id')
    if not re.fullmatch(r'[a-f0-9]{64}',args.reference_sha256):ap.error('Invalid reference hash')
    if args.output_dir.exists():ap.error('Output directory exists; refusing overwrite')
    if args.output_dir.resolve().is_relative_to(Path(__file__).resolve().parents[1]):ap.error('Output must not be inside public source repository')
    templ=json.loads(args.private_template.read_text(encoding='utf8'))
    emb=json.loads(args.embedding_json.read_text(encoding='utf8'))
    profile=build(templ,emb,args.steps)
    raw=json.dumps(profile,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf8')
    key=os.urandom(32)
    iv=os.urandom(12)
    aad='vbook-vieneu-nano-profile-v2:'+args.voice_id+':'+args.reference_sha256[:16]
    cipher=AESGCM(key).encrypt(iv,raw,aad.encode('utf8'))
    envelope={'alg':'AES-256-GCM','iv':b64(iv),'ciphertext':b64(cipher),'aad':aad}
    # Verify cryptographic round-trip before writing anything.
    if AESGCM(key).decrypt(iv,cipher,aad.encode('utf8'))!=raw:raise AssertionError('AES roundtrip')
    args.output_dir.mkdir(mode=0o700,parents=True,exist_ok=False)
    try:
        write_exclusive(args.output_dir/'profile.enc.json',(json.dumps(envelope,ensure_ascii=False)+'\n').encode('utf8'))
        write_exclusive(args.output_dir/'unlock.key',(b64(key)+'\n').encode('ascii'))
        receipt={'schema':'vbook-vieneu-profile-package-receipt-v1',
            'voice_id':args.voice_id,'source_sha256':args.reference_sha256,
            'profile_json_sha256':hashlib.sha256(raw).hexdigest(),
            'ciphertext_sha256':hashlib.sha256((json.dumps(envelope,ensure_ascii=False)+'\n').encode()).hexdigest(),
            'profile_bytes':len(raw),'encrypted_bytes':len(cipher),'speaker_dims':[192],
            'style_dims':[50,256],'steps':profile['steps'],
            'secret_path':'unlock.key (private; DO NOT SHARE)','status':'ENCRYPTED_LOCAL_NOT_DEPLOYED'}
        write_exclusive(args.output_dir/'receipt.json',(json.dumps(receipt,indent=2)+'\n').encode('utf8'))
    except BaseException:
        for p in args.output_dir.iterdir():p.unlink()
        args.output_dir.rmdir()
        raise
    print(json.dumps({'ok':True,'voice_id':args.voice_id,'out':str(args.output_dir),
                      'ciphertext_sha256':receipt['ciphertext_sha256'],
                      'key_saved_private':True,'deployed':False}))

if __name__=='__main__':main()
