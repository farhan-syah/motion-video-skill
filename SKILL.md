---
name: motion-video
description: Turn a short brief, plus optional screenshots, design references, logo, music, footage or voiceover, into a directed motion-graphics MP4. Works from the user's material and researches only the gaps, directs a concept, builds HTML/CSS/SVG scenes and renders them frame-exact with headless Chromium and ffmpeg, with synthesized motion sound effects. Use for product teasers and launches, feature explainers, app demos, tutorials and lessons, data stories, event and announcement videos, social reels and ads, kinetic typography, isometric or keynote-style videos, and music-synced edits. Not for static images, slide decks, AI-generated live-action footage, or standalone audio work.
---

# Motion Video

Direct first, then build. Never turn a plain brief straight into code: the direction step makes the video.

`<skill-dir>` is the folder that holds this SKILL.md.

Tool: `node <skill-dir>/scripts/video.mjs <command>`, run from the project directory. `init <dir>` is the exception: run it from the directory that will hold the project. Setup and every flag: `references/cli.md`.

## Workflow

1. **Sweep.** Run `doctor` in the user's folder. It reports the CPU, GPU drawing and encoding, the speech engines and models, and the media and documents already there. Plan with what exists: a software-only machine keeps 3D and blur light, an English-only voice never narrates another language.
2. **Gather facts.** Start from what the user supplied: the brief, screenshots, designs, files. When that leaves gaps, research the product itself (its repo, docs, site, app). Write the facts with their sources before anything else (`references/direction.md`, §0). Every claim on screen comes from those facts.
3. **Ask, when it matters.** When an answer would change the video, ask the user in one short message: at most five questions, each with the default you will use. Ask about what the facts and the sweep cannot settle: the purpose and audience, where it plays (format, length), the voice (their recording, TTS, which language, or none), what must appear (logo, assets, a call to action), and the tone. Skip it when the brief already answers these, when the user asks for a one-shot or no questions, or when no user is there to answer (a scheduled or delegated run). Then use the defaults and name them in the summary.
4. **Direct.** Run `init <dir>` in the user's working directory, never inside `<skill-dir>`. Then fill `<dir>/direction.md` per `references/direction.md` and `references/styles.md`. Choose the concept first: three options with different story shapes and compositions (`references/concepts.md`), then the strongest. Design the world too: the place, the objects and the graphic system, not only the motion. Give the user a 5-line summary, then continue without waiting.
5. **Sound.** Three layers, used in any combination the video needs. The mix ducks music and effects under a voice.
   - **Voice:** whatever narration the user brings, used as given: a recording, a script (plain or with times), subtitles, their own voice or TTS. Make it with `speak` only from their script, or from one the skill writes when they ask for narration. Set `voiceover` (with its `script`), run `transcribe`, and time beats and cues to the printed word times. Show speech as text with a `data-captions` track, and mark other lines that repeat it with `data-say`, so `check` holds them to the speech. Every case: `references/narration.md`.
   - **Music:** only the user's own track. Run `beats`, set `--beat` in `base.css`, and size scenes in `bars`.
   - **Motion effects:** on by default. Give each cue a visible-action `data-sfx-intent` from `references/building.md`. `data-material="paper"` can supply the intent. Set `sound.palette` and `sound.key` from the sonic concept. Under narration, the voice leads: an effect needs a clear reason the voice does not give (a transition, the payoff), sits in a pause, never on a word, and a scene has 2 at most. Often the right number is none. Under music, keep them few, on the moments the music does not already mark.
   - **Silence:** when the user asks for it, `"sfx": false` and no voice or music.

   Never add music the user did not supply. Direct the soundtrack's shape before cueing single sounds. Write the sonic concept first: material, motif, mood shift. Give each scene an `energy` in `video.json`, as one value or as a curve that teases, hits, drops and hits again. Plan transition sounds per cut. See `references/direction.md`.
6. **Build.** Write the scenes per `references/building.md`. Rebuild reference designs as live HTML components. Never animate a flat screenshot of a design you can rebuild.
7. **Check and look, per scene.** After writing or editing a scene, run `check --scene N`. It lints the scene and writes its still sheet in a few seconds. Open the sheet with Read, and fix what fails `references/craft.md`. Fix every finding of a pass in one edit before running again. A warning stays only for a deliberate choice.
8. **Render.** Run `render --draft` once every scene passes, and again after each fix: it captures at half size in JPEG, about a third faster. Run the full `render` once, when the draft passes review. It checks only files that changed since the last clean `check`, renders, runs the sound audit, and writes `out/sheet.png`. With a `sound.bed`, it also writes a copy without the bed. Compare the two, or tell the user to.
9. **Review.** Open `out/sheet.png` and, with effects, `out/audit.png`. Compare each cue's intent with its thumbnail. Fix each failing cue and false intent label, then render again. Listen to the mix when audio playback is available. Numeric checks cannot judge every timbre. Report when listening was unavailable.
10. **Deliver.** Report both output paths: the master and the `-share.mp4` copy for sending.

## Non-negotiables

- One visual language per video: shared type, icon family, light and camera language. The places can change by chapter, from a sky to a studio, inside one palette family.
- A concept, not a template: the story shape, compositions and copy system come from this product. Vary the composition from beat to beat.
- The skill supplies tools, not the idea. Tables in the references show range, never a menu. The kit is a floor: when the concept needs more, build it with HTML, CSS, SVG, canvas, WebGL, GSAP, Lottie or footage (`references/building.md`, Beyond CSS).
- No dead frame: the content carries the motion. The camera moves only with a reason: a held static image, a move across a world, a push into a screen. Never a push-in on every scene.
- Screen text (headline, chapter label, caption) holds still. The camera moves the world under it, from a slow drift to a push into a screen. World text moves with the world.
- Every feature is shown by a verb moment, never a bullet list.
- On-screen text stays readable: size, contrast and hold time pass `check`.

## Routing

| When | Read |
|---|---|
| Expanding the brief into `direction.md` | `references/direction.md` |
| Choosing the concept: story shapes, beats, compositions, craft devices, design vocabulary | `references/concepts.md` |
| Choosing or executing a visual style | `references/styles.md` |
| Writing scenes, the kit (icons, atmospheres, UI parts, leader lines), 3D, footage and libraries, the seek contract, the camera | `references/building.md` |
| Voiceover, text to speech, word timing, captions | `references/narration.md` |
| Finding an icon name | `references/icons.txt` (grep it) |
| Thresholds, and the visual review of sheets | `references/craft.md` |
| Commands, flags, `video.json` fields, setup errors | `references/cli.md` |

## Boundaries

- **Static designs:** posters, social graphics and print need a design tool, not a video.
- **Presentations:** slide decks need a slides tool.
- **Charts inside a video:** one message per chart, the right chart form for the data, and color that encodes meaning.
- **Live-action footage:** this skill composes supplied footage (`footage`), and never generates it.
