# Recipe Denoiser

> **Experimental browser support:** This project currently uses experimental AI APIs. Chrome built-in AI works only on supported Chrome/OS combinations. The alternative WebLLM engine requires WebGPU and enough GPU memory. Both paths are experimental; review every result.

Turn recipe prose into a left-to-right cooking dependency table. Ingredients and intermediate preparations flow into the steps that use them, making parallel work easier to follow.

The app runs entirely in the browser with vanilla HTML, CSS and JavaScript. Automatic conversion uses either Chrome built-in AI or WebLLM with Qwen2.5 7B; there is no inference server, cloud AI fallback or API key. Demo and Manual JSON modes work without AI.

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

1. Paste your own recipe, or expand **Or try a sample** and choose **Banana Nut Bread**, **Halloween Muffins**, **Autumn Cake** or **Sheet-pan pizza made with a spoon** from the sample dropdown. **Load sample** loads its source for AI conversion; **View prepared demo** shows a hand-authored example grid. You can also paste your own recipe.
2. Choose **Convert to Recipe Grid** for local AI conversion. The first run may download the model. The progress dialog shows each phase; you can cancel at any time.
3. Review the table against the source. Original instructions remain in the text view and on hover when a procedure label is shortened.
4. Use **Inspect / Edit Extracted JSON** for manual corrections, or **Copy HTML**, **Download HTML**, and **Print / Save PDF** to export.

Images can be kept in the editor for reference, but conversion currently uses text only. Pasted remote images become placeholders. The shared conversion budget after model initialization is 10 minutes for Chrome and 30 minutes for WebLLM.

A manually prepared pizza example is available as a [table](examples/sheet-pan-pizza.html) and [JSON](examples/sheet-pan-pizza.json). It illustrates the format; it is not an automatic model-conversion result.

## How it works

The local language model does the interpretation, rather than an English cooking-rule engine:

1. Extract ingredient uses and their quantities/roles, citing source excerpts.
2. Separate global setup from food operations; every preparation becomes an action with explicit inputs.
3. Review the draft against the full source for misclassified multi-ingredient operations and missing instructions.
4. Ask the model to independently assign every ingredient and intermediate result to its next consuming action, using the full source.
5. Generate concise procedure labels using the surrounding input context.

Code supplies IDs, checks source excerpts, numeric consistency and graph structure, computes table spans and enforces resource limits. It does not infer ingredient synonyms, choose portions or rewrite model wording with cooking-specific rules. Short labels are separate from the full instructions and cannot change the graph.

The app allows one response-validation correction across extraction/plan review and one separate graph correction. Failures stay visible; it never silently supplies an expected recipe. Model interpretation and summaries require review—valid JSON and a connected tree do not establish cooking accuracy. See the [pipeline diagram](docs/pipeline.md), [architecture](docs/architecture.md) and [real-model evaluation](evaluation/README.md).

## Project structure

| Location | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Page, responsive layout and print styles |
| `src/app.js`, `editor.js`, `sourceSanitizer.js` | UI state, recipe editor and safe paste handling |
| `src/aiService.js`, `systemPrompt.js`, `conversionDialog.js` | Model requests, progress and diagnostics |
| `src/recipeExtraction.js` | Extraction schemas, source citations, IDs and graph assembly |
| `src/actionConnections.js` | Live input bookkeeping and model dependency decisions |
| `src/recipeSchema.js`, `validateRecipe.js`, `*Guard.js` | Data contract, graph checks and streamed-output limits |
| `src/layoutRecipe.js`, `tableRenderer.js`, `procedureLabels.js`, `exportRecipe.js` | Grid layout, display labels and export |
| `src/fixtures/`, `examples/` | Demo and reference recipes |
| `tests/` | Mechanical contract, lifecycle and layout checks |
| `evaluation/` | Real-model review cases, runner and archived traces |
| `docs/` | Architecture, troubleshooting, lessons and roadmap |

## Development and limits

```sh
npm test
```

Tests cover model request contracts, graph/layout invariants, cancellation and cleanup. They do not prove model accuracy. Run the [real-browser evaluation](evaluation/README.md) to assess ingredient coverage, portion allocation, dependency quality, summary fidelity and latency on your Chrome/device combination.

The current pipeline is **`model-led-v14-extraction-comparison`**. The earlier working rule-based implementation is preserved as tag **`working-rules-v11`** (`ad1d60d`). The new model-led path needs fresh real-device evaluation. Review quantities and steps: a model can omit information or produce a structurally valid but incorrect interpretation. The table supports a single-consumer tree, not arbitrary shared graph nodes. A Chrome extension is planned, not implemented.

## Further documentation

- [Provisional drafts and global graph review](docs/global-graph-review.md): a sequence diagram explaining revisable connections, early handoff and material destinations.

- [Architecture and data contract](docs/architecture.md): conversion stages, module boundaries, validation and layout algorithm.
- [Setup and troubleshooting](docs/troubleshooting.md): Chrome screenshot, model readiness, diagnostics and hosting considerations.
- [Lessons learned](docs/lessons-learned.md): preserved failures, fixes, field reports and verification limits.
- [Roadmap](docs/roadmap.md): original acceptance plan and future extension design.

- [Real-model evaluation](evaluation/README.md): run the model on review cases without simulated answers.


## Experimental engine comparison

Select **Chrome built-in AI** or **WebLLM · Qwen2.5 7B** in the page. Both run the same pipeline locally. WebLLM requires WebGPU, substantial GPU memory and a multi-GB first download; it does not require the Chrome Prompt API flags. Runtime/model downloads use external hosts, but recipe inference stays on your device. No backend silently falls back to the other.

See [comparison protocol and limitations](docs/backend-comparison.md) for settings, the Mermaid diagram and how to evaluate correctness. This project is an experiment in browser-local AI, not a validated cooking tool.

The Halloween Muffins sample preserves the supplied concatenated ingredient list, method, storage and tips for realistic extraction tests. Demo graphs are display fixtures only: they are never used as model answers or automatic fallbacks.

The Autumn Cake demo keeps batter and garnish pistachios separate and retains the source’s differing juice quantities. Its source uses one ingredient per line.


The sheet-pan pizza sample retains the supplied source formatting, storage and tips. Its prepared grid reuses the hand-authored pizza example and keeps dough, pan and topping oil separate, with the two topping uses sharing the stated total.

To compare extraction behavior, expand **Extraction experiment** and toggle **Enforce JSON format during extraction**. It is on by default. Turning it off still requests and validates JSON but removes native format constraints during extraction and plan review. Keep the source and engine unchanged between runs; see the [experiment protocol](docs/backend-comparison.md#v14-extraction-constraints-experiment).


## GitHub Pages deployment

The [Pages workflow](.github/workflows/pages.yml) runs tests, packages the site and deploys an artifact on each push to `master` (or a manual workflow run). Set repository **Settings → Pages → Source → GitHub Actions**. There is no generated-site branch and no compiled output to commit.

`npm run build` copies browser-ready source into ignored `_site/`. It includes application assets, prepared examples and the browser evaluation runner/cases; it excludes tests, documentation and archived diagnostic traces. Local preview: `python3 -m http.server 8000 --directory _site --bind 127.0.0.1`. Relative URLs support the repository subpath, including the WebLLM worker. External model/runtime downloads remain external.

Commit source and workflow changes only. The Actions deployment result supplies the live URL; a passing local build alone does not confirm publication. See [GitHub's artifact deployment documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
