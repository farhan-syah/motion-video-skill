# Direction: from a one-line brief to a shot list

**Product** means whatever the video is about: an app, a service, a course, an event, a place, a dataset, a person's work.
Expand every brief into `direction.md` (shape: `templates/direction.md`) before any code. Never ask the user to write it. Questions: `SKILL.md`, step 3.

## 0. Gather the facts

Every claim in the video is a fact from the user or the product. Start with what the user supplied (brief, screenshots, designs, copy, files). If that already says what the product is, does and looks like, do not research further.

- **Gaps:** research the product: the repo or folder the brief names or you work in, its README, docs and source, its website or app store page, any URL or file the user gave. Search for it when only a name is given.
- **Read:** what it does and for whom, its real features, commands, screens, output and names, and any numbers it documents.
- **Collect real material:** UI screenshots, sample outputs, its logo, its own copy. If it is safe and quick to run, run it and capture what it shows.
- **Write the facts first** in `direction.md` under Facts, each with its source. Every claim, feature and number on screen traces to one.
- **Still missing:** leave the fact out. Invent only the visual (palette, type, a logo when none exists) and sample content inside the UI. Name each invented item.

## 1. Extract

- **Read every supplied image.** List its components, copy, colors and layout. A design reference is a component library to rebuild, not a picture to paste.
- **Sample the palette** from the logo and screenshots in exact hex. Add one neutral dark and one neutral light.
- **No brand colors:** derive the palette from the product's own supplied material and its audience, never from a genre default.
  - **A reference video** ("like this") lends what the user points at: format, pacing, caption style, devices such as maps and timelines. Take its palette and type only when they ask for its look.
  - **Light or dark:** decide for this product (light reads open and friendly, dark cinematic and focused) and write the reason in `direction.md`.
  - **Accent:** one hue from the product's character, not its category.
  - **Stock looks:** near-black with neon cyan, and warm paper or cream with terracotta, amber or orange, are where a generated palette drifts when nobody chooses.
  - **Choose, don't drift:** write three candidate palettes from different hue families in `direction.md`, each with its reason, then pick one. A palette nobody chose is a stock look.
  - **Vary:** two videos for different products must not share a palette by default.
  - **Not the platform's brand:** never borrow the palette or type of the platform the product runs on, the tool it plugs into, or the AI making the video. The exception: the brief says the product carries it.
- **Type:** from the logo and supplied UI when they show it. Otherwise pick families for this product's voice and fetch them with `font` (`building.md`, Type). The template's Inter is a placeholder.
- **Copy language:** match the product's own. Keep brand terms verbatim.
- **Promise:** one sentence that every scene serves.
- **Features:** one idea per beat. Keep those the beats can show well, drop the rest.
- **Missing brand assets:** invent a fitting logo, tagline or brand hex. Name each in the summary so the user can swap it.
- **Named color, no hex:** pick a mid-saturated hex in that family, such as `#16a34a` for "green", and name it as invented. Derive the text shade with `--accent-ink`.
- **No invented numbers:** never show a number, duration or metric the brief did not give ("3 days, not 30", "Render: 2h 14m"). Dramatize the claim with motion. Invented UI sample data (a line item, an amount, a frame counter in a mock player) is fine when no real data fits. Name it, and never promote it to a title. Facts the product documents (its commands, limits, outputs) are not invented.
- **Length:** 30 s when the brief gives none.

## 2. Find the look

The look comes from this product and the concept (§3), never its category. Decide them together.

- **Named style** ("Apple launch style", "isometric"): follow its entry in `styles.md`.
- **No named style:** derive the look from the product's world.
  - **Material:** what it touches (paper and stamps, coins and receipts, code and terminals, food, fabric, maps). Build the frame from it.
  - **Place:** where its user is when the pain happens (a stall at 2 AM, a desk, a warehouse, a phone in a queue). A video can travel through several.
  - **Proof:** what the viewer must see to believe it: the real UI, the output, the before and after.
  - **References:** `styles.md` looks can be borrowed, blended or broken. None is a default for a product type.
- **Supplied UI screenshots or designs:** rebuild them at the center of the proof.
- **No UI supplied:** never invent a dashboard to fill the frame. Show the product's physical world.
- **UI asked for but not supplied:** a plausible rebuild on a device or zoomed into, named as invented.
- **One visual language per video** (`SKILL.md`, Non-negotiables). Places by chapter: `concepts.md`, Design vocabulary.

## 3. Choose the concept

Follow `concepts.md`: three concepts, the strongest picked, and why. The concept sets the beats, compositions and copy system.

- **Story, not slides:** a feature tour (one unrelated vignette per feature) reads as slides. Every shape carries a thread: a problem solved, a question answered, a flow completed, one object changing.
- **Motif:** only in a motif journey.
- **Real proof:** each claim shows the product's real artifact (actual UI, output, file contents), never a placeholder shape.
- **One brand on screen:** only the product's own name, logo or tagline appears as a title. A viewer reads the video as being about any name shown large.
  - **Sample content** inside the product's UI is fine (a chat message, a transaction, a customer name, an invoice line), at UI size in the product's frame.
  - **The subject stays generic or real:** what the product works on is the user's material, the product's own (a video tool can show this video's brief), or a generic kind ("a bakery's pre-order").
  - **Name it on its own:** leave out the host it runs in (an AI assistant, an editor, an app store) unless the brief asks. "A skill for <assistant>" or "a plugin for <editor>" on the end card ties it to that platform.
  - **Never a second brand:** no invented product name as a headline, wordmark, hero frame or title card ("Kettle", "Brew better.").
- **Match cuts:** where a beat ends on an object and the next starts on it, cut on the object.

## 4. Structure the time

The story shape sets the order of beats. Every shape keeps three anchors:

| Anchor   | Job                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hook     | A strong image or line in the first 2 s that tells a stranger what the video is about. Motion from frame 0. No logo-first intros. |
| Payoff   | The result made visible, or a before/after. A number only from the gathered facts.                                                |
| End card | Logo, promise line, CTA button. Holds still for at least 1.5 s of reading.                                                        |

- **Beats:** pacing and compositions: `concepts.md`.
- **Orient first:** the first 2–3 s name the subject, on screen and in the first spoken line. A viewer who scrolled in knows what this is and why to watch before any scenario starts ("So you open the app…" assumes context the viewer lacks). A question hook still names its subject.
- **Thumbnail frame:** frame 0 is the thumbnail on most platforms. It shows the subject or title in display type, readable as a still at phone size. Never a blank, a half-built frame, or chrome alone.
- **Logo:** on the end card. If the brief asks to show the logo, also reveal it as a lockup right after the hook. Never open on it.
- **Music cuts:** snap every cut to a downbeat from `out/beats.json`. Put the payoff on the biggest energy hit.
- **Narration cuts:** the words set the clock. Size each beat to its phrases and cut in the pauses. A timed script sets the beats to its times.
- **Effects:** plan a `data-sfx` cue for each verb moment the eye follows. Most camera moves stay silent.
- **Each sound is chosen, not assigned:** pick it for what makes the noise, how big it is on screen, and how long it lasts. No story role has a fixed sound. A payoff can land on a tonal phrase, a material hit, a texture swell, a cinematic impact, or silence.
- **Shape follows motion:** a landing is a short hit, a long move a sustained sound that spans it, a transformation a changing phrase. A run of short transients reads as dots. Mix short, sustained, tonal and textured sounds.
- **Beyond the catalog:** `data-sfx-src` (`building.md`, User sounds).
- **Sonic concept:** before any cue, write one line each:
  - **Material:** what the world is made of: `sound.palette` or per-element `data-material` (`building.md`, Materials).
  - **Key:** `sound.key`. With music, `auto` takes the track's key. Without, pick one for the mood: minor reads darker.
  - **Motif:** the one sound that returns with the visual motif (`data-sfx-motif`). It can shift register as the motif changes.
  - **Mood shift:** where the character turns, such as from uncertain to decisive.
  - **Bed:** none, or `sound.bed` when the gaps between hits feel empty. It echoes the motif sound far away. Keep it only if it helps when you listen to both files `render` writes.
- **Sound arc:** direct the soundtrack as a whole before single sounds: start, build, peak, resolution. Without it, effects only react.
- **Energy moves inside scenes:** a tease plays light, hits, drops back, then hits harder. Write `energy` as a curve where the moment calls for it: `[[0, 0.3], [1.8, 0.35], [2.0, 1], [2.6, 0.25], [3.4, 0.9]]`, in seconds from the scene's start. A peak scales the sounds at that moment, so put it on the hit's time that `check` and `audit` print. `audit` warns when a planned peak is not heard over the soft part beside it.
- **Character follows the story:** the kind of sound changes as the story turns. Energy alone only changes loudness.
- **Rests:** a short silence before a reveal lets the hit land against quiet. No whoosh on every cut.
- **Hierarchy:** one primary sound per scene, its verb moment, at volume 1.2–2. The rest at 0.3–0.6. At most 4 cues a scene, plus typing: `check` warns about more.
- **Containers:** cap accents with `data-sfx-accents`, usually 3–4.
- **Transitions:** set per cut with `in` (pre-lapped into the previous scene), or leave the cut silent.
- **Room:** `sound.space` (`tight`, `room`, `hall`) for the size of the world.
- **End:** the last sound resolves before the video ends. `audit` fails a tail the end cuts off.

## 5. Find the verb moment

Prove each feature with one physical action that shows the benefit:

| Benefit                  | Verb moment                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Automation, "write once" | One message **fans out** into many cards, which fly to many avatars                               |
| Speed                    | A task **types itself**, a progress ring **snaps shut**, a timer **counts down**                  |
| Payment, approval        | A card **floats up**, a button **is tapped**, a stamp **slams**                                   |
| Scanning, AI extraction  | A **light beam sweeps**, fields **pop out** as tags                                               |
| Integration, sync        | A dotted line **draws**, pulses **travel** along it, the far end **lights up**                    |
| Scale                    | Counters **roll up**, a grid **fills** tile by tile, the camera **pulls back** to reveal hundreds |
| Organization             | Loose items **fly into** a folder or a stack **sorts itself**                                     |
| Before/after             | A **wipe** sweeps across, or the old UI **shatters** into the new one                             |

Add cue times: each sub-action starts on a beat, 2–4 beats apart.

## 6. Plan the camera

- **Layers:** mark each text element as screen text or world text. Layers, camera sizes and dead frames: `building.md`, Camera.
- **Transitions carry meaning:**

  | Transition   | Use                                                         |
  | ------------ | ----------------------------------------------------------- |
  | Match cut    | The object that ends scene N starts scene N+1               |
  | Camera fly   | Move across one continuous world to the next island or card |
  | Zoom-through | Push into a UI element until it becomes the next scene      |
  | Mask wipe    | Hard change of topic, on a downbeat                         |

## 7. Write the copy

- **Copy system:** pick one that fits the concept and keep it through the video:
  - **Caption track:** one narration line per beat along the bottom, the key word in the accent.
  - **Statements:** big centered lines that change size and place with each beat's composition.
  - **Chapter headlines:** a parallel two-line pattern in a fixed `.hud` slot, with a label such as "03 · DIRECT", each marked `data-headline`. For a chaptered explainer, not the default.
- **Under narration:** the voice carries the sentences. The screen shows what the ear cannot hold: the key word, number, name, place, or a word-synced caption track. Never a second copy of the script.
- **Headlines:** at most 6 words, one idea.
- **Captions:** one per feature, on a card at the top or bottom, never over the action.
- **Reading time:** every line holds for at least words ÷ 3 seconds.
- **UI copy:** real names, amounts, dates. Never "Lorem ipsum" or "Feature 1".

## 8. Finish the document

`direction.md` is complete when the beats table can drive the build. Keep every field to one line.

- **Concept:** the three concepts, the chosen one, and why it wins.
- **Beat rows:** every object named, every action with a cue time, every beat with its primary sound.
