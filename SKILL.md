---
name: motion-video
description: Turn a short brief, plus optional screenshots, design references, logo, music, footage or voiceover, into a directed motion-graphics MP4. Works from the user's material and researches only the gaps, directs a concept, builds HTML/CSS/SVG scenes and renders them frame-exact with headless Chromium and ffmpeg, with synthesized motion sound effects. Use for product teasers and launches, feature explainers, app demos, tutorials and lessons, data stories, event and announcement videos, social reels and ads, kinetic typography, isometric or keynote-style videos, and music-synced edits. Not for static images, slide decks, AI-generated live-action footage, or standalone audio work.
---

# Motion Video

Direct first, then build. Never turn a plain brief straight into code.

Tool: `node <skill-dir>/scripts/video.mjs <command>`, run from the project directory. `<skill-dir>` is the absolute path of the directory this SKILL.md loaded from (for a user install, `~/.claude/skills/motion-video`). Never the project directory. Setup and every flag: `references/cli.md`.

## Workflow

1. **Sweep.** Run `doctor` in the user's folder. Fix each MISSING line under READY, or tell the user. Plan around each LIMIT line. If it says an update check is due, tell the user once. Update only with their consent (README, Versions and updates). Plan with what exists: a software-only machine keeps 3D and blur light. An English-only voice never narrates another language.
2. **Gather facts** from the user's material first. Research only the gaps. Write the facts with sources before anything else (`references/direction.md`, §0). Every claim on screen comes from them.
3. **Ask, when it matters.** Ask once, in one message, per `references/direction.md`, Ask the user. Skip it for a one-shot or a run with no user.
4. **Direct.** Run `init <dir>` in the user's working directory, never inside `<skill-dir>`. Replace its placeholder scene (`references/building.md`, Project layout). Fill `<dir>/direction.md` per `references/direction.md` and `references/styles.md`. Write three concepts, then pick the strongest (`references/concepts.md`). Pick ratio, size and fps for the platform now (`references/delivery.md`). Give the user a 5-line summary, then continue without waiting.
5. **Sound.** Voice, music and effects combine as the video needs. Write the sonic concept and energy arc first (`references/direction.md`, §4).
   - **Voice:** use the user's narration as given. For text to speech, follow `references/narration.md`, Prepare the script for speech.
   - **Captions:** never add captions or a subtitle file without the user's yes (`references/narration.md`, Captions).
   - **Music:** only the user's own track. Run `beats` and size scenes in `bars`.
   - **Motion effects:** on by default. Cue them per `references/sound.md`, with its caps under a voice or music.
   - **Silence:** on request, `"sfx": false` and no voice or music.
6. **Build** the scenes per `references/building.md`. Rebuild reference designs as live HTML. Never animate a flat screenshot of a design you can rebuild.
7. **Check each scene.** After writing or editing a scene, run `check --scene N`. Open its still sheet with Read and fix what fails `references/craft.md`. Fix every finding of a pass in one edit before running again. A warning stays only for a deliberate choice.
8. **Render.** Run `render --draft` once every scene passes, and again after each fix. Run the full `render` once the draft passes review. With a `sound.bed`, compare the no-bed copy, or tell the user to.
9. **Review.** `render` already ran `audit` and wrote `out/sheet.png` and, with effects, `out/audit.png`. Read its output and open both. Never run `audit` alone after a render. A sound-only fix needs `render` again: `audit` reads the `out/cues.json` that `render` writes. Compare each cue's intent with its thumbnail. Fix each failing cue and false intent label, then render again. Listen to the mix when playback is available, and report when it was not.
10. **Deliver.** Check `out/thumbnail.png` per `references/craft.md`, Final pass. Report the master, the `-compressed.mp4` copy and the thumbnail. Make the upload copies and the listing text per `references/delivery.md`.

## Non-negotiables

- One visual language per video: shared type, icon family, light and camera language. Places can change by chapter inside one palette family.
- A concept, not a template: story shape, compositions and copy system come from this product. Vary the composition from beat to beat.
- The skill supplies tools, not the idea. Reference tables show range, never a menu. The kit is a floor. Build beyond it when the concept needs more (`references/building.md`, Beyond CSS).
- No dead frame: the content carries the motion. The camera moves only with a reason, never a push-in on every scene.
- Screen text holds still while the camera moves the world under it. World text moves with the world.
- Every feature is shown by a verb moment, never a bullet list.
- On-screen text passes `check` for size, contrast and hold time.

## Routing

| When                                                                                                                           | Read                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Expanding the brief into `direction.md`                                                                                        | `references/direction.md`        |
| Choosing the concept: story shapes, beats, compositions, craft devices, design vocabulary                                      | `references/concepts.md`         |
| Choosing or executing a visual style                                                                                           | `references/styles.md`           |
| Writing scenes, the kit (icons, atmospheres, UI parts, leader lines), 3D, footage and libraries, the seek contract, the camera | `references/building.md`         |
| Sound effects, cues, intents, the mix under a voice or music, materials, key, user sounds                                      | `references/sound.md`            |
| Voiceover, text to speech, word timing, captions                                                                               | `references/narration.md`        |
| Choosing a TTS engine for a language or machine, adding a voice or model                                                       | `references/tts.md`              |
| Using one TTS engine: its voice, delivery and writing rules                                                                    | `references/tts/<engine>.md`     |
| Finding an icon name                                                                                                           | `references/icons.txt` (grep it) |
| Output for a platform (ratio, size, fps, codec, upload copies), listing text and covers, screen recording                      | `references/delivery.md`         |
| Thresholds, and the visual review of sheets                                                                                    | `references/craft.md`            |
| Commands, flags, `video.json` fields, setup errors                                                                             | `references/cli.md`              |

## Boundaries

- **Static designs** (posters, social graphics, print) need a design tool. **Slide decks** need a slides tool.
- **Charts inside a video:** one message per chart, the right chart form for the data, color that encodes meaning.
- **Live-action footage:** composed from supplied footage (`footage`), never generated.
