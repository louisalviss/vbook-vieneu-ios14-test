# VBook Web PWA — Offline reader + Vietnamese TTS (R3)

R1: source-ready only; build and real-device acceptance are still pending. A private, separate proof of concept. It does not modify the production VBook native apps, Google Drive sync, Media Revoice, or existing VPS routes.

## Included

- Import locally owned EPUB from Files (no upload), full EPUB rendering and table of contents via epub.js.
- Local bookshelf and per-book reading CFI position in IndexedDB. Library works offline after the PWA shell is cached.
- Piper `vi_VN-vais1000-medium` model via `@mintplex-labs/piper-tts-web` and ONNX Runtime Web WASM.
- Model download to OPFS on first use, local phonemizer and ONNX WASM assets precached by service worker.
- Read current EPUB section in sentence-sized chunks; playback with iOS-compatible standard audio control fallback.
- Pre-synthesize up to 80 chunks into a single local WAV to reduce reliance on background JavaScript after screen-lock; allow WAV download.
- Import the bundled Vietnamese test EPUB without a separate upload.
- Verify both .onnx and .onnx.json in OPFS before reporting an offline voice ready.
- Progress and model-state indicators; responsive UI; offline network status.

**IMPORTANT:** The current voice is the existing Piper Vietnamese baseline; it is **not** the NamMinh-alike model. No training or voice comparison has been performed. The PWA + iOS WASM performance, storage durability, iOS autoplay, and background playback require an actual iPhone test.

## Requirements

Node.js 20+ / npm 10+, HTTPS for iOS (localhost is accepted during development). iOS 17+ recommended.

## Build

```bash
npm install
npm run check
npm run build
npm run verify:dist
npm run preview
```

The `prepare-assets` script copies the installed ORT WASM and piper phonemizer data into `public/runtime/` to guarantee they are hosted on the same origin, rather than relying on CDN paths at inference time. The 63.2 MB ONNX model downloads directly from the Piper voice Hugging Face repository when the user presses **Tải & kiểm thử giọng offline**; the library writes it to OPFS. Subsequent model use does not require a server. Expected cached app shell and runtime may use substantial browser storage.

Use a private HTTPS origin / unguessable preview while testing. Serve `dist/` using a normal static hosting service. For SPA route fallback, send unknown routes to `/index.html`. Don't change the existing `/vbook/` routes until user acceptance.

### Nginx static example (NEW isolated hostname only)

```
server {
  listen 443 ssl http2;
  server_name vbook-reader.example.com;
  # Supply your normal TLS certificate configuration separately.
  root /var/www/vbook-web-pwa/dist;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /runtime/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
}
```

Don't use `http://<VPS-IP>` on iPhone: service workers / OPFS require a secure context.

## iPhone acceptance gates

1. Open on Chrome iOS, import an EPUB2 file, scroll/turn pages, close tab, reopen, verify the book and CFI position persist.
2. With internet, open Settings > **Tải & kiểm thử giọng offline**; wait for WAV test success and 'Model đã lưu'.
3. Switch to airplane mode (ensure no Wi-Fi), reload app, open stored EPUB, synthesize/play chapter speech; inspect network requests and ensure **no remote inference**.
4. Measure 20-second Vietnamese source synthesis latency, peak memory, battery temperature, interruption/resume, and whether audio continues after screen lock. Do not claim background playback until this passes.
5. Simulate low storage / OPFS eviction; display recovery needs re-download.

## Boundaries

- Android VBook's chapter-export pipeline remains canonical. Use its existing **minimal EPUB2** file as input to this separate reader.
- `navigator.storage.persist()` is best effort. iOS may evict site storage under pressure.
- Offline requires first online model download and completed service-worker installation. Initial `navigator.onLine` isn't authoritative proof.
- Current script reads a **rendered EPUB section** rather than whole book; synthesized WAVs are ephemeral and not cached between launches.
- Playback while screen is locked on iOS is not guaranteed, especially when synthesis of a new segment is required.
- EPUB 0.3.93 and Piper browser dependencies should undergo security review for untrusted EPUBs before public release. Do not allow active book scripting.
- This repository intentionally does not fetch, collect, or train on Microsoft NamMinh audio.
- No cost-incurring external GPU jobs are created.

## Source references

- https://github.com/futurepress/epub.js
- https://github.com/Mintplex-Labs/piper-tts-web
- https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vais1000/medium

## R1 smoke-test and deployment status (2026-10-14)

- `npm run check`: **9/9** unit tests pass with Node.js 22 (text and audio/WAV concatenation).
- `npm install`: blocked in the code-authoring environment by lack of DNS to registry.npmjs.org; **no dependencies installed**.
- `npm run build`, `npm run verify:dist`: **not executed**. Any claims of PWA runtime success are premature.
- Github/VPS write actions through currently available connectors: blocked by security policy at the time of this checkpoint; production untouched.
- iPhone SE3 / Chrome iOS: **not tested**; lock-screen playback **not guaranteed**.
- Narrator voice: untrained stock Piper `vi_VN-vais1000-medium` only; custom NamMinh-alike **not produced**.

Do not announce the URL or mark deployment PASS unless the build, `verify:dist`, public HTTPS GET, airplane-mode reload, and offline TTS tests all succeed.

## R2 — 2026-10-14

- Same EPUB and section + same voice + same 80-chunk limit now produce the same deterministic SHA-256 address. A completed chapter WAV can be reused without rerunning the model after a browser restart.
- Schema upgrades non-destructively from IndexedDB v1 to v2 and adds a `chapterAudio` store. Removing a book removes its cached WAV files. New settings action clears all WAVs without touching the EPUB library.
- Only cache completed WAV files <= 70 MiB. Quota errors don't prevent playback during the current session.
- Offline model status requires both model and a parseable Piper configuration with valid audio rate and phonemizer settings (not merely a filename).
- Added DOM control contract and service-worker precache checks to prevent shipping missing controls and uncached ONNX/Piper runtime files.
- Current machine runs static/unit validation, but **cannot finish npm install** due DNS failure. On a build host with registry access, execute `npm install && npm run check && npm run build && npm run verify:dist` to finish release proof.
- Test iPhone Chrome in airplane mode and reloaded page before claiming offline user acceptance. This remains a **source-only R2**, not deployed or trained with NamMinh.

## R3 — local offline completeness inspection (2026-10-14)

- Settings now offer **Kiểm tra gói offline**, which reads the cached Service Worker shell, cached manifest, every ONNX WASM and phonemizer file, plus the model in OPFS. The inspection never downloads missing assets and does not assume `navigator.onLine` is proof of offline usability.
- Bundling writes a `runtime/manifest.json` with every local runtime asset's byte size. This manifest is precached by the PWA service worker, and the `verify:dist` release gate checks the files and cache coverage.
- WAV chapter cache keys now include `modelRevision` to avoid using stale WAVs if a new narrator model replaces the baseline.
- `npm run check` passes 19 automated tests, including six new offline-readiness checks.
- **No completed npm build, HTTPS deployment, Chrome iOS benchmark or voice-cloning acceptance has been established yet.** The test harness does not execute Piper ONNX inference.
