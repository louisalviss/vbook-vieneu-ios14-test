import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from create_vieneu_voice_bundle import copy_exclusive

class BundleCopy(unittest.TestCase):
    def test_atomic_exclusive_cross_device(self):
        source_root='/dev/shm' if os.path.isdir('/dev/shm') and os.access('/dev/shm',os.W_OK) else None
        with tempfile.TemporaryDirectory(dir=source_root) as from_dir, tempfile.TemporaryDirectory() as to_dir:
            src=Path(from_dir)/'synthetic.bin'
            dst=Path(to_dir)/'sample.wav'
            content=b'SYNTHETIC_NO_AUDIO_SECRETS'*8192
            src.write_bytes(content)
            copy_exclusive(src,dst)
            self.assertEqual(dst.read_bytes(),content)
            self.assertEqual(dst.stat().st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):copy_exclusive(src,dst)
            self.assertEqual(dst.read_bytes(),content)
