# motion-video

An agent skill that turns a short brief into a directed motion-graphics MP4.

Your AI agent works from what you give it (researching only the gaps), writes a direction (concept, look, beats, sound), builds the scenes as HTML, CSS and SVG, and renders them frame-exact with headless Chromium and ffmpeg. Sound effects are synthesized from the motion on screen, so every hit lands on its frame.

## What you can make

| Video                 | Example request                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| Product teaser        | "A 30-second teaser for the app in this repo."                               |
| Feature explainer     | "Explain how our invoice scanner works, 45 seconds, from these screenshots." |
| App demo or tutorial  | "A walkthrough of the sign-up flow, portrait, for Instagram."                |
| Lesson or explainer   | "A 60-second video that explains how DNS resolves a domain."                 |
| Data story            | "Turn these quarterly numbers into a short animated story."                  |
| Event or announcement | "Announce our meetup on 12 March, with the venue photo."                     |
| Music-synced edit     | "Cut these screenshots to this track, on the beat."                          |
| Kinetic typography    | "Our manifesto as kinetic type, no UI."                                      |

Give it whatever you have: a repo, a URL, screenshots, a logo, footage, music, a voiceover. With only a one-line brief, the agent researches the subject itself and puts only real facts on screen.

## Install

Give your AI agent the URL of this repository and ask it to install the skill:

> Install the motion-video skill from https://github.com/farhan-syah/motion-video-skill for yourself, then run its setup.

The agent clones the repo into the folder where it loads skills, as `motion-video/`, then installs the dependencies.

**Manual install:**

1. Clone this repo into your agent's skills folder: `git clone https://github.com/farhan-syah/motion-video-skill motion-video`.
2. Run `cd motion-video/scripts && bun install`.
3. For an agent without a skills feature, tell it to read `motion-video/SKILL.md` before it makes a video.

**Requirements:**

- **Bun:** installs the dependencies and fetches fonts (https://bun.sh). npm works as a fallback.
- **Node.js 20+:** it runs the CLI.
- **ffmpeg and ffprobe:** on `PATH`.
- **Chrome or Chromium:** found automatically. Otherwise run `bunx playwright install chromium-headless-shell` in `scripts/`.
- **GPU (optional):** Chromium draws on the GPU when one is available. An NVIDIA GPU also encodes with NVENC. Without either, rendering runs on the CPU.

## Use

Ask for a video in plain words. The agent follows `SKILL.md`:

1. **Sweep:** it checks your machine (CPU, GPU, speech engines and models) and the files in your folder, so it plans with what you have.
2. **Gather facts:** it works from what you supplied, and researches the subject (repo, docs, site) only to fill the gaps. It writes the facts down with their sources.
3. **Ask:** when an answer would change the video (purpose, format, voice, must-haves), it asks a few quick questions with defaults. Say "one-shot" to skip them.
4. **Direct:** it writes `direction.md`: three concepts, the chosen one, the look, the sound, and a beat-by-beat plan.
5. **Build:** it writes one HTML file per scene, from a kit of UI parts, 3D props, atmospheres, 1854 icons and any font from Fontsource.
6. **Check:** it lints each scene for text size, contrast, reading time, overlap and safe area, and reviews still frames.
7. **Render:** it captures every frame, mixes the sound, audits sound sync and loudness, and writes a contact sheet.

The project folder holds everything: `direction.md`, `scenes/`, `video.json`, and the output: `out/video.mp4` (master) and `out/video-share.mp4` (a copy about a quarter the size, for chat apps and social uploads).

**Sound:** no music is ever added unless you supply it. Without music, the video gets motion sound effects: each effect is bound to the element whose motion makes it.

**Voiceover:** give it a recorded narration, a TTS file, or just a script. It speaks English locally out of the box, speaks 30 languages with VoxCPM2 when your NVIDIA GPU has 8 GB, and plugs into any TTS you already use. A local Whisper model times every word. Word-synced captions highlight each word as it is spoken, scenes follow the speech, and `check` fails any line that is off screen while its words are spoken.

**Maps:** real country outlines, pins and animated routes, from Natural Earth data.

**Beyond the kit:** scenes can use canvas, WebGL (three.js), GSAP, Lottie files, and footage extracted to frames. See `references/building.md`.

## CLI

The agent runs `node scripts/video.mjs <command>` from the project folder. You can run it too.

| Command                   | Does                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `doctor`                  | Sweeps the machine, speech engines and your files before directing |
| `init <dir>`              | Creates a project from the templates                                |
| `check [--scene N]`       | Lints scenes. With `--scene`, also writes that scene's still sheet. |
| `still [--scene N] [T…]`  | Writes frames or contact sheets                                     |
| `render [--draft]`        | Renders, writes a small share copy, audits the sound, and writes `out/sheet.png` |
| `font "Family"`           | Fetches a font into the project                                     |
| `lib gsap\|three\|lottie` | Copies a browser library into the project                           |
| `footage FILE`            | Extracts a clip into frames for a scene                             |
| `beats [FILE]`            | Analyzes music for beat-synced cuts                                 |
| `speak FILE`              | Makes a narration from a script: local Kokoro (English), VoxCPM2 (30 languages), any transformers.js voice, or your own TTS command |
| `transcribe`              | Times every word of a voiceover or TTS file, locally, so the picture follows the speech |
| `map --out SVG …`         | Draws a map (countries, pins, routes) from Natural Earth data |

Every command and `video.json` field: `references/cli.md`.

**Environment:**

| Variable                 | Effect                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `MOTION_VIDEO_CHROME`    | Path to the Chrome binary to use                              |
| `MOTION_VIDEO_GPU=0`     | Draws in software                                             |
| `MOTION_VIDEO_NVENC=0`   | Encodes with libx264                                          |
| `MOTION_VIDEO_LEAD_LOSS` | dB the limiter may take from the loudest moment (default 1.5) |
| `MOTION_VIDEO_MODELS`    | Folder for downloaded speech models. Also settable as `"models"` in `~/.config/motion-video/config.json`. |

## Repository layout

| Path           | Contents                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `SKILL.md`     | The workflow the agent follows                                                                   |
| `references/`  | Direction, concepts, building, craft thresholds, styles, CLI, icon index                         |
| `templates/`   | What `init` copies into a project: CSS kit, runtime, fonts, icons, scene and direction templates |
| `scripts/`     | The CLI, renderer, linter, sound synthesis and audit                                             |
| `scripts/dev/` | Tools for editing the sound catalog                                                              |

## Development

- **Tests:** `node --test scripts/lib/`
- **Sound catalog review:** `node scripts/dev/render-sounds.mjs <dir>`, then `uv run scripts/dev/sound-review.py <dir>`

## License

MIT. See `LICENSE`.

**Bundled:**

- Lucide icons (ISC): `templates/icons.LICENSE.txt`
- Inter and JetBrains Mono fonts (SIL OFL 1.1): `templates/fonts/OFL.txt`

**Installed as dependencies:**

- Playwright (Apache 2.0)
- three.js and lottie-web (MIT)
- GSAP, under its own no-charge license: https://gsap.com/standard-license
- world-atlas, d3-geo and topojson-client (ISC), with Natural Earth data (public domain)

**Installed on first use of `speak` or `transcribe`:**

- transformers.js (Apache 2.0) and ONNX Runtime (MIT)
- Kokoro-82M (Apache 2.0) and Whisper (MIT) models
- VoxCPM2 (Apache 2.0), only with `speak --engine voxcpm`: its Python environment through `uv`, and the model unless one is already on disk

Fonts fetched with `font` keep their own licenses. Each one's license file is copied next to the font.
