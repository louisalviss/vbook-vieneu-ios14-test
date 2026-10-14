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

## Status UI fix — 14 October 2026
- Reported issue: iPhone user tapped the download button and saw no feedback; progress log was hidden down the page and `serviceWorker.ready` was awaited before showing a status.
- Added a visible under-button status/progress area immediately acknowledging the tap, per-model names, bytes/percentage of the 281.7 MB bundle, ONNX model load and each synthesis step, completion/error text, and a bounded Service Worker wait.
- Models are saved explicitly with a streamed CacheStorage writer that updates download bytes and avoids retaining an entire model in a JavaScript download buffer.
- Updated Service Worker cache version and allowed offline reloads of query-string cache-busted staging URLs.
- **Live HTTPS Chromium validation**: immediate button change PASS; all 4 models freshly streamed/cached PASS; new 116,780-byte WAV PASS; browser reloaded with network disabled and generated another WAV PASS; 0 browser JavaScript exceptions.
- UI/deploy GitHub commits: dd8a3738, 9d5aefa6, 97ef45f6, 84482c9a. Build production PASS; latest GitHub Pages workflow for 84482c9a succeeded.
- **Real iPhone 14 result remains unverified**. User should refresh the staging URL and report the visible stage / failure text if iOS cannot complete.
