# VBook VieNeu — iPhone 14 offline staging

Standalone browser compatibility test, NOT VBook production.

- App and client-side WASM shipped through GitHub Pages.
- 4 pinned ONNX models downloaded from official Hugging Face model revision on first synthesis, cached via Service Worker.
- Voice embedding encrypted using AES-256-GCM. A private key passed in a URL fragment (#k=...) is not published in the server or repository.
- Decrypted voice cached locally. Inference happens offline in the browser.
- Model size 281.7 MB; real iPhone 14 performance is not proven.
- Model source: pnnbao-ump/VieNeu-TTS-v3-Nano Apache-2.0; G2P source: pnnbao97/sea-g2p.
- Production VBook Web Piper engine unchanged.
- No analytics. Launch fragment is a bearer key and should not be redistributed.

On iPhone 14: open authorized staging URL, tap Tải model & tạo WAV, enable airplane mode, reload, retry, use Sao chép kết quả to report performance.
