#!/usr/bin/env python3
"""Create private encrypted VieNeu browser voice profile from an authorized WAV.

One command orchestrates clone -> WAV QA -> temporary embedding -> AES-256-GCM
encrypted Web profile. No secret or plaintext embedding is published to GitHub.
The result remains local, not deployed/activated in the existing VBook reader.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS=Path(__file__).resolve().parent

def copy_exclusive(source:Path,destination:Path):
    """Copy to 0600 O_EXCL destination even across /dev/shm and disk volumes."""
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'wb') as target, source.open('rb') as stream:
            shutil.copyfileobj(stream,target,1024*1024)
            target.flush()
            os.fsync(target.fileno())
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--reference',type=Path,required=True)
    ap.add_argument('--private-template',type=Path,required=True)
    ap.add_argument('--output-dir',type=Path,required=True)
    ap.add_argument('--voice-id',required=True)
    ap.add_argument('--text',default='Buổi sáng trời trong, những trang sách đã sẵn sàng.')
    ap.add_argument('--clone-python',default='python3',help='Python executable with VieNeu v3nano installed')
    ap.add_argument('--steps',type=int,default=16)
    ap.add_argument('--cfg',type=float,default=3.0)
    ap.add_argument('--denoise',action='store_true')
    a=ap.parse_args()
    ref=a.reference.resolve(strict=True)
    if a.output_dir.exists():ap.error('Destination exists: refusing overwrite')
    if not a.private_template.is_file():ap.error('Missing PRIVATE complete browser profile template')
    digest=hashlib.sha256(ref.read_bytes()).hexdigest()
    tmp_root='/dev/shm' if os.path.isdir('/dev/shm') and os.access('/dev/shm',os.W_OK) else None
    with tempfile.TemporaryDirectory(prefix='vbook-voice-enrollment-',dir=tmp_root) as work:
        tmp=Path(work)
        wav=tmp/'test.wav'
        emb=tmp/'embedding.json'
        clone=[a.clone_python,str(TOOLS/'clone_vieneu_nano.py'),
            '--reference',str(ref),'--text',a.text,'--output',str(wav),
            '--embedding-json',str(emb),'--steps',str(a.steps),'--cfg',str(a.cfg)]
        if a.denoise:clone.append('--denoise')
        # No secret-bearing args; the test WAV and embedding remain private.
        result=subprocess.run(clone,capture_output=True,text=True,timeout=240)
        if result.returncode:
            raise RuntimeError('Reference enrollment failed: '+result.stderr[-600:])
        if not wav.is_file() or wav.stat().st_size<1000:raise RuntimeError('Missing test WAV')
        pack=[sys.executable,str(TOOLS/'package_vieneu_web_profile.py'),
            '--private-template',str(a.private_template),'--embedding-json',str(emb),
            '--output-dir',str(a.output_dir),'--voice-id',a.voice_id,
            '--reference-sha256',digest,'--steps',str(a.steps)]
        packed=subprocess.run(pack,capture_output=True,text=True,timeout=60)
        if packed.returncode:raise RuntimeError('Encryption failed: '+packed.stderr[-700:])
        final_wav=a.output_dir/'sample.wav'
        try:
            # /dev/shm and the durable private output may be different devices;
            # os.replace raises EXDEV. Use an exclusive, 0600, streaming copy.
            copy_exclusive(wav,final_wav)
            wav.unlink()
            receipt_path=a.output_dir/'receipt.json'
            data=json.loads(receipt_path.read_text())
            data.update({'sample_wav_sha256':hashlib.sha256(final_wav.read_bytes()).hexdigest(),
                         'sample_wav_bytes':final_wav.stat().st_size})
            receipt_path.write_text(json.dumps(data,indent=2)+'\n')
            os.chmod(receipt_path,0o600)
            print(json.dumps({'ok':True,'voice_id':a.voice_id,
                              'reference_sha256':digest,
                              'output_dir':str(a.output_dir),'sample_bytes':final_wav.stat().st_size,
                              'ciphertext_sha256':data['ciphertext_sha256'],
                              'key_saved_private':True,'deployed':False}))
        except BaseException:
            # Never leave a falsely completed bundle containing only the key/profile.
            shutil.rmtree(a.output_dir)
            raise

if __name__=='__main__':main()
