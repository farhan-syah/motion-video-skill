# Direction: from a one-line brief to a shot list

**Product** in these references means whatever the video is about: an app, a service, a course, an event, a place, a dataset, a person's work.

A plain brief gives a plain video. The quality comes from direction written before any code. Expand every brief into `direction.md` (shape: `templates/direction.md`). Do not ask the user to write it. Ask only the few questions that change the video, and only when they are open (`SKILL.md`, step 3).

## 0. Gather the facts

Everything the video claims is a fact from the user or from the product itself. Start with what the user supplied: the brief, screenshots, designs, copy, files. Research only fills the gaps.

- **Enough supplied:** when the brief and the supplied material already say what the product is, what it does and what it looks like, work from them. Do not research further.
- **Gaps:** when the brief is short or a needed fact is missing, research the product.
- **Find it:** the repo or folder the brief names or you are working in, its README, docs and source, its website, app store page, or any URL or file the user gave. Search for it when only a name is given.
- **Read it:** what it does, for whom, its real features, its real commands and screens, its real output, its real names, and any numbers it documents.
- **Collect real material:** screenshots of its UI, sample outputs it produced, its logo, its own copy. Run it when it is safe and quick to run, and capture what it shows.
- **Write the facts first:** list them in `direction.md` under Facts, each with its source. Every claim, feature and number on screen traces to one of them.
- **Still missing:** when a fact is still missing, leave it out of the video. Invent only the visual (palette, type, a logo when none exists) and sample content inside the UI, and name each invented item.

## 1. Extract

- **Read every supplied image.** List its components, copy, colors and layout. A design reference is a component library to rebuild, not a picture to paste.
- **Sample the palette** from the logo and screenshots. Use exact hex values. Add one neutral dark and one neutral light.
- **No brand colors:** derive the palette from the product's own world, never from a genre default.
  - **A reference video:** when the user shares an example ("like this"), take what they point at: its format, pacing, caption style, devices such as maps and timelines. Take its palette and type only when they ask for its look. Otherwise the palette comes from this subject's own world, so two videos made from one reference do not look alike.
  - **Source:** the product's world and its material. Film suggests warm cream, amber and deep brown. Paper suggests off-white and ink. A garden suggests greens and soil.
  - **Light or dark:** decide it for this product and write the reason in `direction.md`. Light frames read open and friendly. Dark frames read cinematic and focused.
  - **Accent:** one hue that belongs to the product's character, not the category. A near-black frame with a neon cyan accent is the stock look of every "tech" video. Use it only when the brand itself is that.
  - **Vary:** two videos for different products must not share a palette by default.
  - **Not the platform's brand:** never borrow the palette or type of the platform the product runs on, the tool it plugs into, or the AI that makes the video. A plugin for an editor, an app on an app store, a skill for an AI assistant: each gets its own identity from its own world. Use a platform's brand only when the brief says the product carries it.
- **Type:** take it from the logo and the supplied UI when they show it. Otherwise pick families for this product's voice and fetch them with `font` (`building.md`, Type). Inter in the template is a placeholder, not a choice.
- **Copy language:** match the product's own copy language. Keep brand terms verbatim.
- **Promise:** one sentence. Every scene serves it.
- **Features:** one idea per beat. Keep the features the beats can show well, and drop the rest.
- **Missing brand assets:** when the logo, tagline or brand hex is missing, invent one that fits and use it. Name every invented item in the summary, so the user can swap it.
- **Named color, no hex:** pick a mid-saturated hex in that family, such as `#16a34a` for "green". Derive the text shade with `--accent-ink`. Name the hex as invented.
- **No invented numbers:** never put a number, duration or metric on screen that the brief did not give, such as "3 days, not 30" or "Render: 2h 14m". Dramatize the claim with motion instead. Invented UI sample data (a line item, an amount, a frame counter in a mock player) is fine when no real data fits. Name it as invented. It never promotes a made-up brand to a title: see One brand on screen. Facts the product itself documents (its commands, its limits, its outputs) are not invented.
- **Length:** 30 s when the brief gives none.

## 2. Find the look

The look comes from this product and the concept (§3), not from its category. Decide them together.

- **Named style:** when the user names one ("Apple launch style", "isometric"), follow its entry in `styles.md`.
- **No named style:** derive the look from the product's world.
  - **Material:** what the product touches: paper and stamps, coins and receipts, code and terminals, food, fabric, maps. Build the frame from that material.
  - **Place:** where its user is when the pain happens: a stall at 2 AM, a desk, a warehouse, a phone in a queue. A video can travel through several places.
  - **Proof:** what the viewer must see to believe it: the real UI, the output, the before and after.
  - **References:** `styles.md` names looks to borrow from, blend or break. None is a default for a product type.
- **Supplied assets set limits:**
  - **UI screenshots or a design reference:** rebuild them, and put them at the center of the proof.
  - **No UI supplied:** never invent a dashboard to fill the frame. Show the physical world of the product instead.
  - **UI asked for but not supplied:** build a plausible rebuild, shown on a device or zoomed into, and name it as invented.
- **One visual language per video.** Every scene shares the type, icon family, light and camera language. The place can change by chapter (`concepts.md`, Design vocabulary), inside one palette family.

## 3. Choose the concept

Follow `concepts.md`: write three concepts with different story shapes and visual treatments, pick the strongest, and say why. The concept sets the beats, the compositions and the copy system.

- **Story, not slides:** a feature tour (one unrelated vignette per feature) reads as slides. Every shape in `concepts.md` carries a thread: a problem solved, a question answered, a flow completed, or one object changing.
- **Motif:** only when the concept is a motif journey. Other shapes carry their thread without one.
- **Real proof:** each claim shows the product's real artifact (actual UI, actual output, actual file contents), never a placeholder shape standing in for it.
- **One brand on screen:** the only name, logo or tagline shown as a title is the product's own. A viewer who sees another name large reads the video as being about that name.
  - **Sample content is fine inside the product's UI:** a chat message, a transaction, a customer name in a list, an invoice line. Keep it at UI size, in the product's frame.
  - **The subject stays generic or real:** when the product works on something (a brief, a store, a document), show the user's supplied material, or the product's own (a video tool can show the brief of this very video), or a generic kind ("a bakery's pre-order").
  - **Name it on its own:** call the product by its own name. Leave out the host it runs in (an AI assistant, an editor, an app store) unless the brief asks for it. "A skill for <assistant>" or "a plugin for <editor>" on the end card makes the product read as part of that platform.
  - **Never a second brand:** no invented product name as a headline, a wordmark, a hero frame or a title card ("Kettle", "Brew better."). It competes with the product and confuses the viewer.
- **Match cuts:** where a beat ends on an object and the next starts on it, cut on the object.

## 4. Structure the time

The story shape sets the order of beats. Every shape keeps three anchors:

| Anchor | Job |
|---|---|
| Hook | A strong image or line in the first 2 s. Motion from frame 0. No logo-first intros. |
| Payoff | The result made visible, or a before/after. A number only from the gathered facts. |
| End card | Logo, promise line, CTA button. Holds still for at least 1.5 s of reading. |

- **Beats:** 1.5–4 s each, 10–15 in a 30 s teaser. See `concepts.md` for pacing and compositions.

- **Logo:** it appears on the end card. When the brief asks to show the logo, also reveal it as a lockup right after the hook, never as the opening frame.
- **Music cuts:** snap every cut to a downbeat from `out/beats.json`, and put the payoff on the biggest energy hit.
- **Narration cuts:** with a voice, the words set the clock. Size each beat to the phrases it plays under, and cut in the pauses between them. A script with times per line sets the beats to those times.
- **No music:** plan a `data-sfx` cue for each verb moment the eye follows. Most camera moves stay silent. Under narration, keep effects to the pauses and the moments with no speech.
- **Each sound is chosen, not assigned.** Pick every sound for this moment in this world: what makes the noise, how big it is on screen, how long it lasts. No story role (hook, payoff, logo, end card) has a fixed sound. A payoff can land on a tonal phrase, a material hit, a texture swell, a cinematic impact, or silence. The concept decides.
- **Shape follows motion.** A landing is a short hit. A long move is a sustained sound that spans it. A transformation is a phrase that changes as it does. A run of short transients reads as dots. Mix short, sustained, tonal and textured sounds across the video.
- **Beyond the catalog:** when no catalog sound fits, supply one with `data-sfx-src` (a user file, or one made with any sound tool).
- **Sonic concept:** before any cue, write one line each:
  - **Material:** what the world is made of, and so what it sounds like. Set it as `sound.palette` (`wood`, `glass`, `metal`, `plastic`, `stone`, `rubber`, `ceramic`) or per element with `data-material`. See `building.md`.
  - **Key:** tonal effects follow `sound.key`. With music, `auto` takes the track's key. Without music, pick a key for the mood: a minor key reads darker.
  - **Motif:** the one sound that returns with the visual motif (`data-sfx-motif`). It can shift register as the motif changes.
  - **Mood shift:** where the character turns, such as from uncertain to decisive.
  - **Bed:** none, or `sound.bed` when the gaps between hits feel empty. The bed echoes the motif sound far away. It has no noise layer. Judge it by listening to both files `render` writes. Keep it only when it helps.
- **Sound arc:** direct the soundtrack as a whole before cueing single sounds. Without an arc, effects only react, and the track has no start, build, peak or resolution.
- **Energy moves inside scenes too.** Energy is not one level per beat. A tease plays light, then hits, drops back, then hits harder. Write the scene's `energy` as a curve of points where the moment calls for it: `[[0, 0.3], [1.8, 0.35], [2.0, 1], [2.6, 0.25], [3.4, 0.9]]`. Low points play quieter and darker, peaks louder and brighter. `audit` warns when a planned peak is not heard over the soft part beside it.
- **Rests:** leave a short silence before a reveal, so the hit lands against quiet. Do not put a whoosh on every cut.

  - **Character follows the story:** the kind of sound changes as the story turns, not only its loudness. Energy alone only changes loudness.
  - **Hierarchy:** each scene has one primary sound, its verb moment, at volume 1.2–2. Everything else is secondary, at 0.3–0.6. Keep at most 4 cues in a scene, plus typing. `check` warns about more.
  - **Containers:** cap accents with `data-sfx-accents` (3–4 is usually right). A hit per child turns a gesture into noise.

  - **Energy:** set it in `video.json`, per scene or as a curve inside a scene. It scales every effect's level and tone, ramped across cuts.
  - **Transitions:** set per cut with `in`, or leave the cut silent. It is pre-lapped, so it starts in the previous scene.
  - **Room:** choose `sound.space` (`tight`, `room`, `hall`) for the size of the world.
  - **End:** the last sound must resolve before the video ends. `audit` fails a tail that the end cuts off.
- **Sound intent:** name the visible action or material for every effect. Pick a matching intent tag from `building.md`, and separate simultaneous impacts unless the layer is deliberate.

## 5. Find the verb moment

Each feature is proven by one physical action, never by a bullet list. Find the verb that shows the benefit. Some examples:

| Benefit | Verb moment |
|---|---|
| Automation, "write once" | One message **fans out** into many cards, which fly to many avatars |
| Speed | A task **types itself**, a progress ring **snaps shut**, a timer **counts down** |
| Payment, approval | A card **floats up**, a button **is tapped**, a stamp **slams** |
| Scanning, AI extraction | A **light beam sweeps**, fields **pop out** as tags |
| Integration, sync | A dotted line **draws**, pulses **travel** along it, the far end **lights up** |
| Scale | Counters **roll up**, a grid **fills** tile by tile, the camera **pulls back** to reveal hundreds |
| Organization | Loose items **fly into** a folder or a stack **sorts itself** |
| Before/after | A **wipe** sweeps across, or the old UI **shatters** into the new one |

Add cue times: each sub-action starts on a beat, 2–4 beats apart.

## 6. Plan the camera

- **Layers:** decide for each text element whether it is screen text or world text (`building.md`, Camera).
  - **Screen text:** headline, chapter label, caption card, CTA. It holds one fixed spot while the world moves under it. A headline that drifts with the camera reads as a wobble.
  - **World text:** labels on props, a logo placed in the scene, UI on a device. It moves with the camera, because the viewer reads it as part of the place.
- **Camera size:** match the move to the scene. A slide whose content moves keeps the camera still. A held static image (screenshot, photo, preview) gets a slow push. A world gets real moves: orbit the diorama, push into the laptop screen to show the UI, pull back to show the result.
- **Never dead:** every shot has motion, first from the motif's own action. A camera push is for a frame that holds a static image, not a habit for every scene.
- **Transitions carry meaning:**

  | Transition | Use |
  |---|---|
  | Match cut | The object that ends scene N starts scene N+1 |
  | Camera fly | Move across one continuous world to the next island or card |
  | Zoom-through | Push into a UI element until it becomes the next scene |
  | Mask wipe | Hard change of topic, on a downbeat |

- **Continuous camera:** one scene file can hold the whole move. Long scenes still render in parallel.

## 7. Write the copy

- **Copy system:** pick one that fits the concept, and keep it through the video so it reads as one film:
  - **Caption track:** one narration line per beat along the bottom, with the key word in the accent.
  - **Statements:** big centered lines that change size and place with each beat's composition.
  - **Chapter headlines:** a parallel two-line pattern in a fixed `.hud` slot, with a label such as "03 · DIRECT". Mark each with `data-headline`, so `check` holds it to the slot. It fits a chaptered explainer, and it is not the default.
- **Under narration:** the voice carries the sentences. The screen shows what the ear cannot hold: the key word, the number, the name, the place, a word-synced caption track. Never a second copy of the whole script.
- **Headlines:** at most 6 words, one idea.
- **Captions:** one per feature, on a card at the top or bottom. Never on top of the action.
- **Reading time:** every line stays readable for at least words ÷ 3 seconds.
- **UI copy:** real and specific: names, amounts, dates. Never "Lorem ipsum" or "Feature 1".

## 8. Finish the document

`direction.md` is complete when the beats table can drive the build. Keep every field to one line: the time belongs in the scenes, not in prose.

- **Concept:** the three concepts, the chosen one, and why it wins.
- **Beat rows:** every object is named, every action has a cue time, and every beat names its primary sound.
- **Handoff:** give the user a 5-line summary of the direction, then build without waiting.
