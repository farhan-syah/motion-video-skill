# CLI and manifest

`<skill-dir>` is the folder that holds `SKILL.md`. Run: `node <skill-dir>/scripts/video.mjs <command>` from the project directory. Run `init <dir>` from the directory that will hold the project. `--help` prints every flag.

## Setup

- **Dependencies:** run `cd <skill-dir>/scripts && bun install` once. npm works as a fallback.
- **Runtime:** Node 20+. Playwright stalls under Bun 1.3, so `bun video.mjs` re-runs itself under `node`.
- **Browser:** `$MOTION_VIDEO_CHROME`, else the first of `chromium`, `chromium-browser`, `google-chrome-stable` or `google-chrome` on PATH, else Chrome or Chromium in its default macOS or Windows location. With none, it falls back to Playwright's build (`bunx playwright install chromium-headless-shell`).
- **Also required:** `ffmpeg` and `ffprobe` on PATH.
- **Checks:** `check`, `sounds` and `audit` use Node and ffmpeg. Python is not required.
- **Sound effects:** synthesized on first use into `~/.cache/motion-video/sfx/` (under the home folder on every platform) (`$XDG_CACHE_HOME` when set), as `<sound>-v<variant>-<hash>.wav`. The cache is disposable: a deleted file rebuilds on the next render.
- **GPU:** Chromium draws on the GPU through ANGLE (EGL on Linux, Metal on macOS, Direct3D on Windows) when WebGL reports a hardware renderer. Otherwise it falls back to software. `MOTION_VIDEO_GPU=0` forces software.
- **Encoder:** `h264_nvenc` when ffmpeg can open it, otherwise `libx264`. A failed NVENC session retries the render once on `libx264`. `MOTION_VIDEO_NVENC=0` forces `libx264`.

## Commands

| Command | Does | Exit |
|---|---|---|
| `init <dir>` | Creates the project from templates | 0, or 2 if the directory is not empty |
| `font "FAMILY" [--subset S,…]` | Fetches a Fontsource family into `fonts/`, variable when it exists, and writes `fonts/<family>.css` | 0, or 2 on an unknown family |
| `lib NAME…` | Copies a browser library into `lib/` and prints how to load it. `gsap`, `three`, `lottie`. | 0, or 2 on an unknown name |
| `footage FILE [--name N] [--from S] [--to S] [--fps F] [--width W]` | Extracts a clip into `assets/N/` as JPEG frames and prints the `<img data-frames>` tag | 0, or 2 if ffmpeg cannot read the file |
| `beats [FILE] [--start S]` | Writes `out/beats.json`: bpm, beats, downbeats, bar energy, hits and the track's key, in video time. Prints a `music.start` on a downbeat. | 0 |
| `check [--scene S]` | Lints scenes in parallel. Prints ERROR/WARN lines, each with a fix. With `--scene`, also writes that scene's still sheet to `out/stills/`. | 1 on any error |
| `still [--scene S] [T…]` | Writes PNGs at T seconds, or one 8-frame sheet per scene with no T | 0 |
| `render [--scene S] [--draft] [--scale N] [--jobs N] [--force]` | Runs `check` unless a clean check already covers the same files, then renders. A full render ends with `audit` and `out/sheet.png`. Captured frames are cached by what they show: after a sound-only edit (`data-sfx*`, `sound`, `energy`, `in`), no frame is captured again. Stops on check errors unless `--force`. | 1 on check errors or a failing cue |
| `sheet` | Writes `out/sheet.png`: 16 frames from the rendered video | 0 |
| `probe SELECTOR [T] [--scene S]` | Prints the on-screen center and box of matching elements at T seconds | 0 |
| `audit` | Checks timing, cue intent, impact overlaps, sound shape and presence in the final mix. Writes `out/audit.png`. | 1 on any failing cue |
| `sounds` | For editing the sound recipes, not part of making a video. Prints numeric profiles and checks every sound against its catalog metadata: each at both ends of the pitch range, and each contact sound in every material. | 1 on a sound shape error |

- **`--scene S`:** a 1-based index or a file basename. It works while other scene files are still unwritten.
- **`render --scene S`:** writes `out/<scene>.mp4`, with that scene's effects and voiceover but no music.
- **`render --draft`:** half size, fast. Use it for review.
- **`render --scale 2`:** renders 1920x1080 as 3840x2160.

## video.json

Dotted names are nested objects: `sound.palette` is `"sound": { "palette": "wood" }`.

```json
{ "width": 1920, "height": 1080, "fps": 30, "output": "out/video.mp4",
  "sound": { "palette": "wood", "key": "D major", "space": "room" },
  "scenes": [ { "file": "scenes/01-hook.html", "duration": 3, "energy": [[0, 0.4], [1.2, 1]], "in": "whoosh" } ] }
```

| Field | Type | Default | Rule |
|---|---|---|---|
| `width`, `height` | even integer | 1920, 1080 | Landscape 1920x1080, portrait 1080x1920, square 1080x1080 |
| `fps` | integer 12–120 | 30 | Use 60 for fast UI motion |
| `output` | path | `out/video.mp4` | |
| `sfx` | boolean | true | Plays `data-sfx` cues. False turns off effects only. Music and voiceover still play. A silent video has `sfx: false`, no `music` and no scene `audio`. |
| `music.file` | path | — | Only a track the user supplied |
| `music.volume` | 0–1 | 0.25 | Before ducking and loudness normalization |
| `music.start` | seconds | 0 | Use the downbeat `beats` prints, so video time 0 is a bar start |
| `scenes[].file` | path | — | Basename must be unique |
| `scenes[].bars` | number | — | Length in bars from `out/beats.json`. Run `beats` first. |
| `scenes[].duration` | seconds | — | Used when there is no music. Set one of `bars`, `duration` or `audio`. |
| `scenes[].audio` | path | — | Voiceover. Length derives from it when `bars` and `duration` are absent. |
| `scenes[].energy` | 0–1, or `[[seconds, energy], …]` | 0.6 | Planned intensity. One number holds for the scene. A curve of points in scene seconds shapes it inside: tease, hit, drop, hit. Sets level (−4 dB at 0.3, +3.5 dB at 1.0) and tone (darker when low, brighter when high). Ramped across cuts. |
| `scenes[].in` | `whoosh` \| `swoosh` \| `reverse` \| `riser` | — | Transition sound pre-lapped across this scene's cut. Not on the first scene. |
| `scenes[].inVol`, `scenes[].inDur` | number | 0.8, recipe | Transition level (0–4) and length in seconds (0.2–4) |
| `sound.space` | `tight` \| `room` \| `hall` | `room` | The room effects sit in. Each sound sends its own share. |
| `sound.fadeIn`, `sound.fadeOut` | seconds | 0.3, 0.8 | The mix breathes in and resolves out instead of starting or stopping on a hard edge |
| `sound.palette` | `synth` \| `wood` \| `glass` \| `metal` \| `plastic` \| `stone` \| `rubber` \| `ceramic` | `synth` | The material every contact sound (`tap`, `tick`, `snap`, `thud`, `slam`) is struck in, unless a cue sets its own `data-material`. `synth` keeps the designed sounds. |
| `sound.key` | `auto` or a key name (`C`, `F# minor`, `Ebm`) | `auto` | The key tonal effects are tuned to. `auto` takes the key of `music`, or C major without music. `render` prints the key it used. |
| `sound.bed` | `true`, `false`, or object | none | The bed under the effects. `true` takes every default. It is off when absent. |
| `sound.bed.fragments` | 1–8 | 2 | Echoes per 10 s of the video's own sounds: the `data-sfx-motif` sound, else material sounds, else the most used one. Pitched down, darkened, far in a hall. They avoid hits, the second before a reveal, and voice. Fewer play where energy is low. |
| `sound.bed.level` | dB, −48 to −12 | −32 | Fragment level against an effect at volume 1. The default sits near the noise floor: felt in the gaps, not heard as a layer. |
| `sound.bed.seed` | whole number | 1 | Picks one of the seeded variations. The same seed always renders the same bed. |

Scene boundaries round the running total to whole frames, so the video length matches the sum of scene lengths.

## Output

- **Video:** H.264 High, yuv420p, BT.709 tagged, faststart. NVENC p7 CQ 16, or libx264 slow CRF 16 with `-tune animation`.
- **Audio:** AAC 192k at 48 kHz.
- **Loudness:** −14 LUFS with voice or music, −18 LUFS for effects only, within about 0.5 LU.
  - **One linear gain:** it reaches the target, re-measured after a peak limiter at 0.5 dB under the ceiling. The ceiling is −1.5 dBTP for voice or music, −6 dBTP for effects alone: sharp clicks near full scale are painful.
  - **Measured after encoding:** AAC rebuilds peaks between samples and trims top end, so loudness and true peak are measured on the encoded file. The limiter runs 4x oversampled. An overshoot lowers gain and limit together.
  - **Ducking:** music ducks hard under voiceover, effects more gently. The bed ducks under every hit and word.
  - **Peaky loudest moment:** the loudest moment's peak sets the file's gain. When that moment is a sharp hit (a braam, a slam), the file ships quieter than when it is a sustained or tonal sound. A small volume change that makes a sharp hit the loudest moment can drop the file by several LU.
  - **Payoff first:** the gain rises toward the target only while the loudest moment keeps its 400 ms lead over the rest, within 1.5 dB (`MOTION_VIDEO_LEAD_LOSS` overrides it). A sparse mix that cannot reach the target within that ships quieter, and `render` prints by how much.
  - **Bed after gain:** the bed joins after the loudness gain, so it never lowers the foreground.
- **Bed comparison:** with a bed, `render` also writes `<output>.no-bed.mp4` at the same gain and limit. Only the bed differs. The bed has no noise layer.
  - **No compression:** relative levels stay exactly as mixed.
