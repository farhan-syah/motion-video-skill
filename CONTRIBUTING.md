# Contributing

## What this skill is

A toolkit an AI agent uses to direct and render a video. The skill supplies tools, checks and knowledge. The agent supplies the idea. Every change keeps that split.

## What we accept

| Change                                        | What it needs                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bug fix                                     | A test that fails before the fix, when the bug can be tested. The exact error or wrong output in the pull request.                                             |
| A new check in `check` or `audit`             | A real video it catches. No false alarm on the example projects. The finding names what failed and the fix.                                                    |
| A new sound, entrance, UI part or icon set    | It fits the existing interface (`data-sfx`, `--in`, the kit classes). An open license.                                                                         |
| A new TTS or speech engine                    | It runs locally, behind `speak` or `transcribe` as they are, and its model downloads only when first used. Its code, weights and outputs allow commercial use. |
| Another language                              | Numbers, sentence splitting or caption rules for it, with a test. A native speaker's review of any wording.                                                    |
| Docs                                          | Written for an AI agent to act on: short, exact, one fact per line. Every command and flag matches the code.                                                   |
| Platform support (macOS, Windows, other GPUs) | Tested on that platform, named in the pull request.                                                                                                            |

## What we do not accept

- **Vendor lock:** code or docs that assume one AI vendor, one agent tool, or one cloud service.
- **Network during a render:** fetches belong only in setup commands (`font`, `lib`, `speak` model downloads, `update`), never in `check`, `render` or `audit`.
- **Telemetry,** analytics, or any call home.
- **Creative defaults:** a preset palette, a signature font, a stock sound on every video, or a template layout.
- **Brands:** another company's name, logo, palette or type used as a default or an example.
- **Generated live-action footage,** or voice cloning without the speaker's consent.
- **Restrictive licenses:** a model, voice, font, sound or asset whose license bars commercial use or restricts its outputs, as a default, a recommendation or an example.
- **Heavy dependencies** for a small gain. A new package needs a reason the existing ones cannot meet.

## How to send a change

1. **Open an issue first** to agree the approach for anything larger than a fix.
2. **Branch from `main`.** One topic per pull request.
3. **Run the tests:** `cd scripts && node --test lib/`. All pass.
4. **Try it on a video:** run `check` and `render` on a small project that uses your change. Put the `check` summary, the `audit` line and a frame of the sheet in the pull request.
5. **Update the docs** the change touches (`SKILL.md`, `references/`, `README.md`).
6. **Add a line to `CHANGELOG.md`** under `[Unreleased]`, in `Added`, `Changed` or `Fixed`.

## Style

- **Code:** plain JavaScript modules for Node 20+. Match the surrounding code. A comment says why, never what.
- **Writing:** short sentences in the present tense, one fact per sentence. No should, may, might or could. No simply, just or easily. Commands and paths exactly as typed. Examples are generic, never from one project.
- **Commits:** an imperative subject line that says what changed ("Place appearance sounds on their fastest change").

## Releases

The maintainer sets the version in `scripts/package.json` and moves `[Unreleased]` in `CHANGELOG.md` under the new version and date. Then they tag the commit `vX.Y.Z`.

## License

Contributions are licensed under this repository's MIT License.
