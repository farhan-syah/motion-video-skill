# Building scenes

## Project layout

`init <dir>` creates:

| Path | Role |
|---|---|
| `direction.md` | The shot list. Fill it first. |
| `video.json` | Manifest: size, fps, scenes, music. Fields: `cli.md`. |
| `base.css` | Tokens, type scale, motion system, grain, safe area. Edit the `:root` tokens per video. |
| `world.css` | 3D camera, cuboids, ground disc, laptop, coin stack, ring pad, shadows, pops. Link it only in 3D scenes. |
| `ui.css` | Product-UI parts. See Kit below. |
| `atmosphere.css` | Skies, clouds, cloud-pass cuts, horizon, studio sweep, pedestal, stars, glow, rays, dot grid, glass, depth of field. Link it when a scene has a place, not a flat backdrop. |
| `icons.js` | 1854 Lucide line icons (ISC, `icons.LICENSE.txt`). Names and search tags: `references/icons.txt` in the skill. |
| `motion.js` | Seek runtime: icons, counters, typing, leader lines, stroke drawing, custom hooks. |
| `fonts/` | Inter and JetBrains Mono as placeholders. `font "Family"` fetches any Fontsource family here. Brand `.woff2` files go here too. |
| `scenes/*.html` | One file per scene. Each links `../base.css`, `../icons.js` and `../motion.js`. |
| `lib/` | Optional libraries copied by `lib` (GSAP, three.js, Lottie). |
| `assets/` | Supplied images, footage frames from `footage`, 3D models, Lottie files. |

Split the video into scene files at hard cuts. Keep one file for a continuous camera move across several features. The renderer splits long scenes into parallel chunks.

## Seek contract

The renderer freezes time. Each frame, it sets every CSS animation to the frame time, then calls `window.__video.seek(ms)`. Anything outside this contract breaks the render:

- **Allowed:** CSS `@keyframes` with `animation-delay`, Web Animations API, `data-count`, `data-type`, `data-split`, `data-frames`, `__video.use(timeline)`, and `__video.on((ms) => …)` hooks that draw from `ms` alone. See Beyond CSS.
- **Forbidden:**
  - CSS transitions
  - `setTimeout`/`setInterval`
  - `requestAnimationFrame` loops
  - `Date`/`performance.now` in drawing code
  - `<video>`: extract the clip with `footage` instead
  - animated GIFs
  - class changes after load
- **`Math.random`:** seeded and stable across renders.
- **Fonts:** only `@font-face` from local files. A system font fails `check`.
- **Images:** local files. They are decoded before frame 0.
- **Scene duration:** CSS reads it as `var(--scene-dur)`, which the renderer injects.

## Beyond CSS

CSS and the kit cover most scenes. Anything a browser can draw can go in a scene, as long as it draws from the video time. Reach for these when the idea needs them, not by default.

| Need | Tool | How |
|---|---|---|
| Word-by-word or letter-by-letter type | `data-split` | `<h1 data-split="words" data-in="rise" data-t="0.2" data-stagger="0.06">`. `chars` for letters, `data-mask` for a line-mask reveal. |
| Shape morphs, path motion, complex choreography | GSAP (`lib gsap`) | Build one `gsap.timeline({ paused: true })`, then `__video.use(tl)`. MorphSVG, MotionPath, SplitText and DrawSVG are in `lib/gsap/`. |
| Real 3D: models, materials, lights, particles | three.js (`lib three`) | A module script. Draw inside `__video.on((ms) => { …; renderer.render(scene, camera); })`. Use `preserveDrawingBuffer: true`. |
| After Effects animations, animated illustrations | Lottie (`lib lottie`) | `__video.use(lottie.loadAnimation({ …, autoplay: false, path: '../assets/x.json' }), at)` |
| Real footage, screen recordings | `footage` | `footage clip.mp4 --from 2 --to 6` writes frames and prints `<img data-frames …>`. Style the `<img>` like any image. |
| Generative art, charts, particles in 2D | `<canvas>` | Draw in `__video.on((ms) => …)` from `ms` alone. `Math.random` is seeded. |
| Custom filters: displacement, glow, grain | SVG filters | `<filter>` with `feTurbulence`, `feDisplacementMap`. Animate its attributes in a hook. |

- **Async setup:** wrap loading (a model, a texture, a JSON file) in `__video.wait(promise)`. The renderer waits for it before frame 0. Call it before the first `await` in a module script.
- **Timing offset:** `__video.use(tl, 1.5)` starts the timeline 1.5 s into the scene.
- **Hooks return nothing,** or a promise that resolves once the frame is drawn. Never return a GSAP timeline: it is thenable, and the render stalls. `seek` stops with an error after 10 s.
- **Local files only:** scenes load over `file://` with file access allowed, so `fetch`, module imports and model loaders read project files. Nothing loads from the network.
- **Check stays on:** text drawn into a canvas or WebGL is invisible to `check`. Keep reading text in HTML.

## Motion system

Put `class="m"` on an element and drive it with custom properties.

| `--in` / `--out` names | File | Use |
|---|---|---|
| `rise` `drop` `left` `right` `fade` `zoom` `blur` `reveal` `wipe` | `base.css` | Text and 2D entrances |
| `pop` `draw` `grow-x` `grow-y` | `base.css` | Icons, badges, strokes, bars |
| `fade-out` `sink-out` `rise-out` `blur-out` `zoom-out` `wipe-out` | `base.css` | Exits |

- **Pick the entrance by what the element is:**
  - **Text:** `reveal`, `rise` or `blur`.
  - **Cards and panels:** `rise`, `left` or `right`, from the side they travel from. A panel in a row slides in along the row.
  - **Icons, badges, chips:** `pop`.
  - **`zoom`:** only for an image or preview opening up, such as a screenshot, a video frame or a device screen. Never the default entrance for content.
  - **Vary across scenes:** the same entrance for the main element in every scene reads as a template, not a film.
| `pop-in` `drop-in` | `world.css` | 3D props. Transform-only. |
| `slam` | `ui.css` | Stamps, 2D only |
| `press` | `ui.css` | Button press on a click |

- **Entrance:** `--in:<name>`, starting at `--t`, plus `--i` × `--stagger`.
- **Exit:** `--out:<name>`, ending 0.1s before the cut unless `--out-t` sets it.
- **Durations:** `--in-dur` for the entrance, `--dur-out` for the exit. Easing: `--in-ease` (`--ease-out`, `--ease-emph`, `--ease-spring`).
- **Stacking:** a `.m` element takes one entrance and one exit. For more motion, nest wrappers, each with its own `.m` or animation.
- **Line reveal:** `<span class="line"><span class="m" style="--in:reveal">…</span></span>`.
- **Stroke draw:** an SVG path with `pathLength="1" class="stroke m" style="--in:draw"`.
- **Beat cues:** set `--beat` in `:root` from `out/beats.json`, then `--t: calc(var(--beat) * 6)`.
- **Path motion:** `offset-path: path('M…')` plus `@keyframes { to { offset-distance: 100% } }`.

## Camera

Every text element belongs to one of two layers. The choice is per element, so one frame can hold both.

| Layer | Holds | Camera |
|---|---|---|
| Screen (`.hud`) | Caption track, chapter label and headline when the copy system uses them, caption card, CTA | Fixed. It never moves after its entrance. With chapter headlines, every chapter shares one headline slot. |
| World (`[data-world]` wrapper, or a 3D `.viewport`) | The subject, props, labels on props, a logo placed in the scene, UI on a device screen | Moves with the camera: pans, orbits, pushes into a screen, pulls back. It can pass under a HUD card, and a push can crop it. |

- **Motion comes from the content first:** when the content acts, the camera holds still. A camera move needs a reason: a held frame with nothing moving, a move across a world, a push into a screen.
- **Camera size follows the scene:** a slow 1–3% push on a held static image (a screenshot, a photo, a device preview), or big moves across a world, like pushing into a laptop screen to show its UI and pulling back out. Pick the move that shows the verb moment.
- **Mixed frames:** a diorama that zooms and pans, with a fixed caption card over it, is one world plus one HUD. A pure slide has a HUD and a drifting stage. A panned board or kinetic type can be all world, with no HUD.
- **Stage:** wrap the world in `.stage`. When the content moves enough, the stage holds still.
- **2D:** put `.drift` on the wrapper of a held static image, or animate a stage's `translate`/`scale` with slow `--ease-inout` keyframes for a deliberate move. Never `.drift` on every scene by habit. Layers at different speeds give parallax.
- **3D:** animate `--yaw`, `--pitch`, `--zoom`, `--pan-x` and `--pan-y` on `.cam` with one `@keyframes` block, one keyframe per camera stop. They are registered properties, so they interpolate.
  - `.viewport`: an orthographic camera looking down on a diorama. `--yaw` orbits it.
  - `.viewport.persp`: a perspective camera facing upright devices and cards. `--yaw` turns them left or right, and `--pitch` tilts them back. Keep both within ±20deg.
- **Dead frames:** a frame is dead only when nothing moves at all. Fix it with the content's own action or an idle loop first, and with a slow push only when the frame holds a static image.
- **Check:** `check` warns when screen text (the headline, or anything in `.hud`) drifts more than 0.5% of the short side or scales more than 1.5% once it has entered. With chapter headlines, mark each one `data-headline`: `check` warns when one leaves the shared slot. Statements and captions, in the `.hud` or not, move with each beat's composition and are not held to a slot. World text is exempt from both, from the HUD covering it, and from the safe area while the camera pushes in.

## Rebuilding a reference design

1. **List the components** in the image: cards, bubbles, buttons, badges, avatars, icons.
2. **Build each one as HTML** with exact colors, radii, shadows and copy from the reference. Scale it up for video: body copy is 28px or more at 1080p.
3. **Draw icons** as inline SVG. Draw avatars as initials on gradient circles, or as simple SVG faces. Use a real photo only when supplied.
4. **Animate the parts**, not the composite: the card lands, then its icon pops, then its text types.

Use a supplied app screenshot as a device screen only when rebuilding it adds nothing. Crop it to the region that matters.

## Kit

Build from these parts before inventing new ones. Restyle each with tokens. Every part below renders in a scene without extra code.

### Icons

- **Use:** `<i data-icon="credit-card"></i>`. `motion.js` fills it with an inline line icon before the first frame.
- **Find a name:** `grep -i "payment" references/icons.txt`. Each line holds a name and its search tags.
- **Size and color:** the icon is 1em square in `currentColor`. Set `font-size` and `color` on it or its parent.
- **Style:** `--icon-stroke` sets the line weight (default 2). `--icon-fill` fills closed shapes.
- **Draw on:** `data-draw data-at data-dur` on the `<i>` draws every stroke of the icon.
- **Consistency:** one icon family per video. Put icons on `.tile` squares or inline in text, as in "Tekan ⊕ untuk rekod".
- **Wrong name:** `check` reports the name as a console error.

### Leader lines

- **Use:** one `<svg class="links">` holds every line. Each `<path data-from="#a" data-to="#b">` joins two elements.
- **Routing:** `motion.js` routes the path every frame, so the line follows its ends while they move. It leaves and enters on the facing edges.
- **Shape:** `data-shape="curve"` (default), `elbow` or `straight`. `data-from-at="80% 50%"` pins an end inside an element.
- **Draw on:** add `data-draw data-at data-dur`, plus `data-dash="3 6"` for a dotted line.
- **Uses:** callout cards pinned to phone rows, a connection tree, a dotted flight path between props.

### UI parts (`ui.css`)

| Part | Class | Note |
|---|---|---|
| Surfaces | `.card`, `.card.featured` + `.ribbon`, `.window > .bar`, `.phone > .screen`, `.monitor > .screen` | `.featured` outlines the recommended plan |
| Phone action | `.tap`, `.sheet` with `--in:sheet-up` | A touch mark and a bottom sheet inside `.screen` |
| Icon tile | `.tile`, `.tile.soft`, `--tile` | App-icon squares for payment methods, features, logos |
| Labels | `.chip`, `.chip.ok/.warn/.bad`, `.pill`, `.pill.glow`, `.kicker` | `.kicker` is a numbered chapter tag: `<b>01</b>Rekod jualan` |
| Messages | `.toast`, `.callout`, `.bubble`, `.bubble.out`, `.dots` | `.callout` pairs with a leader line |
| Input | `.prompt` with `.send`, `.btn` with `press`, `.cursor` + `.ripple` | |
| Lists | `.checks`, `li.off`, `.steps` with `li.on` and `step-on` | Build items one by one with `.m` |
| Paper | `.stack > .paper`, `.paper.receipt`, `.stamp` | Labels, invoices, receipts |
| Stickers | `.burst` with `burst-in`, `.badge`, `.stamp` | Add `data-overlap-ok` when it sits on text |
| End card | `.store` | Download buttons. Draw no store logos you were not given. |
| Light | `.sheen`, `.focus-group` with `dim-others` | |

### Atmospheres (`atmosphere.css`)

A place makes a video feel made, not templated. Each layer is a full-frame element before `<main class="stage">`, colored by tokens.

| Atmosphere | Layers | Tokens |
|---|---|---|
| Day sky | `.sky`, `.cloud` ×3–5, a big soft `.cloud.near` in front of the stage | `--sky-top`, `--sky-low`, `--cloud` |
| Night | `.sky`, `.stars`, `.glow.pulse`, `.vignette` | `--sky-top`, `--sky-low`, `--glow` |
| Meadow or planet edge | `.sky`, `.horizon` | `--ground`, `--ground-top`, `--horizon`, `--curve` |
| Studio | `.studio`, `.pedestal > .on-top` with the product | `--studio`, `--floor`, `--pedestal` |
| Flat backdrop | `.bg`, `.dot-grid` patches in two corners | `--dot` |
| Reveal | `.rays` and `.glow` behind a logo | `--glow` |

- **Glass:** `.glass` and `.glass.dark` blur what lies behind them. They need a busy backdrop (sky, clouds, glow) to read as glass. Put `.m` on the glass itself, never on a wrapper.
- **Depth of field:** `.far` softens a layer behind the subject, `.near` a layer in front of the lens. A rack focus is `--in:focus-in` on the new subject and `--out:focus-out` on the old one. Never on a prop inside `.world`.
- **Cloud pass:** a cut hidden in a flight through cloud. End the scene on `.cloud-pass.cover`, start the next on `.cloud-pass.clear`, and push the stage with `--out:fly-out` and `--in:fly-in`.
- **Float:** `.float` on a wrapper hovers a finished card or icon.

### Maps

`map` draws real geography from Natural Earth country outlines (public domain): an SVG sized to the frame.

- **Frame it:** `--fit Malaysia,Singapore` frames countries. `--bbox 99.9,5.0,100.9,5.8` frames a box (lon1,lat1,lon2,lat2). With neither, it frames the pins and routes.
- **Mark it:** `--highlight Malaysia` fills countries. `--pin "Penang@100.33,5.41"` adds a labeled pin, `--pin 100.33,5.41` an unlabeled one. `--route "London@-0.13,51.5>Singapore@103.8,1.35"` adds a great-circle arc. A route through more places (`A>B>C`) is one path that draws as one stroke. Both repeat.
- **Detail:** `--detail 110m` for continents, `50m` (default) for countries, `10m` for islands and coastlines up close.
- **Precision:** Natural Earth coasts are off by about 1–2 km even at `10m`. At city or island scale, a pier or a bridge end can land in the sea. There, supply precise GeoJSON (for example an OpenStreetMap export the user provides): `--land coast.geojson` replaces the outlines with its polygons, and `--layer bridge.geojson` draws its lines and areas as `#layer-1-<name>`.
- **Use it:** `<div class="map-wrap" data-inline="../assets/map.svg"></div>` inlines the SVG, so its parts animate: `#route-1` draws, `#pin-penang` enters, `#c-malaysia` fills.
- **Animate its parts:** a child `<i data-part="#route-1" data-draw data-at="1.2" data-sfx="…" data-sfx-intent="draw"></i>` of the wrapper gives its attributes and classes to that part once it is inlined. Style parts with `.map .route { … }`: the map's own styles yield to any scene rule.
- **Pins:** the position sits on an outer group, so a scale or bounce on `#pin-…` stays on the spot. Labels are 28px.
- **Colors:** tokens `--map-land`, `--map-hl`, `--map-border`, `--map-route`, `--map-pin`, `--map-label`, `--map-area`, `--map-line`.
- **A zoom:** draw one map per level (world, country, island) and move between them with a push or a cut.
- **Names:** `map --countries` lists every country name. Coordinates are longitude first. Take them from a reliable source, since a pin in the wrong place is a false fact.

### Type

- **Glyph coverage:** a fetched `latin` subset covers Western European letters and common punctuation, not every symbol (`→`, `≥` and `✓` are missing from many). Add `--subset latin-ext`, or draw the symbol with an icon.
- **Any family:** `font "Fraunces"` fetches a Fontsource family (the Google Fonts library and more, all open licensed) into `fonts/`, variable when it exists. Link `../fonts/<family>.css` and set `--font` or `font-family`. `--subset latin-ext` or `cyrillic` covers other scripts.
- **Brand fonts:** copy the supplied `.woff2` files into `fonts/` and declare them with `@font-face`.
- **Variable axes:** set `font-variation-settings` or `font-weight` and animate them with `@keyframes` for type that changes weight or width as it moves.
- **Inline icon:** a `data-icon` inside a headline or body line sits on the text baseline.

## Sound

| Source | When | How |
|---|---|---|
| User music | The user supplied a track | Set `music` in `video.json`, then run `beats`. Size scenes in `bars` so cuts land on downbeats. |
| Motion effects | Default, with no music | `data-sfx="<sound>"` and a matching `data-sfx-intent` on the animated element. |
| Voiceover | The user supplied narration or a TTS file | One file for the whole video: `"voiceover"` in `video.json`. Narration cut per scene: per-scene `audio`, and the scene length derives from it (0.3s lead + audio + 0.5s tail). Time everything to its words: `narration.md`. |
| None | The user asks for silence | `"sfx": false` in `video.json`. |

Never add music the user did not supply.

Effects and accepted intent tags, by family:

| Family | Sound | Use for | `data-sfx-intent` |
|---|---|---|---|
| UI | `pop` | A graphic prop, badge, bubble or avatar appearing | `appearance`, `bubble`, `badge`, `avatar` |
| UI | `click` | A cursor click on a button | `mouse-click`, `button-press` |
| UI | `tap` | A soft touch on a phone screen | `touch` |
| UI | `type` | A mechanical key (Cherry MX Brown, fitted to recordings) on a `data-type` element, at a human rhythm of about 5.5 keys per second with uneven gaps. Add `data-sfx="type"`: typed text makes no sound on its own. Its natural level sits well under UI hits, as a keyboard does in a room. `data-sfx-vol` raises it. | `typing` is inferred from `data-type` |
| UI | `tick` | Counters, checkmarks, small UI toggles | `counter`, `checkmark`, `toggle` |
| UI | `toggle-on`, `toggle-off` | A switch turning on (rising fourth to the tonic) or off (falling) | `toggle-on`, `switch-on`, `enable` / `toggle-off`, `switch-off`, `disable` |
| UI | `blip` | A step marker or small notification | `step`, `notification` |
| UI | `flick` | A list flicked or scrolled: a swish with six detents slowing | `scroll`, `flick`, `swipe` |
| UI | `shutter` | A screenshot or capture | `shutter`, `screenshot`, `capture` |
| UI | `glitch` | A digital glitch or corrupted state | `glitch`, `corrupt`, `digital-error` |
| UI | `ticker` | A number rolling up. Ticks start fast and slow as the count settles. It spans the move. | `count-up`, `number-roll` |
| Contact | `snap` | Parts clicking together | `connection`, `dock` |
| Contact | `thud` | A soft landing | `soft-impact` |
| Contact | `slam` | A stamp or heavy landing | `stamp`, `heavy-impact` |
| Contact | `stamp` | A rubber stamp pressed and lifted: body, paper crack, sticky lift-off | `stamp`, `approve`, `seal` |
| Contact | `paper` | A physical sheet flipping, sliding or settling | `paper`, `sheet`, `page` |
| Contact | `coin` | A coin landing and bouncing | `coin`, `money`, `payment` |
| Contact | `drop` | A water drop | `droplet`, `water`, `liquid` |
| Motion | `swoosh` | A fast card or text slide | `slide` |
| Motion | `whoosh` | A camera fly or scene transition | `camera`, `transition` |
| Motion | `drag` | Something dragged across a surface: a scrape that follows the move and pans with it | `drag`, `push` |
| Motion | `spin` | A rotating object: air pulsing and circling between the ears | `spin`, `rotate`, `twirl` |
| Motion | `draw` | A pen stroke, signature or underline. It spans the stroke. | `draw`, `write`, `scribble`, `underline`, `sign` |
| Motion | `zip` | A zipper, or a seam closing | `zip` |
| Elastic | `spring` | A stylized elastic settle (a boing) | `elastic` |
| Elastic | `jelly` | A squishy wobble, slower and wetter than spring | `jelly`, `wobble`, `squish` |
| Elastic | `pluck` | A plucked string: a playful step or a light arrival | `pluck`, `string` |
| Tonal | `shimmer` | A highlight or polished reveal | `highlight` |
| Tonal | `ding` | A single bright confirmation | `confirmation` |
| Tonal | `success` | A two-note positive result | `success` |
| Tonal | `error` | A failure state: two short buzzes | `error` |
| Tonal | `warning` | A soft two-tone alert | `warning`, `caution`, `alert` |
| Tonal | `downer` | An exit or collapse | `exit`, `collapse` |
| Tonal | `sting` | A four-note bell arpeggio | `sting`, `chime` |
| Cinematic | `reverse` | Anticipation into a cut | `anticipation` |
| Cinematic | `riser` | A rising build. It crests on its cue's moment, so cue it on the element whose moment it builds to, not on a layer that starts at the cut. | `build`, `reveal` |
| Cinematic | `drone` | Tension under a scene that swells into its cue. `data-sfx-dur` sets its length (0.5-6 s). | `tension`, `drone`, `suspense` |
| Cinematic | `hit` | A title or chapter hit: a brassy chord ("braam") | `cinematic-hit`, `title-hit`, `braam` |
| Cinematic | `subdrop` | A deep falling drop under a reveal | `sub-drop`, `bass-drop` |
| Cinematic | `boom` | A deep trailer impact with a long rumble | `deep-impact`, `rumble` |

- **Binding:** put `data-sfx` on the element whose motion makes the sound. Retiming the animation moves the sound with it.
- **Intent:** set `data-sfx-intent` to the visible action in the table. `data-material="paper"` on the cue element or an ancestor supplies the intent `paper`. `check` rejects missing or mismatched intent.
- **Material:** tag physical sheets with `data-material="paper"`. Their motion uses `data-sfx="paper"`. Struck materials: see Materials below.
- **Layering:** `check` rejects transient effects whose sound files start within 100 ms. Separate the impacts, or mark a deliberate layer with `data-sfx-layer="allow"`.
- **Measured arrival:** before capture, the renderer steps through the element's animation frame by frame. The cue lands on the first frame where the element's own `scale`, `translate`, `rotate`, `opacity`, `transform` and `offset-distance` sit within tolerance of their final values. That is the frame where a pop reaches full size, a stamp lands or a cursor arrives. Easing and overshoot are included. Risers crest on the arrival.
- **Dynamic sounds:** each sound is shaped by the motion that makes it. Never repeat one clip to fake a longer event.

  | Measured | Shapes |
  |---|---|
  | Move duration and speed curve | `swoosh` and `whoosh` span the move and crest on its measured fastest frame. `draw`, `zip`, `drag`, `ticker` and `spin` start with the move and last as long as it. `data-sfx-dur` sets a `riser`, `reverse` or `drone` build length. |
  | Travel direction | `swoosh`, `whoosh` and `drag` pan the way the element moves. A move toward the viewer, or one mostly up or down, stays centered. |
  | Screen position | Hits sit up to 40% toward the side where the element lands |
  | On-screen size | Pitch of `pop`, `tap`, `blip`, `snap`, `thud`, `slam`, `spring`, `downer`, `pluck`, `drop`, `jelly`: small is higher, large is lower. Scale sounds snap to the key. Tonic sounds keep their note. |
  | Speed and distance | Brightness and level of `swoosh` and `whoosh`. Level of `slam` and `thud`. |
  | Child landings | A cued container renders one sound with one accent per animated child |

- **Containers:** for a group of like items (a paper stack, a row of chips, a set of coins), put `data-sfx` on the group, not on single children. Its animated children become accents of one composite sound. `paper` adds a rustle under the whole span.
  - **No own motion:** a group with its own animation sounds once, at its own arrival. `check` warns about it. Wrap the children in a still element and cue that.
  - **Dense groups:** `data-sfx-accents="6"` keeps 6 evenly spaced landings out of many. It keeps the rhythm without a hit per child, which a sparse, low-energy beat needs.
- **Level math:** a cue's level is set by five factors, and they multiply:
  1. The recipe's natural level (`SOUND_META.level`, in dB against the boom). Each source is normalized by loudness to it, never peaking above −6 dBFS: a tick stays small and a slam big.
  2. `data-sfx-vol`.
  3. The energy gain at the cue's moment (0.4 + 1.1 × energy). Energy also tilts the tone: darker when low, brighter when high.
  4. The motion gain for swooshes and impacts.
  5. The room send, added on top.

  The finished mix then gets one linear gain to the loudness target. Relative levels therefore hold exactly: +6 dB on one cue is +6 dB in the video.
- **Verification:** `audit` checks every placed cue against the rendered pixels. See `craft.md`.
- **Overrides:**

  | Attribute | Does |
  |---|---|
  | `data-sfx-on="start\|end\|0.4"` | Picks a point in the element's own animation |
  | `data-sfx-offset="-0.05"` | Shifts the cue by signed seconds |
  | `data-sfx-once` | One sound for a group that moves itself and has animated children, on purpose |
  | `data-sfx-anchor="start\|peak\|end"` | Chooses which point of the sound lands on the cue |
  | `data-sfx-variant="0-3"` | Pins one variant. Without it, repeats of a sound rotate through 4 variants in video order: each changes the attack and tone color, then pitch slightly. |
  | `data-sfx-motif` | Repeats one sound every time: the same variant, and the first occurrence's pitch, whatever the element's size. A motif on a container keeps its own accent rhythm. |
  | `data-sfx-pitch="0.8-1.25"` | Sets the pitch outright, instead of from the element's size |
  | `data-sfx-layer="allow"` | Allows a deliberate transient overlap |
  | `data-sfx-accents="6"` | Caps a container's accents to evenly spaced landings |
  | `data-sfx-dur="1.2"` | Sets a sound's length in seconds, for an event with no measurable motion or a build before a reveal |
  | `data-sfx-at` | Sets the cue in seconds. Use it only for an event with no element of its own. |
  | `data-material="wood"` | Strikes a contact sound in that material. See Materials below. |
  | `data-sfx-src="file.wav"` | Plays a supplied file in place of the recipe. See User sounds below. |

  `check` warns when a `data-sfx-at` misses its element's impact by more than 80 ms. It reports an invalid attribute value as an error.
- **Volume:** `data-sfx-vol` (0–4, linear).
- **Across cuts:** a sound whose lead-in starts before its scene (`riser`, `reverse`, `whoosh`) begins in the previous scene. Before video time 0, the lead-in is trimmed, so the sound still lands on time. Cues at or after a scene's end are dropped. Tails ring past the cut.
- **Restraint:** cue only the events the eye follows. Use at most about one effect per beat. Cue staggered siblings through their container, never one by one.
- **With music:** keep effects to clicks, slams and whooshes, at `data-sfx-vol` 0.5 or below.
- **Natural edges:** sounds are not dry clips.
  - **Room send:** each sound has one, set in `SOUND_META.space`. Clicks, ticks, typing and taps stay dry. Paper, pops and impacts get a short tail. Whooshes, risers, chimes and the boom get more.
  - **Room:** the tail rings out in the room chosen by `sound.space`.
  - **Feathered onsets:** noisy textures ease in over a few milliseconds instead of starting on a hard edge.
  - **Whole mix:** it fades in and out per `sound.fadeIn` and `sound.fadeOut`.
- **Arc:** `energy` scales every effect, per scene or as a curve inside one. Plan the arc in `direction.md` before cueing single sounds.
- **Repeats:** exact repetition reads as a notification sound. Repeats vary on their own. Keep an exact repeat only for a motif, with `data-sfx-motif`.

### Materials

A struck material recolors the five contact sounds: `tap`, `tick`, `snap`, `thud` and `slam`. The materials are `wood`, `glass`, `metal`, `plastic`, `stone`, `rubber` and `ceramic`. Each renders as that object struck (modal synthesis: the material's resonances plus the contact noise). Glass and metal ring out. Wood, plastic and stone stop short. Rubber is dull.

- **Per element:** `data-material="wood"` on the cue element or an ancestor.
- **Whole video:** `"sound.palette": "wood"` in `video.json`. It applies to every contact cue without its own material. The default `synth` keeps the designed sounds.
- **Other sounds:** a struck material does not change them, and it sets no intent. Name the intent with `data-sfx-intent`.
- **Paper** is the one material that is also a sound: `data-material="paper"` sets the intent `paper` and needs `data-sfx="paper"`.

### Key

Tonal sounds share one key. A sting, a success chime and a pluck then never clash, with each other or with the music.

- **Tonic sounds** move to the nearest tonic of the key: `ding`, `success`, `shimmer`, `error`, `warning`, `sting`, `toggle-on`, `toggle-off`, `hit`, `drone`. Chords take a minor third in a minor key.
- **Scale sounds** follow size, then snap to the key's pentatonic scale: `pop`, `tap`, `blip`, `spring`, `downer`, `pluck`, `drop`, `jelly`. Any two of them form a consonant interval.
- **Setting it:** `"sound.key": "auto"` (default) takes the key of `music`, or C major without music. A name such as `"D minor"` sets it outright. A relative major and minor (C major and A minor) share one pentatonic scale. Detection that picks either one still sounds in key.

### Narration and captions

Voiceover, text to speech, word timing, caption tracks and sync checks: `narration.md`.

### User sounds

`data-sfx-src="../assets/hero.wav"` plays a supplied file instead of the synthesized sound. The path resolves from the scene's folder. The file keeps the named sound's intent, level, room send and sync class: `data-sfx="boom" data-sfx-src="..."` still counts as the payoff. Its loudness is matched to that sound's level. With `data-sfx-anchor="peak"`, the file's loudest moment lands on the cue. `check` reports a missing file.

Use it for a one-off hero sound the synthesized set cannot make. Use a file the user supplied, or one made with any sound tool.

## Gotchas

- **3D props take transform-only entrances.** An opacity or filter animation around a `.cube`, `.laptop` or `.stand` flattens it for the rest of the scene, so upright faces vanish. Use `pop-in`, `drop-in`, `grow-x` or `grow-y`. `check` reports the flattening as an error.
- **Upright faces:** `.stand` stands a flat element up on the plane. `.laptop` is a base plus a hinged lid, with `.lid > .screen` holding rebuilt UI.
- **Aiming 2D at 3D:** `probe "<selector>" <T>` prints an element's on-screen center and box. Aim cursor paths and connector endpoints with it.
- **`translate` belongs to `.m`.** Entrance keyframes animate `translate`, `scale` and `opacity`. Position a `.m` element with `left/top`, `inset`, margins or grid, or put it in a positioned wrapper.
- **Blank cuts:** a scene's first frame shows only the background when every entrance starts at `--t` ≥ 0. Start the hero at a negative `--t`, such as `-0.2s`, so the cut lands mid-motion.
- **Text entrances:** use `rise`, `reveal`, `fade`, `blur` or `zoom`. `pop`, `pop-in` and `drop-in` scale from near zero, so reserve them for props, icons and badges.
- **UI texture:** real UI inside a device, a thumbnail or a miniature frame can stay at its true, small size when a callout, headline or caption carries its meaning. Mark its container with `data-texture`. `check` then skips size, reading time, contrast, overlap and the safe area for the text inside it. Numbers and words the viewer must read never go in texture: pin them in a callout, or push the camera in until they pass.
- **Deliberate overlap:** a stamp or badge that sits over text needs `data-overlap-ok`. Otherwise `check` reports it as covering the text.
- **Connector lines:** use `<path data-draw data-at data-dur [data-dash="8 10"]>`. `motion.js` draws solid and dashed strokes. `--in:draw` is for solid strokes only. Drop `vector-effect: non-scaling-stroke` on drawn paths: the dash lengths are in the path's own units.
- **Sounds on scripted motion:** a `data-sfx` on a `data-count` counter or a `data-draw` path spans its `data-at` to `data-at + data-dur`, so a `ticker` follows the count. `data-ease="linear"` makes a counter count at a steady rate.
- **UI parts:** see Kit. Link `ui.css`, restyle it with tokens, and extend it.
- **Light worlds:** add `class="light"` to `<html>`. That switches the default palette, surfaces and grain. A scene's own `:root { … }` tokens still win over it.
- **Avatars:** use `.avatar.g1`–`.g6`. Their gradients keep white initials at 4.5:1 or better.

## Render cost

- **Heavy:** `filter: blur`, `backdrop-filter` and large `box-shadow` raise capture time. Use them on few elements: a few clouds, one or two glass panels.
- **DOM size:** keep it under about 1500 elements per scene.
- **Iteration:** use `still` and `render --draft`. Run a full render once at the end.
