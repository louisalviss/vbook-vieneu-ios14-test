#!/usr/bin/env python3
"""Reference-guided VieNeu v3 Nano voice cloning, isolated from VBook production.

Dependencies (known test environment): vieneu==3.8.3, numpy, soundfile.
Reference WAV must be a local file. No reference audio, embedding or key
is written to source control or uploaded by this script.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf

from vieneu import Vieneu


def main():
    a=argparse.ArgumentParser()
    a.add_argument('--reference',type=Path,required=True,help='Local clean WAV with the authorized reference voice')
    a.add_argument('--text',required=True,help='Vietnamese sentence(s) to synthesize')
    a.add_argument('--output',type=Path,required=True,help='Output test WAV; keep private until accepted')
    a.add_argument('--steps',type=int,default=16)
    a.add_argument('--cfg',type=float,default=3.0)
    a.add_argument('--denoise',action='store_true',help='Optional reference denoising; off for already-clean source')
    a.add_argument('--embedding-json',type=Path,help='Optional private JSON containing just speaker/style arrays (never commit)')
    opts=a.parse_args()
    if not opts.reference.is_file():a.error('Reference WAV does not exist')
    if opts.reference.resolve()==opts.output.resolve():a.error('Output must not overwrite reference')
    if not 4<=opts.steps<=32:a.error('Invalid steps (expected 4-32)')
    if not opts.text.strip():a.error('Text cannot be empty')
    y,sr=sf.read(opts.reference,always_2d=True)
    seconds=y.shape[0]/sr
    if not 3<=seconds<=12:a.error('Reference outside 3-12 seconds. Use an isolated, clean speaker clip')
    if sr!=22050 or y.shape[1]!=1:a.error('Reference must be pre-normalized to 22050 Hz mono WAV')
    tts=Vieneu(mode='v3nano',steps=opts.steps,cfg=opts.cfg)
    speaker,style=tts.encode_reference(opts.reference,denoise=opts.denoise)
    speaker=np.asarray(speaker,dtype=np.float32).reshape(-1)
    style=np.asarray(style,dtype=np.float32).reshape(50,256)
    if speaker.shape!=(192,):raise ValueError('Unexpected speaker dimensions')
    pcm=tts.infer(opts.text,voice={'speaker_emb':speaker,'style':style},
                  steps=opts.steps,cfg=opts.cfg,denoise=False)
    pcm=np.asarray(pcm,dtype=np.float32).reshape(-1)
    if pcm.size<1000 or not np.isfinite(pcm).all():raise RuntimeError('Invalid output PCM')
    opts.output.parent.mkdir(parents=True,exist_ok=True)
    sf.write(opts.output,pcm,tts.sample_rate,subtype='PCM_16')
    if opts.embedding_json:
        opts.embedding_json.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(opts.embedding_json,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w',encoding='utf8') as f:
            json.dump({'schema':'vieneu-v3-nano-speaker-style-v1',
                       'speaker_emb':speaker.tolist(),'style':style.tolist()},f,ensure_ascii=False)
    result={'schema':'vieneu-nano-clone-qa-v1',
            'reference_sha256':hashlib.sha256(opts.reference.read_bytes()).hexdigest(),
            'reference_seconds':round(seconds,3),'reference_sample_rate':sr,
            'engine':'vieneu==3.8.3 v3nano','steps':opts.steps,'cfg':opts.cfg,
            'output_sample_rate':tts.sample_rate,'output_seconds':round(len(pcm)/tts.sample_rate,3),
            'output_sha256':hashlib.sha256(opts.output.read_bytes()).hexdigest(),
            'embedding_saved_private':bool(opts.embedding_json)}
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
