# Styles

Each entry lists what makes the style read as itself. Build all of them from `base.css`, `ui.css`, `world.css`, `atmosphere.css`, `icons.js` and `motion.js`. Blend at most two styles, and keep one dominant. Typical layers and camera moves are starting points. The direction picks what fits each scene.

## Launch keynote (Apple style)

- **Typical layers:** the product turns in the world, and the phrase holds still in the `.hud` over it.
- **Palette:** pure black `#000`, or the `light` world (`#f5f5f7`). One accent gradient from the brand's own colors, used on one word per scene.
- **Type:** Inter 700–800, tracking −0.04em, huge. One phrase at a time, centered. Secondary copy at 40% opacity.
- **Signature moves:**
  - Blur-to-sharp word reveals: `--in:blur`.
  - Gradient text: `background-clip:text` on the key word.
  - The product floats in deep space on a slow 3D turn: `.viewport.persp`, with `--yaw` drifting from −14deg to 6deg and `--pitch` from 10deg to 4deg.
  - A specular light sweep crosses glass surfaces: `.sheen` from `ui.css`.
  - Sound is sparse and precise: each reveal lands against quiet.
  - Big numbers roll up: `data-count`.
- **Pacing:** long slow holds (2–4 bars), then a hard cut on a downbeat. Silence-like calm, then impact.
- **Build:** rebuild the product UI in HTML inside a device frame. Use rounded 28–44px corners, 1px inner highlight borders, deep soft shadows `0 60px 120px rgb(0 0 0/.5)`.
- **Pitfalls:** too many words per frame, and more than one accent color.

## UI story

- **Typical layers:** the UI lives in the world, and the camera can push into it. The headline holds its `.hud` slot.
- **Use:** app features, where the rebuilt UI is the hero. It pairs with Launch keynote.
- **Signature moves:**
  - Zoom into one component at 1.6–2.5x while the rest blurs.
  - A cursor glides on an eased path, then a click ripple and a pressed state.
  - Cards fan out from one source on dashed connector lines.
  - Chat bubbles pop in with a spring. A typing indicator comes first.
  - Avatars stack with overlap.
- **Build:**
  - Start from `ui.css`: `.window`, `.phone`, `.card`, `.bubble`, `.chip`, `.btn`, `.cursor`, `.avatar.g1`–`.g6`.
  - Recreate the reference's components on top of it, with real copy.
  - Connectors: `<path data-draw data-dash="8 10">` for dashed lines. Pulses travel along them with `offset-path` + `offset-distance` keyframes.
  - Cursor clicks: the `.cursor` arrives, `.ripple` fires, the `.btn` plays `press`, and `data-sfx="click" data-sfx-intent="button-press"` sounds.
- **Pitfalls:** a full-screen static screenshot, and text smaller than 28px at 1080p. Crop in so the UI reads.

## Isometric diorama (Storyset toon)

- **Typical layers:** the diorama is the world. The camera orbits it, pushes into a device screen to show the UI, and pulls back. Prop labels and a placed logo move with it. A numbered caption card can hold still in the `.hud` over it.
- **Palette:** white or very light background, a grey ground disc, 2 brand colors plus a dark slate ink. Flat faces with toon shading.
- **Signature moves:**
  - An orthographic camera that slowly orbits (`--yaw` ±10–20deg) and zooms between scenes.
  - Props bounce in: `--in:pop-in` or `--in:drop-in`, with `data-sfx="pop" data-sfx-intent="appearance"` on the key ones.
  - Soft contact shadows.
  - Finished props idle: `.bob`.
- **Build:**
  - `world.css`: `.viewport > .cam > .world`, props placed with `.at` and `--x --y --z`.
  - Boxes are `.cube` with 5 `<i>` faces.
  - A laptop is `.laptop`: a base slab plus a hinged lid, with the rebuilt UI in `.lid > .screen`.
  - Text and icons that must face the viewer sit in `.billboard`.
  - Caption cards stay in 2D in the `.hud`, above the viewport.
- **Pitfalls:** too many props at once. Aim for 3–6 per island. Shading must stay consistent: one light direction.

## Flat illustration explainer

- **Typical layers:** the scene is the world, and the headline holds still in the `.hud`.
- **Palette:** 3–4 flat brand colors, a soft pastel background, dark outlines or none. No gradients except subtle shadows.
- **Signature moves:**
  - Shapes morph and scale with overshoot.
  - Icons draw on as strokes.
  - Elements slide on arcs.
  - Scenes change with a circle or blob mask wipe.
- **Build:** inline SVG. Animate groups with `.m`, and strokes with `--in:draw`. Draw characters as simple geometric SVG.
- **Pitfalls:** mixing detailed and flat drawing styles.

## Kinetic typography

- **Typical layers:** the words are the action, so they live in the world and move by design. No `.hud`.
- **Use:** announcements, music-led edits, manifestos.
- **Signature moves:**
  - One word per beat.
  - Words scale, rotate 90°, and stack into a block.
  - Line masks reveal: `.line` + `--in:reveal`.
  - Color inverts on the downbeat.
  - Key words change weight.
- **Build:** position words absolutely on a grid. Cue every word from `beats.json`.
- **Pitfalls:** words that go by too fast to read. The checker's reading-time warning applies.

## Data story

- **Typical layers:** the chart is the world, and the camera pushes to the key number. The headline holds in the `.hud`.
- **Signature moves:**
  - Bars grow from the baseline: `--in:grow-y` with `.grow-y-origin`.
  - Lines draw.
  - Counters roll.
  - The camera pushes to the one number that matters, and every other element dims to 30%.
- **Build:** SVG charts with real numbers. Bars stagger by `--i`, in data order.
- **Pitfalls:** more than one message per chart. Pick the chart form for the data's message, and use color to encode meaning, not to decorate.

## Dark tech

- **Typical layers:** the headline and labels hold in the `.hud`, and the product moves in the world.
- **Palette:** a near-black background with one glowing accent taken from the brand, a grid floor and particles. With no brand color, pick the accent from the product's own world. Cyan is not the default.
- **Signature moves:**
  - A perspective grid floor recedes: `.viewport.persp`, with a large plane using a repeating-linear-gradient grid.
  - Nodes connect with pulsing lines.
  - Terminal text types itself: `data-type`.
  - Glow with layered `box-shadow` or `drop-shadow`.
- **Pitfalls:** glow on everything. Keep 1–2 glowing focal points per frame.

## Editorial grid

- **Typical layers:** the grid is the `.hud` slot system. Images move in the world inside their cells.
- **Palette:** bold flat color blocks, black type, one accent.
- **Signature moves:**
  - Full-frame color blocks wipe in on downbeats: `--in:wipe`.
  - Oversized numerals.
  - Images crop and slide inside frames.
  - A strict 12-column grid.
- **Pitfalls:** off-grid placements. Every block snaps to the grid.
