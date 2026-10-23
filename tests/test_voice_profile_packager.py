#!/usr/bin/env python3
"""Synthetic-only tests: NO real audio, secrets, or user's private profile."""
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from package_vieneu_web_profile import build

def unb64(s):
    return base64.urlsafe_b64decode(s+'='*((-len(s))%4))

def fixture():
    template=dict(schema='old-profile',sample_text='STALE_REFERENCE_TEXT_SHOULD_NOT_LEAK',
        sample_phonemes='STALE_PHONEMES',
        voice_speaker=[99.0]*192,voice_style=[99.0]*12800,
        null_speaker=[0.0]*192,null_style=[0.0]*12800,
        vocab={str(i):i for i in range(160)},bos_id=1,eos_id=2,
        pad_id=0,emotion_map={},fps=15.625,steps=16,cfg=3.0,sample_rate=24000)
    voice={'speaker_emb':[0.125]*192,
        'style':[[0.0625]*256 for i in range(50)]}
    return template,voice

class Packager(unittest.TestCase):
    def test_shape_and_previous_voice_removed(self):
        template,voice=fixture()
        payload=build(template,voice)
        self.assertEqual(len(payload['voice_speaker']),192)
        self.assertEqual(len(payload['voice_style']),12800)
        self.assertEqual(payload['voice_speaker'][0],0.125)
        self.assertNotIn('sample_text',payload)
        self.assertNotIn('sample_phonemes',payload)
        self.assertNotIn(99.0,payload['voice_speaker'])
    def test_reject_invalid_inputs(self):
        template,voice=fixture()
        voice['style']=[[0.1]*255 for i in range(50)]
        with self.assertRaises(ValueError):build(template,voice)
        template,voice=fixture()
        voice['speaker_emb']=[float('nan')]*192
        with self.assertRaises(ValueError):build(template,voice)
    def test_encrypt_decrypt_webprofile_and_no_overwrite(self):
        template,voice=fixture()
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)
            (path/'base.json').write_text(json.dumps(template))
            (path/'embedding.json').write_text(json.dumps(voice))
            output=path/'encrypted'
            cmd=[sys.executable,str(ROOT/'tools/package_vieneu_web_profile.py'),
                 '--private-template',str(path/'base.json'),
                 '--embedding-json',str(path/'embedding.json'),
                 '--output-dir',str(output),
                 '--voice-id','synthetic-sample',
                 '--reference-sha256','0'*64]
            result=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr[-400:])
            envelope=json.loads((output/'profile.enc.json').read_text())
            raw=AESGCM(unb64((output/'unlock.key').read_text().strip())).decrypt(
                unb64(envelope['iv']),unb64(envelope['ciphertext']),
                envelope['aad'].encode('utf8'))
            profile=json.loads(raw)
            self.assertEqual(profile['voice_speaker'][0],0.125)
            self.assertNotIn('STALE_REFERENCE_TEXT_SHOULD_NOT_LEAK',raw.decode('utf8'))
            self.assertEqual(os.stat(output/'unlock.key').st_mode&0o777,0o600)
            self.assertEqual(os.stat(output).st_mode&0o777,0o700)
            other=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
            self.assertNotEqual(other.returncode,0)
            self.assertEqual(json.loads((output/'profile.enc.json').read_text()),envelope)
            js=subprocess.run(['node',str(ROOT/'tests/verify_voice_profile_webcrypto.cjs'),str(output)],
                              capture_output=True,text=True,timeout=15)
            self.assertEqual(js.returncode,0,js.stderr[-400:])
            self.assertIn('WEBCRYPTO_PASS',js.stdout)

if __name__=='__main__':unittest.main()
