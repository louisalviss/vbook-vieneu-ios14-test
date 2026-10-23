import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class EndToEndSyntheticNoRealCloning(unittest.TestCase):
    def test_wrapper_with_mock_clone_produces_full_private_bundle(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-pipeline-') as root:
            d=Path(root)
            reference=d/'input.wav'
            reference.write_bytes(b'NOT-A-REAL-VOICE'*180)
            config=dict(null_speaker=[0.0]*192,null_style=[0.0]*12800,
                vocab={str(i):i for i in range(160)},bos_id=1,eos_id=2,
                pad_id=0,emotion_map={},fps=15.625,steps=16,cfg=3,sample_rate=24000)
            base=d/'synthetic-private-base.json'
            base.write_text(json.dumps(config))
            fake=d/'synthetic_clone_driver.py'
            fake.write_text("\n".join([
                "#!/usr/bin/env python3",
                "import json,sys,wave",
                "from pathlib import Path",
                "args=sys.argv[1:]",
                "def get(k):return args[args.index(k)+1]",
                "with wave.open(get('--output'),'wb') as w:",
                " w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(bytes(6000))",
                "Path(get('--embedding-json')).write_text(json.dumps({'speaker_emb':[.125]*192,'style':[[.0625]*256 for _ in range(50)]}))",
                "print(json.dumps({'mock':True}))",
                ""]))
            fake.chmod(0o700)
            dest=d/'private-result'
            cmd=[sys.executable,str(ROOT/'tools/create_vieneu_voice_bundle.py'),
                '--reference',str(reference),
                '--private-template',str(base),
                '--output-dir',str(dest),
                '--clone-python',str(fake),
                '--voice-id','mock-voice-test']
            result=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr[-500:])
            self.assertTrue(json.loads(result.stdout)['ok'])
            self.assertEqual({p.name for p in dest.iterdir()},
                {'profile.enc.json','unlock.key','sample.wav','receipt.json'})
            self.assertGreater((dest/'sample.wav').stat().st_size,1000)
            self.assertEqual(os.stat(dest/'sample.wav').st_mode&0o777,0o600)
            verify=subprocess.run(['node',str(ROOT/'tests/verify_voice_profile_webcrypto.cjs'),str(dest)],
                                  capture_output=True,text=True,timeout=15)
            self.assertEqual(verify.returncode,0,verify.stderr[-300:])
            receipt=json.loads((dest/'receipt.json').read_text())
            self.assertEqual(receipt['sample_wav_bytes'],(dest/'sample.wav').stat().st_size)
            self.assertEqual(receipt['status'],'ENCRYPTED_LOCAL_NOT_DEPLOYED')
