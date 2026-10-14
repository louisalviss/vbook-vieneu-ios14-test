# VieNeu + Piper Library staging — 2026-10-14
Status: SOURCE_BUILD_PASS / LIVE_EPUB_TEST_PENDING / IPHONE14_PENDING.

- Private/isolated staging under /vbook-vieneu-ios14-test/library/ (same browser origin as existing VieNeu test).
- The old production /vbook-web-offline-r3/ and standalone iOS14 voice tester are unchanged.
- Library: EPUB import, bookshelf, progress, TOC, chapter WAV cache, current Piper engine preserved.
- User can choose Piper or VieNeu Nano in reader toolbar and settings. Choice persists locally.
- VieNeu profile reads from the same-origin private localStorage created by the earlier authorized test; no decryption key or plaintext voice profile is embedded in GitHub.
- Cached four-model ONNX bundle from the standalone preview is reused through CacheStorage; preloading from CacheStorage Blob URL supports offline with the child-scope Service Worker, so no remote fetch is required to load weights.
- VieNeu uses local SEA-G2P lookup, voice embedding and sixteen diffusion steps. Text chunk bound 115 Unicode chars per chunk. Numbers, foreign names and full Vietnamese normalization parity are not proven.
- Cached chapter audio key includes voice ID and revision to prevent cross-voice reuse.
- Piper remains fallback by user selection; automatic fallback is not claimed.
- npm run check 20/20 PASS; npm run build PASS; npm run verify:dist PASS on VPS.
- Real iPhone 14 model RAM, offline persistence, long-book playback and screen-lock audio remain acceptance gates.

## Live browser acceptance — Chromium on VPS — 2026-10-14
- Standalone authorized VieNeu test first generated WAV with all four 281.7 MB models loaded/cache stored. Same-origin Library reused CacheStorage and voice profile, no secret or plaintext voice embedding in GitHub.
- Live Library at `https://louisalviss.github.io/vbook-vieneu-ios14-test/library/`: imported bundled EPUB *Chuyến đi qua rừng mưa — Sách thử*, opened its first chapter, selected VieNeu and synthesized WAV from actual EPUB text in 11.4 seconds; zero JS exceptions.
- Then confirmed controlling child-scope `library/sw.js`, switched the browser context fully offline, reloaded Library successfully, reopened the saved EPUB from IndexedDB and synthesized another fresh WAV via VieNeu, 11.4 seconds; navigator.onLine=false; zero JS exceptions.
- Switched selector back to Piper; choice persisted. This is a selector integration proof, **not a fresh Piper ONNX speech benchmark**.
- Tested source suite 22/22 PASS, production build PASS, dist verification PASS, latest Pages deployment successful.
- Fixed loading race (narration disabled until EPUB rendition ready, including voice switches), Vietnamese numeric headings (e.g. Chương 1, years), unintended auto-reloads on SW activation (registerType=prompt), and wrong offline navigation fallback; dist verification now fails if fallback reverts to old production path.
- User iPhone 14 browser remains **DEVICE_NOT_TESTED**. Lock-screen playback, memory/eviction, and multi-chapter robustness are pending; keep existing Piper production untouched.
- Local Chromium QA script on VPS (not published; reads device staging unlock key locally): `/opt/vbook-web-voice-lab/status-r2-qa/tests/library-live-r1.cjs`.
