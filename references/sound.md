# Sound: sources, effects, mix and key

Plan the sonic concept and the energy arc first (`direction.md`, §4). This file says how each sound is cued, placed and mixed.

## Sources

| Source         | When                                      | How                                                                                                                                      |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| User music     | Only a track the user supplied            | Set `music` in `video.json`, then run `beats`. Size scenes in `bars` so cuts land on downbeats.                                          |
| Motion effects | Default                                   | `data-sfx="<sound>"` and a matching `data-sfx-intent` on the animated element.                                                           |
| Voiceover      | The user supplied narration or a TTS file | `"voiceover"` in `video.json` for one file, or per-scene `audio` (scene length = 0.3s lead + audio + 0.5s tail). Timing: `narration.md`. |
| None           | The user asks for silence                 | `"sfx": false` in `video.json`.                                                                                                          |

Never add music the user did not supply.

## Effects

Effects and accepted intent tags:

| Family    | Sound                     | Use for                                                                                                                                                                                                                                                       | `data-sfx-intent`                                                          |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| UI        | `pop`                     | A graphic prop, badge, bubble or avatar appearing                                                                                                                                                                                                             | `appearance`, `bubble`, `badge`, `avatar`                                  |
| UI        | `click`                   | A cursor click on a button                                                                                                                                                                                                                                    | `mouse-click`, `button-press`                                              |
| UI        | `tap`                     | A soft touch on a phone screen                                                                                                                                                                                                                                | `touch`                                                                    |
| UI        | `type`                    | A mechanical key (Cherry MX Brown, fitted to recordings) at about 5.5 keys per second with uneven gaps. Typed text is silent until you add `data-sfx="type"` to the `data-type` element. It sits well under UI hits. `data-sfx-vol` raises it.                | `typing` is inferred from `data-type`                                      |
| UI        | `tick`                    | Counters, checkmarks, small UI toggles                                                                                                                                                                                                                        | `counter`, `checkmark`, `toggle`                                           |
| UI        | `toggle-on`, `toggle-off` | A switch turning on (rising fourth to the tonic) or off (falling)                                                                                                                                                                                             | `toggle-on`, `switch-on`, `enable` / `toggle-off`, `switch-off`, `disable` |
| UI        | `blip`                    | A step marker or small notification                                                                                                                                                                                                                           | `step`, `notification`                                                     |
| UI        | `flick`                   | A list flicked or scrolled: a swish with six detents slowing                                                                                                                                                                                                  | `scroll`, `flick`, `swipe`                                                 |
| UI        | `shutter`                 | A screenshot or capture                                                                                                                                                                                                                                       | `shutter`, `screenshot`, `capture`                                         |
| UI        | `glitch`                  | A digital glitch or corrupted state                                                                                                                                                                                                                           | `glitch`, `corrupt`, `digital-error`                                       |
| UI        | `ticker`                  | A number rolling up. Ticks start fast and slow as the count settles. It spans the move.                                                                                                                                                                       | `count-up`, `number-roll`                                                  |
| Contact   | `snap`                    | Parts clicking together                                                                                                                                                                                                                                       | `connection`, `dock`                                                       |
| Contact   | `thud`                    | A soft landing                                                                                                                                                                                                                                                | `soft-impact`                                                              |
| Contact   | `slam`                    | A stamp or heavy landing                                                                                                                                                                                                                                      | `stamp`, `heavy-impact`                                                    |
| Contact   | `stamp`                   | A rubber stamp pressed and lifted: body, paper crack, sticky lift-off                                                                                                                                                                                         | `stamp`, `approve`, `seal`                                                 |
| Contact   | `paper`                   | A physical sheet flipping, sliding or settling                                                                                                                                                                                                                | `paper`, `sheet`, `page`                                                   |
| Contact   | `coin`                    | A coin landing and bouncing                                                                                                                                                                                                                                   | `coin`, `money`, `payment`                                                 |
| Contact   | `drop`                    | A water drop                                                                                                                                                                                                                                                  | `droplet`, `water`, `liquid`                                               |
| Motion    | `swoosh`                  | A fast card or text slide                                                                                                                                                                                                                                     | `slide`                                                                    |
| Motion    | `whoosh`                  | A camera fly or scene transition                                                                                                                                                                                                                              | `camera`, `transition`                                                     |
| Motion    | `drag`                    | Something dragged across a surface: a scrape that follows the move and pans with it                                                                                                                                                                           | `drag`, `push`                                                             |
| Motion    | `spin`                    | A rotating object: air pulsing and circling between the ears                                                                                                                                                                                                  | `spin`, `rotate`, `twirl`                                                  |
| Motion    | `draw`                    | A pen stroke, signature or underline. It spans the stroke.                                                                                                                                                                                                    | `draw`, `write`, `scribble`, `underline`, `sign`                           |
| Motion    | `zip`                     | A zipper, or a seam closing                                                                                                                                                                                                                                   | `zip`                                                                      |
| Elastic   | `spring`                  | A stylized elastic settle (a boing)                                                                                                                                                                                                                           | `elastic`                                                                  |
| Elastic   | `jelly`                   | A squishy wobble, slower and wetter than spring                                                                                                                                                                                                               | `jelly`, `wobble`, `squish`                                                |
| Elastic   | `pluck`                   | A plucked string: a playful step or a light arrival                                                                                                                                                                                                           | `pluck`, `string`                                                          |
| Tonal     | `shimmer`                 | A highlight or polished reveal                                                                                                                                                                                                                                | `highlight`                                                                |
| Tonal     | `ding`                    | A single bright confirmation                                                                                                                                                                                                                                  | `confirmation`                                                             |
| Tonal     | `success`                 | A two-note positive result                                                                                                                                                                                                                                    | `success`                                                                  |
| Tonal     | `error`                   | A failure state: two short buzzes                                                                                                                                                                                                                             | `error`                                                                    |
| Tonal     | `warning`                 | A soft two-tone alert                                                                                                                                                                                                                                         | `warning`, `caution`, `alert`                                              |
| Tonal     | `downer`                  | An exit or collapse                                                                                                                                                                                                                                           | `exit`, `collapse`                                                         |
| Tonal     | `sting`                   | A four-note bell arpeggio                                                                                                                                                                                                                                     | `sting`, `chime`                                                           |
| Cinematic | `reverse`                 | Anticipation into a cut                                                                                                                                                                                                                                       | `anticipation`                                                             |
| Cinematic | `riser`                   | A rising build that crests on its cue. Cue it on the element it builds to, never on a layer that starts at the cut.                                                                                                                                           | `build`, `reveal`                                                          |
| Cinematic | `drone`                   | Tension under a scene that swells into its cue. `data-sfx-dur` sets its length (0.5-6 s).                                                                                                                                                                     | `tension`, `drone`, `suspense`                                             |
| Cinematic | `hit`                     | A title or chapter hit: a brassy chord ("braam")                                                                                                                                                                                                              | `cinematic-hit`, `title-hit`, `braam`                                      |
| Cinematic | `subdrop`                 | A deep falling drop under a reveal                                                                                                                                                                                                                            | `sub-drop`, `bass-drop`                                                    |
| Cinematic | `boom`                    | A deep trailer impact with a long rumble                                                                                                                                                                                                                      | `deep-impact`, `rumble`                                                    |

## Cueing

- **Binding:** put `data-sfx` on the element whose motion makes the sound. Retiming the animation moves the sound.
- **Intent:** set `data-sfx-intent` to the visible action in the table. `check` rejects missing or mismatched intent.
- **Material intent:** `data-material="paper"` on the cue element or an ancestor supplies the intent `paper`. Its motion then uses `data-sfx="paper"`.
- **Layering:** `check` rejects transient effects whose sound files start within 100 ms. Separate the impacts, or mark a deliberate layer with `data-sfx-layer="allow"`.
- **Measured arrival:** before capture, the renderer steps through the animation frame by frame. It places each sound by kind:
  - **Appearance** (`pop`, `ding`, `shimmer`, `pluck` and the like): on the frame of fastest change (opacity times area, or its move).
  - **Contact** (`stamp`, `slam`, `snap`, `thud`, `drop`, a click): on arrival, the first frame at the final place, size and opacity.
  - **Movement** (`swoosh`, `whoosh`, `drag`): across the move, cresting on its fastest frame.
  - Position uses the element's box on screen, so SVG parts (a map pin, an inlined drawing) measure like HTML. Easing and overshoot count. Risers crest on the arrival.
- **A sound needs a visible change:** a slow fill, fade or drift gets no cue. A sustained sound that spans it (`data-sfx="drone"`) also works. Put the hit on the quick event before or after it.
- **Scripted motion:** a `data-sfx` on a `data-count` counter or `data-draw` path spans `data-at` to `data-at + data-dur`. A `ticker` then follows the count. `data-ease="linear"` counts at a steady rate.
- **Dynamic sounds:** the motion shapes each sound. Never repeat one clip to fake a longer event.

  | Measured                      | Shapes                                                                                                                                                                                                                                |
  | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Move duration and speed curve | `swoosh` and `whoosh` span the move and crest on its measured fastest frame. `draw`, `zip`, `drag`, `ticker` and `spin` start with the move and last as long as it. `data-sfx-dur` sets a `riser`, `reverse` or `drone` build length. |
  | Travel direction              | `swoosh`, `whoosh` and `drag` pan the way the element moves. A move toward the viewer, or one mostly up or down, stays centered.                                                                                                      |
  | Screen position               | Hits sit up to 40% toward the side where the element lands                                                                                                                                                                            |
  | On-screen size                | Pitch of `pop`, `tap`, `blip`, `snap`, `thud`, `slam`, `spring`, `downer`, `pluck`, `drop`, `jelly`: small is higher, large is lower. Scale sounds snap to the key. Tonic sounds keep their note.                                     |
  | Speed and distance            | Brightness and level of `swoosh` and `whoosh`. Level of `slam` and `thud`.                                                                                                                                                            |
  | Child landings                | A cued container renders one sound with one accent per animated child                                                                                                                                                                 |

- **Containers:** cue a group of like items on the group, never on single children. A paper stack, a row of chips and coins are such groups. Its animated children become accents of one composite sound. `paper` adds a rustle under the whole span.
  - **No own motion:** a group with its own animation sounds once, at its own arrival, and `check` warns. Wrap the children in a still element and cue that.
  - **Dense groups:** `data-sfx-accents="6"` keeps 6 evenly spaced landings, for a sparse, low-energy beat.
- **Across cuts:** a lead-in that starts before its scene (`riser`, `reverse`, `whoosh`) begins in the previous scene. Before video time 0 it is trimmed, so it still lands on time. Cues at or after a scene's end are dropped. Tails ring past the cut.
- **Restraint:** cue only events the eye follows, at most about one effect per beat. Cue staggered siblings through their container.
- **Repeats** vary on their own, since exact repetition reads as a notification. Keep an exact repeat only for a motif (`data-sfx-motif`).
- **Check:** `audit` checks every placed cue against the rendered pixels (`craft.md`, Sound audit).

## Under a voice or music

The mix ducks music and effects under a voice.

- **Under narration:** the voice leads. Use an effect only for a reason the voice does not give: a transition, the payoff. Often a scene needs none.
- **Cap:** at most 2 effects in a narrated scene, each in a pause.
- **`check`:** it warns when a cue's sound, lead-in included, overlaps a word, by timing only. It tests each cue, typing and each container accent included, over the same window `audit` measures. It names the next pause. It also warns on more than 2 in a scene.
- **`audit`:** only it measures whether the voice masks a cue by level. It judges effects on their own stem (`out/voice/effects.wav`). It warns when the voice masks one by more than 12 dB.
- **Under music:** few effects, on moments the music does not mark. Use only clicks, slams and whooshes, at `data-sfx-vol` 0.5 or below.

## Level and overrides

- **Volume:** `data-sfx-vol` (0–4, linear).
- **Level math:** these multiply:
  1. The recipe's natural level (`SOUND_META.level`, in dB against the boom). Each source is loudness-normalized to it, peaking at most −6 dBFS.
  2. `data-sfx-vol`.
  3. The energy gain at the cue's moment (0.4 + 1.1 × energy). Energy also darkens low and brightens high.
  4. The motion gain for swooshes and impacts.
  5. The room send, added on top.

  The mix then gets one linear gain, so +6 dB on one cue is +6 dB in the video.

- **Overrides:**

  | Attribute                            | Does                                                                                                                             |
  | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
  | `data-sfx-on="start\|end\|0.4"`      | Picks a point in the element's own animation                                                                                     |
  | `data-sfx-offset="-0.05"`            | Shifts the cue by signed seconds                                                                                                 |
  | `data-sfx-once`                      | One sound for a group that moves itself and has animated children, on purpose                                                    |
  | `data-sfx-anchor="start\|peak\|end"` | Chooses which point of the sound lands on the cue                                                                                |
  | `data-sfx-variant="0-3"`             | Pins one variant. Otherwise repeats rotate through 4 variants in video order, varying attack, tone color, then pitch slightly.   |
  | `data-sfx-motif`                     | Repeats one sound exactly: same variant, first occurrence's pitch, whatever the size. On a container it keeps its accent rhythm. |
  | `data-sfx-pitch="0.8-1.25"`          | Sets the pitch outright, instead of from the element's size                                                                      |
  | `data-sfx-layer="allow"`             | Allows a deliberate transient overlap                                                                                            |
  | `data-sfx-accents="6"`               | Caps a container's accents to evenly spaced landings                                                                             |
  | `data-sfx-dur="1.2"`                 | Sets a sound's length in seconds. Use it for an event with no measurable motion, or a build before a reveal.                     |
  | `data-sfx-at`                        | Sets the cue in seconds. Use it only for an event with no element of its own.                                                    |
  | `data-material="wood"`               | Strikes a contact sound in that material. See Materials below.                                                                   |
  | `data-sfx-src="file.wav"`            | Plays a supplied file in place of the recipe. See User sounds below.                                                             |

  `check` warns when a `data-sfx-at` misses its element's impact by more than 80 ms. It reports an invalid attribute value as an error.

- **Natural edges:**
  - **Room send** per sound, set in `SOUND_META.space`. Clicks, ticks, typing and taps stay dry. Paper, pops and impacts get a short tail. Whooshes, risers, chimes and the boom get more. The tail rings in the `sound.space` room.
  - **Feathered onsets:** noisy textures ease in over a few milliseconds.
  - **Whole mix** fades per `sound.fadeIn` and `sound.fadeOut`.

## Materials

A struck material recolors the contact sounds `tap`, `tick`, `snap`, `thud` and `slam`, by modal synthesis.

- **Materials:** `wood`, `glass`, `metal`, `plastic`, `stone`, `rubber`, `ceramic`. Glass and metal ring out. Wood, plastic and stone stop short. Rubber is dull.
- **Per element:** `data-material="wood"` on the cue element or an ancestor.
- **Whole video:** `"sound.palette": "wood"` in `video.json`, for every contact cue without its own material. The default `synth` keeps the designed sounds.
- **Other sounds** are unchanged. A struck material sets no intent: name it with `data-sfx-intent`.
- **Paper** is also a sound: `data-material="paper"` sets the intent `paper` and needs `data-sfx="paper"`.

## Key

Tonal sounds share one key, so they never clash with each other or the music.

- **Tonic sounds** move to the nearest tonic: `ding`, `success`, `shimmer`, `error`, `warning`, `sting`, `toggle-on`, `toggle-off`, `hit`, `drone`. Chords take a minor third in a minor key.
- **Scale sounds** follow size, then snap to the key's pentatonic scale: `pop`, `tap`, `blip`, `spring`, `downer`, `pluck`, `drop`, `jelly`.
- **Setting it:** `"sound.key": "auto"` (default) takes the key of `music`, or C major without music. `"D minor"` sets it outright.
- **Relative keys:** a relative major and minor (C major, A minor) share one pentatonic scale. Either detection sounds in key.

## User sounds

`data-sfx-src="../assets/hero.wav"` plays a supplied file in place of the synthesized sound, for a one-off hero sound.

- **Path:** relative to the scene's folder. `check` reports a missing file.
- **Role:** the file keeps the named sound's intent, level, room send and sync class. `data-sfx="boom" data-sfx-src="..."` still counts as the payoff.
- **Loudness:** it matches that sound's level.
- **Peak:** with `data-sfx-anchor="peak"`, its loudest moment lands on the cue.

## Narration and captions

Voiceover, text to speech, word timing, caption tracks and sync checks: `narration.md`.
