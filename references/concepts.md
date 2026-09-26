# Concepts: story, beats, composition and design

The concept decides the video before any scene exists. A fixed recipe (the same headline slot, chapter label and panel in every scene) makes every video look alike.

The tables show range from strong product videos, not a menu. Blend, twist or ignore them for an idea this product earns. If the kit (`building.md`) lacks something the idea needs, build it. Never shrink the idea to fit the kit.

## Choose the concept

1. **Start from the product, not from this file.** What does it touch in the real world? What moment does its user live through? What can only this product's video show?
2. **Write three concepts,** one line each, with different story shapes and visual treatments. At least one comes from the product itself, not a table here.
3. **Pick the strongest** for this product, audience and runtime. Write in `direction.md` why it beats the other two.
4. **Vary across videos:** two videos for different products must not share a concept by default.

## Story shapes (examples)

| Shape                     | How it runs                                                                                                                                                                                    | Fits                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Problem → turn → proof    | A concrete everyday moment of the pain ("02:00 AM, orders everywhere"), one pain per beat. The product arrives, and each pain is solved on screen.                                             | Tools that remove a chore                   |
| Question hook             | Open on the question the viewer already has ("Why is it still hard?"). Answer it with evidence, then name the product.                                                                         | A service with one strong claim             |
| Search → overload → guide | Start where the viewer starts: a search bar types a query. The results explode into too many. The product brings order.                                                                        | Directories, courses, marketplaces          |
| Live walkthrough          | A cursor uses the real product end to end: type, pick, click. The result lands where it matters: a chat, a PDF, a phone.                                                                       | Apps with one clear flow                    |
| Stat → mechanism → result | A number the brief supplies, then how the product moves it, then the result rising.                                                                                                            | Products with a proven result               |
| Manifesto                 | Kinetic words carry the whole piece, one idea per beat, with almost no UI.                                                                                                                     | Launches, announcements, brands             |
| Motif journey             | One object changes state through every beat and becomes the end card.                                                                                                                          | Processes and pipelines                     |
| Chaptered walkthrough     | A question hook and a logo lockup, then one numbered chapter per feature: kicker, two-line headline, the phone doing it, callouts pinned to its rows. A recap grid, plans, the store end card. | Apps with many features, 45–90 s explainers |

## Beats and pacing

- **Beat:** one idea on screen, 1.5–4 s long. A 30 s teaser holds 10–15 beats. One scene file can hold several.
- **Rhythm:** vary beat length. Quick bursts build toward a longer hold on the key beat.
- **Continuity:** carry the eye from beat to beat: a word morphs into the next line, a card slides to its new place, a color floods the frame.
- **Hook and end card:** `direction.md`, §4.

## Compositions (examples)

Vary the composition from beat to beat. Take one from this table or invent one for the beat.

| Composition         | What it is                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Giant type          | One to three words fill the frame, centered                                                        |
| Statement + proof   | A centered line, with the UI or object that proves it below                                        |
| Big number          | A counter or stat rolls up, with a small label under it. Only numbers the brief gives.             |
| Collage burst       | Many cards, thumbnails or icons scatter or fly in, often in perspective depth                      |
| Stacked list        | Words land one per line on the beat: "Writing. Marketing. Design."                                 |
| UI demo             | Real UI at readable size, driven by a cursor                                                       |
| Device              | The result on a phone or laptop screen                                                             |
| Diagram             | Sources flow along lines into the product, and the result flows out                                |
| Person              | A supplied photo cutout or an avatar reacts beside the idea                                        |
| Split               | Two states side by side: before and after, question and answer                                     |
| Timeline            | A path with pins, walked step by step                                                              |
| Logo reveal         | The lockup builds with a burst, glow or light sweep                                                |
| Callout walkthrough | A device on one side, callout cards on the other, joined to its rows by leader lines one at a time |
| Feature grid        | Every feature as an icon tile with a name, landing tile by tile. A recap before the end card.      |
| Plans               | Tier cards side by side. The recommended one is outlined, with a ribbon, and its checklist builds. |
| Diorama             | An isometric island of props: a laptop with the UI, coin stacks, papers, a mascot on a ring pad    |
| Product on a set    | A monitor or phone on a pedestal in a studio or on a horizon, with papers and receipts around it   |

## Craft devices (examples)

- **Kinetic type:** word-by-word reveals, a strike-through that corrects a line, a highlighter swipe, a hand-drawn circle around a word, a slot-machine counter, a search bar typing.
- **Stickers and badges:** a tilted "FREE", "NEW" or "HUNDREDS" slapped onto a card.
- **Caption track:** with no voiceover, one plain narration line per beat along the bottom, key word in the accent. The visuals above can stay nearly wordless.
- **Color moment:** the frame floods to the accent color for the brand reveal, then returns.
- **Type as a device:** a word that changes weight, width or family on the beat, type that fills a shape, type set on a path.
- **Real material:** supplied screenshots, product thumbnails and people's photos beat invented shapes. Use every supplied asset.

## Design vocabulary

Motion is half the look. The rest is the place, the objects and the graphic system, each designed for this product. `building.md` (Kit, Beyond CSS) renders them, and anything missing can be built.

### Worlds

- **One atmosphere per chapter:** a day sky with soft clouds for the promise, a deep night for "while you sleep", a meadow horizon for growth, a pale studio for the product.
- **Travel between them:** fly through cloud (`.cloud-pass`), blur through, or push into a screen.
- **Flat worlds still get texture:** a tinted backdrop with light blooms and dot-grid patches in the corners.

### Depth and material

- **Layers:** a soft far layer, the sharp subject, a big blurred near layer in front of the lens.
- **Glass:** frosted panels over a sky or a glow, which it blurs.
- **Light:** a glow behind the hero, rays behind the logo, a sheen across a screen.

### Objects

- **Devices:** a phone with real UI, a monitor on a pedestal, a laptop in a diorama.
- **Paper:** stacked shipping labels, a receipt with a torn edge, an invoice with a stamp.
- **Money and tools:** coin stacks, a calculator, a pencil, a folder, when the product handles them.
- **A character:** a mascot or supplied person gives the story a face. Build it from shapes or use the supplied art, on a ring pad or beside the idea.

### Graphic system

- **Icons:** one line-icon family (`data-icon`), in tiles or inline. An icon keeps one meaning every time it returns.
- **Stickers:** a starburst "AUTO ISI" or "NEW" slapped onto a device corner on the beat.
- **Chapter devices:** a numbered kicker ("01 · REKOD JUALAN"), a step banner that lights 1–4, a status chip that flips from "Belum bayar" to "Dibayar".
- **Real UI:** the product's own screens with real names, amounts and states. A tap mark, a bottom sheet and a toast show it in use. On a whole phone the UI can stay small as texture (`data-texture`) while callouts carry the reading.
- **Type:** families for this product's voice, fetched with `font`. One family with strong weight and size contrast often beats two. Two families on one line need matched x-height and weight.
- **End card:** logo, promise line, store badges or a button, and the URL.
