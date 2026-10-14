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
