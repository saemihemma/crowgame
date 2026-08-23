# Hörmann — Web build (mobile playable)

This is the Godot 4 Web (HTML5) export of the Hörmann port. It's a **single-threaded**
build, so it runs from any static host with no special headers (works on phones).

## Play it
- **Any static host:** upload the contents of this folder (`index.html`, `index.wasm`,
  `index.pck`, `index.js`, `index.audio.worklet.js`, `index.png`) to e.g. itch.io,
  Netlify, GitHub Pages, or any web server, and open `index.html`.
- **On your phone over local Wi-Fi:**
  ```bash
  cd output/web
  python3 -m http.server 8060
  ```
  then open `http://<your-computer-ip>:8060` in your phone's browser.

## Controls
- **Touch:** on-screen D-pad (bottom-left), Jump + interact (E) bottom-right.
- **Keyboard:** A/D or ←/→ move, Space/W/↑ jump, E interact, Esc pause.

## Rebuild
```bash
bash godot/tools/build_web.sh
```
Requires Godot 4.3 + Web export templates installed.
