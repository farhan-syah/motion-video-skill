---
name: motion-video
description: Turn a short brief, plus optional screenshots, design references, logo, music, footage or voiceover, into a directed motion-graphics MP4. Works from the user's material and researches only the gaps, directs a concept, builds HTML/CSS/SVG scenes and renders them frame-exact with headless Chromium and ffmpeg, with synthesized motion sound effects. Use for product teasers and launches, feature explainers, app demos, tutorials and lessons, data stories, event and announcement videos, social reels and ads, kinetic typography, isometric or keynote-style videos, and music-synced edits. Not for static images, slide decks, AI-generated live-action footage, or standalone audio work.
---

# Motion Video

Direct first, then build. Never turn a plain brief straight into code.

Tool: `node <skill-dir>/scripts/video.mjs <command>`, run from the project directory. `<skill-dir>` holds this SKILL.md. Setup and every flag: `references/cli.md`.

## Workflow

1. **Sweep.** Run `doctor` in the user's folder. If it says an update check is due, tell the user once. Update only with their consent (README, Versions and updates). Plan with what exists: a software-only machine keeps 3D and blur light. An English-only voice never narrates another language.
2. **Gather facts** from the user's material first. Research only the gaps. Write the facts with sources before anything else (`references/direction.md`, §0). Every claim on screen comes from them.
3. **Ask, when it matters.** If answers change the video, ask in one message. At most five questions, each with your default. Topics: purpose and audience, format and length, voice (recording, TTS, language, none), must-appear items (logo, assets, call to action), tone. Skip asking when the brief answers them or the user wants a one-shot. Also skip when no user is present (scheduled or delegated run). Name the defaults used in the summary.
4. **Direct.** Run `init <dir>` in the user's working directory, never inside `<skill-dir>`. Fill `<dir>/direction.md` per `references/direction.md` and `references/styles.md`. Write three concepts with different story shapes and compositions (`references/concepts.md`), then pick the strongest. Design the world too: place, objects, graphic system. Give the user a 5-line summary, then continue without waiting.
5. **Sound.** Voice, music and effects combine as the video needs. The mix ducks music and effects under a voice.
   - **Voice:** use the user's narration as given. Every case, `speak`, `transcribe`, `data-captions` and `data-say`: `references/narration.md`.
   - **Music:** only the user's own track. Never add music the user did not supply. Run `beats` and size scenes in `bars`.
   - **Motion effects:** on by default. Each cue gets a visible-action `data-sfx-intent` (`references/building.md`, Sound). Under narration: at most 2 per scene, in pauses, only for a reason the voice does not give. Often none. Under music: few, on moments the music does not mark.
   - **Silence:** on request, `"sfx": false` and no voice or music.

   Write the sonic concept and the energy arc before cueing single sounds (`references/direction.md`, §4).

6. **Build** the scenes per `references/building.md`. Rebuild reference designs as live HTML. Never animate a flat screenshot of a design you can rebuild.
7. **Check each scene.** After writing or editing a scene, run `check --scene N`. Open its still sheet with Read and fix what fails `references/craft.md`. Fix every finding of a pass in one edit before running again. A warning stays only for a deliberate choice.
8. **Render.** Run `render --draft` once every scene passes, and again after each fix. Run the full `render` once the draft passes review. With a `sound.bed`, compare the no-bed copy, or tell the user to.
9. **Review.** Open `out/sheet.png` and, with effects, `out/audit.png`. Compare each cue's intent with its thumbnail. Fix each failing cue and false intent label, then render again. Listen to the mix when playback is available, and report when it was not.
10. **Deliver.** Report the master and the `-compressed.mp4` copy.

## Non-negotiables

- One visual language per video: shared type, icon family, light and camera language. Places can change by chapter inside one palette family.
- A concept, not a template: story shape, compositions and copy system come from this product. Vary the composition from beat to beat.
- The skill supplies tools, not the idea. Reference tables show range, never a menu. The kit is a floor: build beyond it when the concept needs more (`references/building.md`, Beyond CSS).
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
| Voiceover, text to speech, word timing, captions                                                                               | `references/narration.md`        |
| Finding an icon name                                                                                                           | `references/icons.txt` (grep it) |
| Thresholds, and the visual review of sheets                                                                                    | `references/craft.md`            |
| Commands, flags, `video.json` fields, setup errors                                                                             | `references/cli.md`              |

## Boundaries

- **Static designs** (posters, social graphics, print) need a design tool. **Slide decks** need a slides tool.
- **Charts inside a video:** one message per chart, the right chart form for the data, color that encodes meaning.
- **Live-action footage:** composed from supplied footage (`footage`), never generated.
