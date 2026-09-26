# Building scenes

## Project layout

`init <dir>` creates:

| Path             | Role                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `direction.md`   | The shot list. Fill it first.                                                                                                                                               |
| `video.json`     | Manifest: size, fps, scenes, music. Fields: `cli.md`.                                                                                                                       |
| `base.css`       | Tokens, type scale, motion system, grain, safe area. Edit the `:root` tokens per video.                                                                                     |
| `world.css`      | 3D camera, cuboids, ground disc, laptop, coin stack, ring pad, shadows, pops. Link it only in 3D scenes.                                                                    |
| `ui.css`         | Product-UI parts. See Kit below.                                                                                                                                            |
| `atmosphere.css` | Skies, clouds, cloud-pass cuts, horizon, studio sweep, pedestal, stars, glow, rays, dot grid, glass, depth of field. Link it when a scene has a place, not a flat backdrop. |
| `icons.js`       | 1854 Lucide line icons (ISC, `icons.LICENSE.txt`). Names and search tags: `references/icons.txt` in the skill.                                                              |
| `motion.js`      | Seek runtime: icons, counters, typing, leader lines, stroke drawing, custom hooks.                                                                                          |
| `fonts/`         | Inter and JetBrains Mono as placeholders. `font "Family"` fetches any Fontsource family here. Brand `.woff2` files go here too.                                             |
| `scenes/*.html`  | One file per scene. Each links `../base.css`, `../icons.js` and `../motion.js`.                                                                                             |
| `lib/`           | Optional libraries copied by `lib` (GSAP, three.js, Lottie).                                                                                                                |
| `assets/`        | Supplied images, footage frames from `footage`, 3D models, Lottie files.                                                                                                    |

Split scene files at hard cuts. Keep a continuous camera move across several features in one file: the renderer splits long scenes into parallel chunks.

## Seek contract

Each frame, the renderer sets every CSS animation to the frame time, then calls `window.__video.seek(ms)`. Anything outside this contract breaks the render.

- **Allowed:** CSS `@keyframes` with `animation-delay`, Web Animations API, `data-count`, `data-type`, `data-split`, `data-frames`, `__video.use(timeline)`, and `__video.on((ms) => …)` hooks that draw from `ms` alone.
- **Forbidden:** CSS transitions, `setTimeout`/`setInterval`, `requestAnimationFrame` loops, `Date`/`performance.now` in drawing code, `<video>` (use `footage`), animated GIFs, class changes after load.
- **`Math.random`:** seeded and stable across renders.
- **Fonts:** only `@font-face` from local files. A system font fails `check`.
- **Images:** local files, decoded before frame 0.
- **Scene duration:** `var(--scene-dur)`, injected by the renderer.

## Beyond CSS

Anything a browser can draw can go in a scene if it draws from the video time. Use these when the idea needs them.

| Need                                             | Tool                   | How                                                                                                                                  |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Word-by-word or letter-by-letter type            | `data-split`           | `<h1 data-split="words" data-in="rise" data-t="0.2" data-stagger="0.06">`. `chars` for letters, `data-mask` for a line-mask reveal.  |
| Shape morphs, path motion, complex choreography  | GSAP (`lib gsap`)      | Build one `gsap.timeline({ paused: true })`, then `__video.use(tl)`. MorphSVG, MotionPath, SplitText and DrawSVG are in `lib/gsap/`. |
| Real 3D: models, materials, lights, particles    | three.js (`lib three`) | A module script. Draw inside `__video.on((ms) => { …; renderer.render(scene, camera); })`. Use `preserveDrawingBuffer: true`.        |
| After Effects animations, animated illustrations | Lottie (`lib lottie`)  | `__video.use(lottie.loadAnimation({ …, autoplay: false, path: '../assets/x.json' }), at)`                                            |
| Real footage, screen recordings                  | `footage`              | `footage clip.mp4 --from 2 --to 6` writes frames and prints `<img data-frames …>`. Style the `<img>` like any image.                 |
| Generative art, charts, particles in 2D          | `<canvas>`             | Draw in `__video.on((ms) => …)` from `ms` alone. `Math.random` is seeded.                                                            |
| Custom filters: displacement, glow, grain        | SVG filters            | `<filter>` with `feTurbulence`, `feDisplacementMap`. Animate its attributes in a hook.                                               |

- **Async setup:** wrap loading (a model, a texture, a JSON file) in `__video.wait(promise)`, before the first `await` in a module script. The renderer waits for it before frame 0.
- **Timing offset:** `__video.use(tl, 1.5)` starts the timeline 1.5 s into the scene.
- **Hooks return nothing,** or a promise that resolves once the frame is drawn. Never return a GSAP timeline: it is thenable, and the render stalls. `seek` stops with an error after 10 s.
- **Local files only:** scenes load over `file://`, so `fetch`, module imports and model loaders read project files. Nothing loads from the network.
- **Reading text stays in HTML:** `check` cannot see text drawn into a canvas or WebGL.

## Motion system

Put `class="m"` on an element and drive it with custom properties.

| `--in` / `--out` names                                            | File        | Use                          |
| ----------------------------------------------------------------- | ----------- | ---------------------------- |
| `rise` `drop` `left` `right` `fade` `zoom` `blur` `reveal` `wipe` | `base.css`  | Text and 2D entrances        |
| `pop` `draw` `grow-x` `grow-y`                                    | `base.css`  | Icons, badges, strokes, bars |
| `fade-out` `sink-out` `rise-out` `blur-out` `zoom-out` `wipe-out` | `base.css`  | Exits                        |
| `pop-in` `drop-in`                                                | `world.css` | 3D props. Transform-only.    |
| `slam`                                                            | `ui.css`    | Stamps, 2D only              |
| `press`                                                           | `ui.css`    | Button press on a click      |

- **Pick the entrance by what the element is:**
  - **Text:** `reveal`, `rise` or `blur`.
  - **Cards and panels:** `rise`, `left` or `right`, from the side they travel from, along their row.
  - **Icons, badges, chips:** `pop`.
  - **`zoom`:** only for an image or preview opening up (a screenshot, a video frame, a device screen).
  - **Vary across scenes:** the same main entrance in every scene reads as a template.
- **Entrance:** `--in:<name>`, starting at `--t`, plus `--i` × `--stagger`.
- **Exit:** `--out:<name>`, ending 0.1s before the cut unless `--out-t` sets it.
- **Durations:** `--in-dur` for the entrance, `--dur-out` for the exit. Easing: `--in-ease` (`--ease-out`, `--ease-emph`, `--ease-spring`).
- **Stacking:** a `.m` element takes one entrance and one exit. For more motion, nest wrappers, each with its own `.m` or animation.
- **Line reveal:** `<span class="line"><span class="m" style="--in:reveal">…</span></span>`.
- **Stroke draw:** an SVG path with `pathLength="1" class="stroke m" style="--in:draw"`.
- **Beat cues:** set `--beat` in `:root` from `out/beats.json`, then `--t: calc(var(--beat) * 6)`.
- **Path motion:** `offset-path: path('M…')` plus `@keyframes { to { offset-distance: 100% } }`.

## Camera

Each text element belongs to one layer. One frame can hold both.

| Layer                                               | Holds                                                                                       | Camera                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Screen (`.hud`)                                     | Caption track, chapter label and headline when the copy system uses them, caption card, CTA | Fixed after its entrance. Chapter headlines share one slot.                  |
| World (`[data-world]` wrapper, or a 3D `.viewport`) | The subject, props, labels on props, a logo placed in the scene, UI on a device screen      | Moves with the camera. It can pass under a HUD card, and a push can crop it. |

- **Motion comes from the content first:** when the content acts, the camera holds still. A camera move needs a reason: a held frame with nothing moving, a move across a world, a push into a screen.
- **Camera size follows the scene:** a slow 1–3% push on a held static image (screenshot, photo, device preview). Big moves across a world, like pushing into a laptop screen and pulling back out. Pick the move that shows the verb moment.
- **Mixed frames:** a zooming diorama under a fixed caption card is one world plus one HUD. A pure slide has a HUD and a drifting stage. A panned board or kinetic type can be all world.
- **Stage:** wrap the world in `.stage`. When the content moves enough, the stage holds still.
- **2D:** put `.drift` on the wrapper of a held static image, never on every scene by habit. For a deliberate move, animate a stage's `translate`/`scale` with slow `--ease-inout` keyframes. Layers at different speeds give parallax.
- **3D:** animate `--yaw`, `--pitch`, `--zoom`, `--pan-x` and `--pan-y` on `.cam` in one `@keyframes` block, one keyframe per camera stop. They are registered properties, so they interpolate.
  - `.viewport`: an orthographic camera looking down on a diorama. `--yaw` orbits it.
  - `.viewport.persp`: a perspective camera facing upright devices and cards. `--yaw` turns them, `--pitch` tilts them back. Keep both within ±20deg.
- **Centering an animated element:** use `transform: translate(-50%, -50%)`, never the `translate` property, which entrances and exits animate. `check` fails an element placed with its own `translate`.
- **Dead frames:** a frame is dead only when nothing moves. Fix it with the content's own action or an idle loop first. Push slowly only on a static image.
- **Check:** screen text is the headline or anything in `.hud`. After its entrance, `check` warns when it drifts over 0.5% of the short side or scales over 1.5%. Mark each chapter headline `data-headline`: `check` warns when one leaves the shared slot. Statements and captions move with each beat's composition and are not held to a slot. World text is exempt from the drift and scale limits and the HUD covering it. It is also exempt from the safe area while the camera pushes in.

## Rebuilding a reference design

1. **List the components** in the image: cards, bubbles, buttons, badges, avatars, icons.
2. **Build each one as HTML** with exact colors, radii, shadows and copy from the reference. Scale it up for video: body copy is 28px or more at 1080p.
3. **Draw icons** as inline SVG. Draw avatars as initials on gradient circles, or as simple SVG faces. Use a real photo only when supplied.
4. **Animate the parts**, not the composite: the card lands, then its icon pops, then its text types.

Use a supplied app screenshot as a device screen only when rebuilding it adds nothing. Crop it to the region that matters.

## Kit

Build from these parts before inventing new ones. Restyle each with tokens.

### Icons

- **Use:** `<i data-icon="credit-card"></i>`. `motion.js` fills it with an inline line icon before the first frame. A wrong name is a console error in `check`.
- **Find a name:** `grep -i "payment" references/icons.txt` (name plus search tags per line).
- **Size and color:** 1em square in `currentColor`. Set `font-size` and `color` on it or its parent.
- **Style:** `--icon-stroke` sets the line weight (default 2). `--icon-fill` fills closed shapes.
- **Draw on:** `data-draw data-at data-dur` on the `<i>` draws every stroke.
- **Consistency:** one icon family per video, on `.tile` squares or inline in text ("Tekan ⊕ untuk rekod").

### Leader lines

- **Use:** one `<svg class="links">` holds every line. Each `<path data-from="#a" data-to="#b">` joins two elements.
- **Routing:** `motion.js` reroutes the path every frame, leaving and entering on the facing edges, so lines follow moving ends.
- **Shape:** `data-shape="curve"` (default), `elbow` or `straight`. `data-from-at="80% 50%"` pins an end inside an element.
- **Draw on:** add `data-draw data-at data-dur`, plus `data-dash="3 6"` for a dotted line.

### UI parts (`ui.css`)

Link `ui.css` and extend it.

| Part         | Class                                                                                             | Note                                                         |
| ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Surfaces     | `.card`, `.card.featured` + `.ribbon`, `.window > .bar`, `.phone > .screen`, `.monitor > .screen` | `.featured` outlines the recommended plan                    |
| Phone action | `.tap`, `.sheet` with `--in:sheet-up`                                                             | A touch mark and a bottom sheet inside `.screen`             |
| Icon tile    | `.tile`, `.tile.soft`, `--tile`                                                                   | App-icon squares for payment methods, features, logos        |
| Labels       | `.chip`, `.chip.ok/.warn/.bad`, `.pill`, `.pill.glow`, `.kicker`                                  | `.kicker` is a numbered chapter tag: `<b>01</b>Rekod jualan` |
| Messages     | `.toast`, `.callout`, `.bubble`, `.bubble.out`, `.dots`                                           | `.callout` pairs with a leader line                          |
| Input        | `.prompt` with `.send`, `.btn` with `press`, `.cursor` + `.ripple`                                |                                                              |
| Lists        | `.checks`, `li.off`, `.steps` with `li.on` and `step-on`                                          | Build items one by one with `.m`                             |
| Paper        | `.stack > .paper`, `.paper.receipt`, `.stamp`                                                     | Labels, invoices, receipts                                   |
| Stickers     | `.burst` with `burst-in`, `.badge`, `.stamp`                                                      | Add `data-overlap-ok` when it sits on text                   |
| End card     | `.store`                                                                                          | Download buttons. Draw no store logos you were not given.    |
| Light        | `.sheen`, `.focus-group` with `dim-others`                                                        |                                                              |

### Atmospheres (`atmosphere.css`)

Each layer is a full-frame element before `<main class="stage">`, colored by tokens.

| Atmosphere            | Layers                                                                | Tokens                                             |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| Day sky               | `.sky`, `.cloud` ×3–5, a big soft `.cloud.near` in front of the stage | `--sky-top`, `--sky-low`, `--cloud`                |
| Night                 | `.sky`, `.stars`, `.glow.pulse`, `.vignette`                          | `--sky-top`, `--sky-low`, `--glow`                 |
| Meadow or planet edge | `.sky`, `.horizon`                                                    | `--ground`, `--ground-top`, `--horizon`, `--curve` |
| Studio                | `.studio`, `.pedestal > .on-top` with the product                     | `--studio`, `--floor`, `--pedestal`                |
| Flat backdrop         | `.bg`, `.dot-grid` patches in two corners                             | `--dot`                                            |
| Reveal                | `.rays` and `.glow` behind a logo                                     | `--glow`                                           |

- **Glass:** `.glass` and `.glass.dark` blur what lies behind them, so they need a busy backdrop (sky, clouds, glow). Put `.m` on the glass itself, never on a wrapper.
- **Depth of field:** `.far` softens a layer behind the subject, `.near` a layer in front of the lens. Rack focus: `--in:focus-in` on the new subject, `--out:focus-out` on the old. Never on a prop inside `.world`.
- **Cloud pass:** a cut hidden in cloud. End the scene on `.cloud-pass.cover`, start the next on `.cloud-pass.clear`, and push the stage with `--out:fly-out` and `--in:fly-in`.
- **Float:** `.float` on a wrapper hovers a finished card or icon.

### Maps

`map` draws an SVG sized to the frame from Natural Earth country outlines (public domain).

- **Frame it:** `--fit Malaysia,Singapore` frames countries. `--bbox 99.9,5.0,100.9,5.8` frames a box (lon1,lat1,lon2,lat2). With neither, it frames the pins and routes.
- **Mark it:** `--highlight Malaysia` fills countries. `--pin "Penang@100.33,5.41"` adds a labeled pin, `--pin 100.33,5.41` an unlabeled one. `--route "London@-0.13,51.5>Singapore@103.8,1.35"` adds a great-circle arc. A route through more places (`A>B>C`) draws as one stroke. Pins and routes repeat.
- **Detail:** `--detail 110m` for continents, `50m` (default) for countries, `10m` for islands and coastlines up close.
- **Precision:** Natural Earth coasts are off by about 1–2 km even at `10m`. A pier or bridge end can land in the sea. At city or island scale, supply precise GeoJSON (for example the user's OpenStreetMap export). `--land coast.geojson` replaces the outlines with its polygons. `--layer bridge.geojson` draws its lines and areas as `#layer-1-<name>`.
- **Use it:** `<div class="map-wrap" data-inline="../assets/map.svg"></div>` inlines the SVG, so `#route-1` can draw, `#pin-penang` enter and `#c-malaysia` fill.
- **Animate its parts:** a wrapper child like `<i data-part="#route-1" data-draw data-at="1.2" data-sfx="…" data-sfx-intent="draw"></i>` gives its attributes and classes to that part. Style parts with `.map .route { … }`: scene rules win over the map's own styles.
- **Turning or scaling a part:** SVG parts transform around the drawing's origin. Add `transform-box: fill-box; transform-origin: center` in the scene's CSS to use the part's own center.
- **Pins:** the position sits on an outer group, so a scale or bounce on `#pin-…` stays on the spot. Labels are 28px in `--mono`, right of the pin by default. Restyle with `.map .pin text { font: … }`. Place a label with `:left`, `:right`, `:above` or `:below` after the coordinates (`--pin "Ampang@101.74,3.16:above"`).
- **Colors:** from the scene palette. Land is a tint of `--fg` on `--bg`. Highlights, routes and pins are `--accent`. Labels are `--fg`. Override with `--map-land`, `--map-hl`, `--map-border`, `--map-route`, `--map-pin`, `--map-label`, `--map-area`, `--map-line`.
- **A zoom:** one map per level (world, country, island), joined by a push or a cut.
- **Names:** `map --countries` lists every country name. Coordinates are longitude first, from a reliable source: a misplaced pin is a false fact.

### Type

- **Any family:** `font "Fraunces"` fetches an open-licensed Fontsource family (Google Fonts and more) into `fonts/`, variable when it exists. Link `../fonts/<family>.css` and set `--font` or `font-family`. `--subset latin-ext` or `cyrillic` covers other scripts.
- **Glyph coverage:** the `latin` subset covers Western European letters and common punctuation. Many families miss `→`, `≥` and `✓`: add `--subset latin-ext`, or use an icon.
- **Brand fonts:** copy the supplied `.woff2` files into `fonts/` and declare them with `@font-face`.
- **Variable axes:** animate `font-variation-settings` or `font-weight` with `@keyframes` for type that changes weight or width.
- **Inline icon:** a `data-icon` inside a headline or body line sits on the text baseline.

## Sound

| Source         | When                                      | How                                                                                                                                      |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| User music     | Only a track the user supplied            | Set `music` in `video.json`, then run `beats`. Size scenes in `bars` so cuts land on downbeats.                                          |
| Motion effects | Default                                   | `data-sfx="<sound>"` and a matching `data-sfx-intent` on the animated element.                                                           |
| Voiceover      | The user supplied narration or a TTS file | `"voiceover"` in `video.json` for one file, or per-scene `audio` (scene length = 0.3s lead + audio + 0.5s tail). Timing: `narration.md`. |
| None           | The user asks for silence                 | `"sfx": false` in `video.json`.                                                                                                          |

Effects and accepted intent tags:

| Family    | Sound                     | Use for                                                                                                                                                                                                                                        | `data-sfx-intent`                                                          |
| --------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| UI        | `pop`                     | A graphic prop, badge, bubble or avatar appearing                                                                                                                                                                                              | `appearance`, `bubble`, `badge`, `avatar`                                  |
| UI        | `click`                   | A cursor click on a button                                                                                                                                                                                                                     | `mouse-click`, `button-press`                                              |
| UI        | `tap`                     | A soft touch on a phone screen                                                                                                                                                                                                                 | `touch`                                                                    |
| UI        | `type`                    | A mechanical key (Cherry MX Brown, fitted to recordings) at about 5.5 keys per second with uneven gaps. Typed text is silent until you add `data-sfx="type"` to the `data-type` element. It sits well under UI hits. `data-sfx-vol` raises it. | `typing` is inferred from `data-type`                                      |
| UI        | `tick`                    | Counters, checkmarks, small UI toggles                                                                                                                                                                                                         | `counter`, `checkmark`, `toggle`                                           |
| UI        | `toggle-on`, `toggle-off` | A switch turning on (rising fourth to the tonic) or off (falling)                                                                                                                                                                              | `toggle-on`, `switch-on`, `enable` / `toggle-off`, `switch-off`, `disable` |
| UI        | `blip`                    | A step marker or small notification                                                                                                                                                                                                            | `step`, `notification`                                                     |
| UI        | `flick`                   | A list flicked or scrolled: a swish with six detents slowing                                                                                                                                                                                   | `scroll`, `flick`, `swipe`                                                 |
| UI        | `shutter`                 | A screenshot or capture                                                                                                                                                                                                                        | `shutter`, `screenshot`, `capture`                                         |
| UI        | `glitch`                  | A digital glitch or corrupted state                                                                                                                                                                                                            | `glitch`, `corrupt`, `digital-error`                                       |
| UI        | `ticker`                  | A number rolling up. Ticks start fast and slow as the count settles. It spans the move.                                                                                                                                                        | `count-up`, `number-roll`                                                  |
| Contact   | `snap`                    | Parts clicking together                                                                                                                                                                                                                        | `connection`, `dock`                                                       |
| Contact   | `thud`                    | A soft landing                                                                                                                                                                                                                                 | `soft-impact`                                                              |
| Contact   | `slam`                    | A stamp or heavy landing                                                                                                                                                                                                                       | `stamp`, `heavy-impact`                                                    |
| Contact   | `stamp`                   | A rubber stamp pressed and lifted: body, paper crack, sticky lift-off                                                                                                                                                                          | `stamp`, `approve`, `seal`                                                 |
| Contact   | `paper`                   | A physical sheet flipping, sliding or settling                                                                                                                                                                                                 | `paper`, `sheet`, `page`                                                   |
| Contact   | `coin`                    | A coin landing and bouncing                                                                                                                                                                                                                    | `coin`, `money`, `payment`                                                 |
| Contact   | `drop`                    | A water drop                                                                                                                                                                                                                                   | `droplet`, `water`, `liquid`                                               |
| Motion    | `swoosh`                  | A fast card or text slide                                                                                                                                                                                                                      | `slide`                                                                    |
| Motion    | `whoosh`                  | A camera fly or scene transition                                                                                                                                                                                                               | `camera`, `transition`                                                     |
| Motion    | `drag`                    | Something dragged across a surface: a scrape that follows the move and pans with it                                                                                                                                                            | `drag`, `push`                                                             |
| Motion    | `spin`                    | A rotating object: air pulsing and circling between the ears                                                                                                                                                                                   | `spin`, `rotate`, `twirl`                                                  |
| Motion    | `draw`                    | A pen stroke, signature or underline. It spans the stroke.                                                                                                                                                                                     | `draw`, `write`, `scribble`, `underline`, `sign`                           |
| Motion    | `zip`                     | A zipper, or a seam closing                                                                                                                                                                                                                    | `zip`                                                                      |
| Elastic   | `spring`                  | A stylized elastic settle (a boing)                                                                                                                                                                                                            | `elastic`                                                                  |
| Elastic   | `jelly`                   | A squishy wobble, slower and wetter than spring                                                                                                                                                                                                | `jelly`, `wobble`, `squish`                                                |
| Elastic   | `pluck`                   | A plucked string: a playful step or a light arrival                                                                                                                                                                                            | `pluck`, `string`                                                          |
| Tonal     | `shimmer`                 | A highlight or polished reveal                                                                                                                                                                                                                 | `highlight`                                                                |
| Tonal     | `ding`                    | A single bright confirmation                                                                                                                                                                                                                   | `confirmation`                                                             |
| Tonal     | `success`                 | A two-note positive result                                                                                                                                                                                                                     | `success`                                                                  |
| Tonal     | `error`                   | A failure state: two short buzzes                                                                                                                                                                                                              | `error`                                                                    |
| Tonal     | `warning`                 | A soft two-tone alert                                                                                                                                                                                                                          | `warning`, `caution`, `alert`                                              |
| Tonal     | `downer`                  | An exit or collapse                                                                                                                                                                                                                            | `exit`, `collapse`                                                         |
| Tonal     | `sting`                   | A four-note bell arpeggio                                                                                                                                                                                                                      | `sting`, `chime`                                                           |
| Cinematic | `reverse`                 | Anticipation into a cut                                                                                                                                                                                                                        | `anticipation`                                                             |
| Cinematic | `riser`                   | A rising build that crests on its cue. Cue it on the element it builds to, never on a layer that starts at the cut.                                                                                                                            | `build`, `reveal`                                                          |
| Cinematic | `drone`                   | Tension under a scene that swells into its cue. `data-sfx-dur` sets its length (0.5-6 s).                                                                                                                                                      | `tension`, `drone`, `suspense`                                             |
| Cinematic | `hit`                     | A title or chapter hit: a brassy chord ("braam")                                                                                                                                                                                               | `cinematic-hit`, `title-hit`, `braam`                                      |
| Cinematic | `subdrop`                 | A deep falling drop under a reveal                                                                                                                                                                                                             | `sub-drop`, `bass-drop`                                                    |
| Cinematic | `boom`                    | A deep trailer impact with a long rumble                                                                                                                                                                                                       | `deep-impact`, `rumble`                                                    |

- **Binding:** put `data-sfx` on the element whose motion makes the sound. Retiming the animation moves the sound.
- **Intent:** set `data-sfx-intent` to the visible action in the table. `data-material="paper"` on the cue element or an ancestor supplies the intent `paper`, and its motion uses `data-sfx="paper"`. `check` rejects missing or mismatched intent.
- **Layering:** `check` rejects transient effects whose sound files start within 100 ms. Separate the impacts, or mark a deliberate layer with `data-sfx-layer="allow"`.
- **Measured arrival:** before capture, the renderer steps through the animation frame by frame and places each sound by kind:
  - **Appearance** (`pop`, `ding`, `shimmer`, `pluck` and the like): on the frame of fastest change (opacity times area, or its move).
  - **Contact** (`stamp`, `slam`, `snap`, `thud`, `drop`, a click): on arrival, the first frame at the final place, size and opacity.
  - **Movement** (`swoosh`, `whoosh`, `drag`): across the move, cresting on its fastest frame.
  - Position uses the element's box on screen, so SVG parts (a map pin, an inlined drawing) measure like HTML. Easing and overshoot count. Risers crest on the arrival.
- **A sound needs a visible change:** a slow fill, fade or drift gets no cue, or a sustained sound that spans it (`data-sfx="drone"`). Put the hit on the quick event before or after it.
- **Dynamic sounds:** the motion shapes each sound. Never repeat one clip to fake a longer event.

  | Measured                      | Shapes                                                                                                                                                                                                                                |
  | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Move duration and speed curve | `swoosh` and `whoosh` span the move and crest on its measured fastest frame. `draw`, `zip`, `drag`, `ticker` and `spin` start with the move and last as long as it. `data-sfx-dur` sets a `riser`, `reverse` or `drone` build length. |
  | Travel direction              | `swoosh`, `whoosh` and `drag` pan the way the element moves. A move toward the viewer, or one mostly up or down, stays centered.                                                                                                      |
  | Screen position               | Hits sit up to 40% toward the side where the element lands                                                                                                                                                                            |
  | On-screen size                | Pitch of `pop`, `tap`, `blip`, `snap`, `thud`, `slam`, `spring`, `downer`, `pluck`, `drop`, `jelly`: small is higher, large is lower. Scale sounds snap to the key. Tonic sounds keep their note.                                     |
  | Speed and distance            | Brightness and level of `swoosh` and `whoosh`. Level of `slam` and `thud`.                                                                                                                                                            |
  | Child landings                | A cued container renders one sound with one accent per animated child                                                                                                                                                                 |

- **Containers:** cue a group of like items (a paper stack, a row of chips, coins) on the group, never on single children. Its animated children become accents of one composite sound. `paper` adds a rustle under the whole span.
  - **No own motion:** a group with its own animation sounds once, at its own arrival, and `check` warns. Wrap the children in a still element and cue that.
  - **Dense groups:** `data-sfx-accents="6"` keeps 6 evenly spaced landings, for a sparse, low-energy beat.
- **Level math:** these multiply:
  1. The recipe's natural level (`SOUND_META.level`, in dB against the boom). Each source is loudness-normalized to it, peaking at most −6 dBFS.
  2. `data-sfx-vol`.
  3. The energy gain at the cue's moment (0.4 + 1.1 × energy). Energy also darkens low and brightens high.
  4. The motion gain for swooshes and impacts.
  5. The room send, added on top.

  The mix then gets one linear gain, so +6 dB on one cue is +6 dB in the video.

- **Verification:** `audit` checks every placed cue against the rendered pixels (`craft.md`).
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

- **Volume:** `data-sfx-vol` (0–4, linear).
- **Across cuts:** a lead-in that starts before its scene (`riser`, `reverse`, `whoosh`) begins in the previous scene. Before video time 0 it is trimmed, so it still lands on time. Cues at or after a scene's end are dropped. Tails ring past the cut.
- **Restraint:** cue only events the eye follows, at most about one effect per beat. Cue staggered siblings through their container.
- **With music:** only clicks, slams and whooshes, at `data-sfx-vol` 0.5 or below.
- **Natural edges:**
  - **Room send** per sound, set in `SOUND_META.space`: clicks, ticks, typing and taps stay dry. Paper, pops and impacts get a short tail. Whooshes, risers, chimes and the boom get more. The tail rings in the `sound.space` room.
  - **Feathered onsets:** noisy textures ease in over a few milliseconds.
  - **Whole mix** fades per `sound.fadeIn` and `sound.fadeOut`.
- **Repeats** vary on their own, since exact repetition reads as a notification. Keep an exact repeat only for a motif (`data-sfx-motif`).

### Materials

A struck material recolors the contact sounds `tap`, `tick`, `snap`, `thud` and `slam`, by modal synthesis. Materials: `wood`, `glass`, `metal`, `plastic`, `stone`, `rubber`, `ceramic`. Glass and metal ring out. Wood, plastic and stone stop short. Rubber is dull.

- **Per element:** `data-material="wood"` on the cue element or an ancestor.
- **Whole video:** `"sound.palette": "wood"` in `video.json`, for every contact cue without its own material. The default `synth` keeps the designed sounds.
- **Other sounds** are unchanged, and a struck material sets no intent: name it with `data-sfx-intent`.
- **Paper** is also a sound: `data-material="paper"` sets the intent `paper` and needs `data-sfx="paper"`.

### Key

Tonal sounds share one key, so they never clash with each other or the music.

- **Tonic sounds** move to the nearest tonic: `ding`, `success`, `shimmer`, `error`, `warning`, `sting`, `toggle-on`, `toggle-off`, `hit`, `drone`. Chords take a minor third in a minor key.
- **Scale sounds** follow size, then snap to the key's pentatonic scale: `pop`, `tap`, `blip`, `spring`, `downer`, `pluck`, `drop`, `jelly`.
- **Setting it:** `"sound.key": "auto"` (default) takes the key of `music`, or C major without music. `"D minor"` sets it outright. A relative major and minor (C major, A minor) share one pentatonic scale, so either detection sounds in key.

### Narration and captions

Voiceover, text to speech, word timing, caption tracks and sync checks: `narration.md`.

### User sounds

`data-sfx-src="../assets/hero.wav"` plays a supplied file in place of the synthesized sound, for a one-off hero sound. The path is relative to the scene's folder. The file keeps the named sound's intent, level, room send and sync class: `data-sfx="boom" data-sfx-src="..."` still counts as the payoff. Its loudness matches that sound's level. With `data-sfx-anchor="peak"`, its loudest moment lands on the cue. `check` reports a missing file.

## Gotchas

- **3D props take transform-only entrances** (`pop-in`, `drop-in`, `grow-x`, `grow-y`). An opacity or filter animation around a `.cube`, `.laptop` or `.stand` flattens it for the rest of the scene. `check` reports an error.
- **Upright faces:** `.stand` stands a flat element up on the plane. `.laptop` is a base plus a hinged lid, with `.lid > .screen` holding rebuilt UI.
- **Aiming 2D at 3D:** `probe "<selector>" <T>` prints an element's on-screen center and box, for cursor paths and connector endpoints.
- **`translate` belongs to `.m`.** Entrances animate `translate`, `scale` and `opacity`. Position a `.m` element with `left/top`, `inset`, margins, grid or a positioned wrapper.
- **Blank cuts:** if every entrance starts at `--t` ≥ 0, the first frame is bare background. Start the hero at a negative `--t` such as `-0.2s`.
- **Text entrances:** `rise`, `reveal`, `fade`, `blur` or `zoom`. `pop`, `pop-in` and `drop-in` scale from near zero: props, icons and badges only.
- **UI texture:** small real UI (in a device, thumbnail or miniature) can stay at true size. A callout, headline or caption must carry its meaning. Mark its container `data-texture`: `check` then skips size, reading time, contrast, overlap and safe area inside it. Numbers and words the viewer must read never go in texture. Pin them in a callout, or push in until they pass.
- **Deliberate overlap:** a stamp or badge over text needs `data-overlap-ok`, or `check` reports it.
- **Connector lines:** `<path data-draw data-at data-dur [data-dash="8 10"]>` draws solid and dashed strokes. `--in:draw` is for solid strokes only. Drop `vector-effect: non-scaling-stroke` on drawn paths: dash lengths are in path units.
- **Sounds on scripted motion:** a `data-sfx` on a `data-count` counter or `data-draw` path spans `data-at` to `data-at + data-dur`. A `ticker` then follows the count. `data-ease="linear"` counts at a steady rate.
- **Light worlds:** `class="light"` on `<html>` switches the default palette, surfaces and grain. A scene's own `:root { … }` tokens still win.
- **Avatars:** `.avatar.g1`–`.g6` gradients keep white initials at 4.5:1 or better.

## Render cost

- **Heavy:** `filter: blur`, `backdrop-filter` and large `box-shadow` slow capture. Use them on few elements: a few clouds, one or two glass panels.
- **DOM size:** under about 1500 elements per scene.
- **Iteration:** `still` and `render --draft`. One full render at the end.
