# motion-video

An agent skill that turns a short brief into a directed motion-graphics MP4.

Your AI agent researches only what you did not supply and writes a direction. It builds the scenes in HTML, CSS and SVG, and renders them frame-exact with headless Chromium and ffmpeg. Sound effects are synthesized from the motion on screen, so every hit lands on its frame.

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

Give it whatever you have: a repo, a URL, screenshots, a logo, footage, music, a voiceover. From a one-line brief, the agent researches the subject and puts only real facts on screen.

## Install

Ask your AI agent:

> Install the motion-video skill from https://github.com/farhan-syah/motion-video-skill for yourself, then run its setup.

**For the agent doing the install:**

1. **Clone:** `git clone https://github.com/farhan-syah/motion-video-skill <skills-folder>/motion-video`. Use the folder your tool loads skills from, else any folder the user picks.
2. **Install:** `cd <skills-folder>/motion-video/scripts && bun install`, or `npm install` without Bun.
3. **Check:** run `node scripts/video.mjs doctor` in the user's folder. Fix what it marks missing, or tell the user.
4. **Speech (optional):** the first `speak` or `transcribe` installs the local speech runtime and downloads its models once. `"models"` in `~/.config/motion-video/config.json` points at a folder the user keeps.
5. **Report** the installed version and anything `doctor` found missing.

**Manual install:** `git clone https://github.com/farhan-syah/motion-video-skill motion-video` into your agent's skills folder, then `cd motion-video/scripts && bun install`. An agent without a skills feature must read `motion-video/SKILL.md` before it makes a video.

**Requirements:**

- **Bun** (https://bun.sh) installs dependencies and fetches fonts. npm works as a fallback.
- **Node.js 20+.**
- **ffmpeg and ffprobe** on `PATH`.
- **Chrome or Chromium,** found automatically. Otherwise run `bunx playwright install chromium-headless-shell` in `scripts/`.
- **GPU (optional):** Chromium draws on any available GPU, and an NVIDIA GPU also encodes with NVENC. Otherwise rendering runs on the CPU.

## Versions and updates

- **Installed version:** `node scripts/video.mjs version`, also printed by `doctor`. `CHANGELOG.md` lists what each version adds.
- **When to check:** when the user asks, or when `doctor` says one is due. It is due when none ran yet, or the last is over 30 days old. The skill never uses the network for this unasked.
- **Check:** `node scripts/video.mjs update --check` shows what a newer version adds.
- **Update:** with the user's consent, `node scripts/video.mjs update` pulls the latest version and reinstalls the dependencies. On local edits or a branch other than `main`, it changes nothing and says what to do.
- **Not a git clone:** replace the folder with a fresh clone, then run the install step again.

## Use

Ask for a video in plain words. The agent follows `SKILL.md`. It checks your machine and files, gathers facts, and asks a few questions with defaults (say "one-shot" to skip them). Then it writes `direction.md`, builds one HTML file per scene, lints each scene, and renders.

The kit holds UI parts, 3D props, atmospheres, maps from Natural Earth data, 1854 icons and any Fontsource font. Scenes can also use canvas, WebGL (three.js), GSAP, Lottie and footage.

Output: `out/video.mp4` (master) and `out/video-compressed.mp4`, about a quarter the size, for chat apps and social uploads.

**Sound:** music only when you supply it. Otherwise each motion gets a synthesized sound effect.

**Voiceover:** your recording, a TTS file, subtitles or a script (plain or timed per line), used as given. English speech runs locally out of the box. VoxCPM2 speaks 30 languages on an NVIDIA GPU with 8 GB. Any TTS you already use plugs in. A local Whisper model times every word, so captions and scenes follow the speech.

## CLI

The agent runs `node scripts/video.mjs <command>` from the project folder. You can run it too. Every command, `video.json` field and environment variable: `references/cli.md`.

## Repository layout

| Path           | Contents                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `SKILL.md`     | The workflow the agent follows                                                                   |
| `CHANGELOG.md` | What each version adds                                                                           |
| `references/`  | Direction, concepts, building, craft thresholds, styles, CLI, icon index                         |
| `templates/`   | What `init` copies into a project: CSS kit, runtime, fonts, icons, scene and direction templates |
| `scripts/`     | The CLI, renderer, linter, sound synthesis and audit                                             |
| `scripts/dev/` | Tools for editing the sound catalog                                                              |

## Development

See `CONTRIBUTING.md` for what the skill accepts and how to send a change.

- **Tests:** `node --test scripts/lib/`
- **Sound catalog review:** `references/craft.md`, Changing a sound recipe

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
- VoxCPM2 (Apache 2.0), only with `speak --engine voxcpm`: its Python environment through `uv`, and the model unless already on disk

Fonts fetched with `font` keep their own licenses, copied next to each font.
