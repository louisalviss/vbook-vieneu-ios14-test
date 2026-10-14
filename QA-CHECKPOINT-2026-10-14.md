# iPhone 14 staging QA — 14 October 2026

Canonical target: **iPhone 14 (A15)**; NOT iPhone SE3. The user has accepted the voice quality of the VieNeu v3 Nano clone subjectively (difference from NamMinh not obvious).

## Deployment
- Public code/HTML: https://louisalviss.github.io/vbook-vieneu-ios14-test/
- Secret-bearing authorized staging URL contains an AES-GCM decryption key in the URL fragment. **Never commit the fragment key or plaintext voice profile into GitHub, notes, logs, or a public site.**
- Encrypted voice profile: `profile.enc.json`; decrypted locally on device. 4 ONNX models from a pinned Hugging Face revision, about 281.7 MB combined, plus ONNX Runtime Web and a local Vietnamese word-to-phoneme lexicon.
- Production `vbook-web-offline-r3` with Piper voice remains unchanged; do not promote automatically.

## Confirmed 14 Oct 2026
- Live staging HTTPS GET: index, encrypted profile, service worker, G2P lexicon all returned HTTP 200.
- Actual headless **Chromium 140 on runner-vps1** navigated to live staging with authorized voice fragment and synthesized fresh audio: 116,780 byte WAV in ~4.74 seconds.
- All 4 model files confirmed cached.
- Same Chromium browser switched to offline, reloaded page, synthesized a fresh WAV: PASS in ~4.52 seconds; no page errors.
- This is **NOT** a real iPhone 14 pass.

## iPhone 14 user acceptance
1. Open authorized staging URL in Chrome on iPhone 14 with Wi-Fi.
2. Tap `Tải model & tạo WAV`, confirm audio works; tap `Kiểm tra cache model`.
3. Enable Airplane Mode, reload staging, tap `Tải model & tạo WAV` again.
4. Tap `Sao chép kết quả` and send the report into the ongoing ChatGPT chat.
5. If WebKit memory pressure, long download, cache eviction, or missing phonemes, retain Piper fallback; do not change production.

## Open gates
- Actual iPhone 14 CPU/RAM performance and sustained offline use.
- Full EPUB/chapter narration integration and lock-screen playback.
- Numeric/foreign-name pronunciation in JavaScript lexicon; current browser PoC is not full parity with SEA-G2P.
