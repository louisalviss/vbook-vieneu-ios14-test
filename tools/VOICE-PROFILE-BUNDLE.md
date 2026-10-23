# Offline VieNeu Nano — reusable new-voice bundle

An isolated, private packager, NOT a promotion to VBook production.

A clean, authorized reference recording must be normalized to 22050 Hz mono
PCM WAV. The complete, PRIVATE template profile (model constants, vocabulary,
null speaker/style) must exist before running the new-voice pipeline.

Example invocation (replace paths and identity for each new reference):

    python3 tools/create_vieneu_voice_bundle.py       --reference /private/audio/reference-22050-mono.wav       --private-template /private/base-profile.json       --voice-id a-new-speaker-id       --clone-python /path/to/vieneu-3.8.3-venv/bin/python       --output-dir /private/voice-bundles/a-new-speaker-id

The orchestrator invokes clone_vieneu_nano.py to enroll [192] speaker features
and [50,256] style features and synthesize a QA WAV. Temporary plaintext
embeddings are created in a private ephemeral directory, then deleted.
package_vieneu_web_profile.py combines the new features with private template
constants and encrypts the complete browser profile using AES-256-GCM.

Private result directory (0700):
  profile.enc.json : encrypted profile, not automatically published
  unlock.key       : bearer secret (0600); NEVER upload/commit/log
  sample.wav       : private audio for subjective QA
  receipt.json     : hashes/dimensions/status ENCRYPTED_LOCAL_NOT_DEPLOYED

The reference audio and plaintext profile are never added to GitHub.
The testing engine is vieneu==3.8.3, steps=16, cfg=3.0, output 24 kHz.

Automated synthetic-data QA:

    python3 -m unittest discover -s tests -p test_voice_profile_packager.py -v

Tests cover invalid shapes, stale template speaker exclusion, AES-GCM
round-trip, Node WebCrypto decryption compatibility, 0700/0600 file modes
and refusing overwrite. Synthetic testing does not prove clone quality,
offline synthesis, or device performance.

Promotion boundary: packaging does not publish or activate another voice.
The existing staging app saves the decrypted profile under one localStorage
key, so silent replacement of the current profile.enc.json would risk using
the old speaker. New voices need a distinct staging/storage identity, E2E
browser WAV acceptance, iPhone 14 offline/relaunch tests and an explicit
production promotion decision. Existing Piper production is unchanged.
