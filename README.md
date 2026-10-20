# Recipe Denoiser

> **Experimental browser support:** This project currently uses experimental AI APIs. Automatic recipe conversion works only on a limited set of Chrome versions and operating-system combinations, with compatible hardware and browser settings.

Turn recipe prose into a left-to-right cooking dependency table. Ingredients and intermediate preparations flow into the steps that use them, making parallel work easier to follow.

The app runs entirely in the browser with vanilla HTML, CSS and JavaScript. Automatic conversion uses Chrome's local model; there is no backend, cloud AI fallback or API key. Demo and Manual JSON modes work without AI.

## Requirements

| Use | Requirements |
| --- | --- |
| Demo, Manual JSON, table export | A modern browser; serve the app on localhost or HTTPS |
| Run locally | Python 3; Node.js/npm only if using `npm start` |
| Run tests | Node.js 22 or newer with npm |
| Automatic recipe conversion | Compatible desktop Chrome, its local model, and the Prompt API/sampling configuration below |

There are no third-party runtime dependencies and no build or dependency-install step.

For local AI, Chrome currently lists Windows 10/11, macOS 13+, Linux or eligible Chromebook Plus devices; 22 GB free storage; and either more than 4 GB VRAM or a CPU with at least 16 GB RAM and four cores. An unmetered connection is needed for the initial model download. Mobile Chrome is not supported for this feature. Check [Chrome's current requirements](https://developer.chrome.com/docs/ai/prompt-api#review_the_hardware_requirements) before relying on those thresholds.

### Chrome settings required

To reproduce the configuration shown in the project's development screenshot, open `chrome://flags` and set:

| Flag | Value |
| --- | --- |
| **Prompt API** (`#prompt-api-for-gemini-nano`) | **Enabled Multilingual** |
| **Speculative Decoding for Built-in AI** (`#on-device-model-speculative-decoding`) | **Enabled** |

Relaunch Chrome, then reload the app. [View the screenshot and troubleshooting guide](docs/troubleshooting.md#chrome-development-settings).

These are development settings, not universal browser requirements. Flag availability varies. The app uses `samplingMode: 'most-predictable'`; Chrome currently documents web sampling controls as an origin-trial feature, so a public deployment needs its own compatibility check. [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api#sampling_parameters)

## Run locally

From the repository directory:

```sh
npm start
```

Open **http://localhost:8000**. The command starts Python's static server. Alternatively, without npm:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Serve the files rather than double-clicking `index.html`; browser modules and AI capabilities need the appropriate web context.

## Use the app

1. Choose **Try demo** to see a prepared Banana Bread table, or paste a recipe into the editor.
2. Choose **Convert to Recipe Grid** for local AI conversion. The first run may download the model. The progress dialog shows each phase; you can cancel at any time.
3. Review the table against the source. Original instructions remain in the text view and on hover when a procedure label is shortened.
4. Use **Inspect / Edit Extracted JSON** for manual corrections, or **Copy HTML**, **Download HTML**, and **Print / Save PDF** to export.

Images can be kept in the editor for reference, but conversion currently uses text only. Pasted remote images become placeholders. The fixed conversion budget is ten minutes after model initialization.

A manually prepared pizza example is available as a [table](examples/sheet-pan-pizza.html) and [JSON](examples/sheet-pan-pizza.json). It illustrates the format; it is not an automatic model-conversion result.

## How it works

1. Extract ingredient phrases from the source and assign IDs in code.
2. Select cooking passages while excluding headings and ingredient-list entries.
3. Preserve distinct ingredient portions, then ask the model to connect one action at a time using constrained, source-supported choices.
4. Validate the completed dependency tree and compute the table's row and column spans deterministically.
5. Select shorter procedure labels where supported. This presentation phase does not change the graph, quantities or original instructions.

The app allows one correction across extraction and linking. A failed conversion leaves its diagnostic dialog open. A label-selection failure retains original wording. See [architecture and validation](docs/architecture.md) for the full contract and lifecycle.

## Project structure

| Location | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Page, responsive layout and print styles |
| `src/app.js`, `editor.js`, `sourceSanitizer.js` | UI state, recipe editor and safe paste handling |
| `src/aiService.js`, `systemPrompt.js`, `conversionDialog.js` | Model requests, progress and diagnostics |
| `src/recipeExtraction.js`, `sourcePassages.js`, `cookingPassages.js` | Source extraction and passage selection |
| `src/ingredient*.js`, `actionConnections.js`, `connectionSemantics.js` | Ingredient evidence, portions and action connections |
| `src/recipeSchema.js`, `validateRecipe.js`, `*Guard.js` | Data contract, graph checks and streamed-output limits |
| `src/layoutRecipe.js`, `tableRenderer.js`, `procedureLabels.js`, `exportRecipe.js` | Grid layout, display labels and export |
| `src/fixtures/`, `examples/` | Demo and reference recipes |
| `tests/` | Automated checks and recorded failure fixtures |
| `docs/` | Architecture, troubleshooting, lessons and roadmap |

## Development and limits

```sh
npm test
```

The current suite has 142 passing checks. It includes simulated model responses, graph/layout regressions, cancellation and display-label checks. Simulated tests are not proof that every Chrome model run will succeed.

English recipe interpretation remains experimental. Source matching prevents some invented wording, but cannot guarantee complete extraction or correct cooking dependencies. Review quantities and steps. The table supports a single-consumer tree, not arbitrary shared graph nodes. A Chrome extension is planned, not implemented.

## Further documentation

- [Architecture and data contract](docs/architecture.md): conversion stages, module boundaries, validation and layout algorithm.
- [Setup and troubleshooting](docs/troubleshooting.md): Chrome screenshot, model readiness, diagnostics and hosting considerations.
- [Lessons learned](docs/lessons-learned.md): preserved failures, fixes, field reports and verification limits.
- [Roadmap](docs/roadmap.md): original acceptance plan and future extension design.
