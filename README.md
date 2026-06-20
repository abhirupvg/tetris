# Tetris 3D

A 3D Tetris experience built with Three.js, featuring realistic PBR materials, HDRI environment lighting, bloom post-processing, and a clean glassmorphism UI.

![Tetris 3D](https://img.shields.io/badge/Three.js-r160-blue) ![License](https://img.shields.io/badge/assets-CC0%20%2F%20Mixkit%20Free-green)

## Features

- **Realistic 3D Rendering** — PBR materials with clearcoat, HDRI environment reflections, soft shadows, and UnrealBloom post-processing
- **Full Tetris Gameplay** — SRS rotation with wall kicks, 7-bag randomizer, hold piece, ghost piece, lock delay, DAS
- **Visual Polish** — Particle effects on line clear, emissive block glow, camera drift, ambient starfield
- **Sound Design** — 8 game sound effects + atmospheric ambient background music
- **Clean UI** — Glassmorphism panels, smooth animations, score/level/lines tracking, next piece queue, hold preview
- **Controls** — Full keyboard support with DAS (Delayed Auto Shift)

## Controls

| Key | Action |
|-----|--------|
| `←` / `→` or `A` / `D` | Move piece |
| `↓` or `S` | Soft drop |
| `↑` or `W` or `X` | Rotate clockwise |
| `Z` | Rotate counter-clockwise |
| `Space` | Hard drop |
| `C` or `Shift` | Hold piece |
| `P` or `Esc` | Pause |
| `Enter` | Start / Restart |

## Tech Stack

- **[Three.js](https://threejs.org/)** r160 — 3D rendering engine
- **Web Audio API** — Sound playback
- **Vanilla JS / CSS / HTML** — No build tools required

## Assets

All assets are free to use:

- **HDRI**: [Studio Small 09](https://polyhaven.com/a/studio_small_09) by Poly Haven (CC0)
- **Sound Effects**: [Mixkit](https://mixkit.co/) Free Sound Effects
- **Background Music**: "Vastness" by Andrew Ev from [Mixkit](https://mixkit.co/free-stock-music/ambient/)

## Getting Started

### Prerequisites

- A modern web browser with WebGL support
- Python 3 (for local server) or any static file server

### Run Locally

```bash
# Clone the repository
git clone https://github.com/abhirupvgunakar/tetris.git
cd tetris

# Start a local server
python3 -m http.server 8080

# Open in your browser
open http://localhost:8080
```

> **Note:** You must use a local server (not `file://`) because the game uses ES modules and fetch for assets, which require proper HTTP origins.

## Project Structure

```
tetris3d/
├── index.html              # Main page + UI overlays
├── css/
│   └── style.css           # Glassmorphism UI styling
├── js/
│   ├── tetris.js           # Game logic (SRS, scoring, 7-bag)
│   ├── audio.js            # Audio manager (SFX + BGM)
│   └── main.js             # Three.js rendering + game loop
└── assets/
    ├── hdri/
    │   └── studio_small_09_1k.hdr   # Environment map
    └── sounds/
        ├── move.wav
        ├── rotate.wav
        ├── piece_lock.wav
        ├── line_clear.wav
        ├── hard_drop.wav
        ├── hold.wav
        ├── level_up.wav
        ├── game_over.wav
        └── bgm.mp3                  # Background music
```

## License

Code is provided as-is. Assets retain their original licenses (CC0 for HDRI, Mixkit Free License for sounds and music).
