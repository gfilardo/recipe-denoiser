# Local AI Recipe Tabular Denoiser

## Objective and delivery order

Build a standalone, client-side HTML application first, then reuse its editor, AI adapter, validation, and renderer in a Chrome extension. Convert noisy recipe prose into the left-to-right dependency table in the supplied Banana Nut Bread reference image. Recipe processing stays on-device; no backend or cloud AI fallback.

The standalone MVP is implemented. This document records its architecture and the remaining extension plan.

## Run the MVP

Run `npm start`, then open http://localhost:8000. Python 3 serves the static page; there are no dependencies to install. Run `npm test` with Node.js 22 or newer.

Use **Try demo** for the reference Banana Bread grid, or expand **Inspect / Edit Extracted JSON** to supply your own graph. **Convert to Recipe Grid** requires a compatible Chrome installation with local AI available. The editor accepts rich text and local raster images; inference uses text only. Pasted remote images become placeholders. Export supports Copy HTML, Download HTML, and the browser print dialog.

Validation: 14 automated checks cover reference spans, rectangular grid coverage, malformed graphs, and AI adapter cleanup. The demo was also exercised in the browser. Real model inference remains unverified because the test browser reports the model unavailable. The Chrome extension is a later milestone.

## Architecture decisions

- Use vanilla HTML, CSS, and JavaScript modules. No runtime framework or required third-party dependencies.
- Use a `contenteditable` div for rich recipe input, including pasted text, lists, emphasis, and images. Keep the generated table in a separate, read-only output region.
- Do not use an iframe for the editor. A scoped stylesheet and explicit paste handling provide sufficient layout control without adding focus, selection, sizing, and cross-document complexity. An iframe would not itself sanitize pasted content.
- Treat the rich source document and the extracted recipe graph as separate data models. Images remain visible in the editor; version one sends normalized text to the model. Image recognition and images inside the generated table are outside the initial scope.
- Use the supplied flat `RECIPE_DAG_SCHEMA` verbatim for structured output, without recursive references. Validate both its shape and graph semantics locally.
- Keep the layout engine pure and independent of browser AI, editor DOM, and extension APIs.
- Use a normal full-page extension tab in the second stage. A popup is too constrained for the editor and wide table; a side panel can be evaluated later.

“Standalone” initially means an independently usable web page served from localhost or HTTPS. Do not assume that double-clicking a `file://` HTML file supports modules and the AI API consistently. If a single downloadable HTML file is required, add a packaging step that embeds the same source modules and styles; verify its runtime capabilities separately. Demo/manual mode remains the portability baseline.

## User flow and presentation

1. Show AI capability status and independent Demo / Manual JSON controls.
2. Let the user paste a rich recipe or load the verbose Banana Bread sample. Include an accessible label, multiline editing semantics, and a visible empty-state hint.
3. On **Convert to Recipe Grid**, snapshot normalized source text and begin local model initialization from the click handler.
4. Show model download and conversion state, with cancellation and actionable errors.
5. Validate the returned JSON, compute layout, and display the recipe title above the table.
6. Let the user inspect/edit JSON in a collapsible textarea. Debounce validation and rerender only valid drafts, retaining the last valid result while showing errors.
7. Provide **Copy HTML** and **Print / Save PDF**.

Use a responsive two-pane layout that stacks on narrow screens. Keep the wide table horizontally scrollable without clipping cells. Use cream `#fdfbe2`, a white table, green `#54a857` borders, a 2px outer border, collapsed 1px internal borders, and Trebuchet MS/system sans-serif. Ingredient text is left aligned; prep/actions and setup rows are centered. Match the reference's proportions and natural text wrapping, without promising pixel-identical rendering across fonts and viewport sizes.

## Modules and boundaries

```text
index.html                       page shell; no inline event handlers
styles.css                       application, editor, table, and print styles
src/
  app.js                         UI wiring and state transitions
  editor.js                      rich input, paste/drop, source text extraction
  sourceSanitizer.js             allowlisted DOM reconstruction and image policy
  aiService.js                   availability, session lifecycle, prompt, cancellation
  recipeSchema.js                exact supplied nonrecursive schema
  systemPrompt.js                supplied rules and Banana Bread few-shot example
  validateRecipe.js              shape checks and semantic tree validation
  layoutRecipe.js                pure tree-to-grid descriptor algorithm
  tableRenderer.js               safe DOM construction from descriptors
  exportRecipe.js                copy standalone recipe HTML and print
  fixtures/bananaBread.js        verbose source and exact expected recipe JSON
extension/                       added after standalone acceptance
  manifest.json                  Manifest V3; packaged local assets
  background.js                  toolbar action and optional capture coordination
  captureRecipe.js               optional user-triggered current-page capture
scripts/                         optional web/single-file/extension packaging
tests/                          layout and validation fixtures; browser checks
```

The standalone modules are implemented; extension and packaging directories remain planned. Runtime modules must not import `chrome.*`; extension integration belongs in the extension shell/adapters.

```text
Rich editor → normalized text → AI service → JSON
Manual JSON / demo ──────────────────────────┘
JSON → shape + graph validation → tree → layout descriptors → table DOM
                                                        └→ HTML export / print
```

Application state tracks source revision, AI capability, task state, editable JSON draft, last valid recipe, and last valid layout. Ignore results from canceled or superseded conversions. Editing source marks existing output as stale without deleting it.

## Rich-text and image handling

Intercept HTML paste and rebuild an allowlisted document rather than inserting arbitrary clipboard HTML. Preserve paragraphs, line breaks, lists, basic emphasis, and safe images. Strip scripts, event handlers, forms, embedded frames, active SVG, arbitrary styles, and dangerous URL protocols. Reconstruct nodes without attaching untrusted markup to the live document. AI and JSON output are always inserted as text, never interpreted as HTML.

For clipboard image files and file drops, accept supported raster formats, enforce byte/dimension limits, and display object URLs; revoke them when removed or when the editor is reset. Provide image insertion as an explicit fallback when clipboard image access is unavailable. No persistence is required initially.

Do not automatically load remote image URLs from pasted markup: show a placeholder with alt text and an explicit load control. Loading a remote image makes a network request even though inference is local. Preserve useful text/alt context without sending image bytes to the model. A source snapshot should retain paragraph/list boundaries, remove invisible/editor-only content, and enforce an input size limit with a clear error rather than silently truncating ingredients.

Treat pasted recipe content as data, including any instructions embedded in it. The conversion task and output contract remain defined by the system prompt.

## AI adapter

Follow the supplied `LanguageModel` lifecycle, with feature detection as the source of truth:

- Check `'LanguageModel' in self`; distinguish API absence from an unavailable model.
- Query `LanguageModel.availability()` during capability discovery and handle `unavailable`, `downloadable`, `downloading`, and `available`.
- Invoke `LanguageModel.create()` directly from the conversion click path, before unrelated asynchronous work can consume user activation. Supply `initialPrompts` with the specified system prompt and example, and a download monitor.
- Call `session.prompt(text, { responseConstraint: RECIPE_DAG_SCHEMA, omitResponseConstraintInput: true, ...cancellationOptions })`, using cancellation options supported by the target Chrome version.
- Parse output, validate it, and return structured errors. Destroy an acquired session in `finally`, including failures and cancellation. Use one fresh session per conversion.
- Keep model input text-only for the first release. Because constraint instructions are omitted, the explicit system prompt/example must describe the complete expected JSON shape.
- Do not silently fall back to mock output when real inference fails. Demo is an explicit user choice.

Missing-API help should explain supported Chrome, device/model eligibility, secure context, and applicable setup requirements. Include `chrome://flags/#prompt-api-for-gemini-nano` as a development troubleshooting hint where relevant, not a guarantee that enabling a flag fixes every device. Recheck capabilities at implementation time; API exposure and eligibility vary.

Chrome's official documentation covers availability, user activation, structured output, and session lifecycle: [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Checked while preparing this plan on 2026-10-18. Treat the supplied claims about schema-engine internals as constraints to accommodate, rather than dependencies on a particular internal implementation.

## Data contract and semantic validation

Preserve the exact supplied schema: `{ title, setup, ingredients: [{ id, text, prep }], steps: [{ id, action, input_ids }] }`, with required fields and no additional properties. Keep the supplied system prompt and exact Banana Bread example as versioned fixtures; do not change the external schema to encode layout coordinates.

A flat DAG is the interchange format, but the initial table renderer requires a rooted dependency tree. A general DAG with shared nodes cannot satisfy “each ingredient occupies exactly one row” through naive recursive traversal. Reject unsupported graphs with an explanation rather than duplicating ingredients or silently losing dependencies.

Validate before layout:

- Exact field types, required keys, and no unexpected keys; nonempty ingredient and step collections.
- Unique, nonempty IDs across both collections; all input references exist.
- Nonempty actions and ingredient text; each step has at least one input; no repeated input within a step.
- No cycles or self references; detect cycles before recursive layout.
- Exactly one terminal step; it must be the final item in `steps`, as the prompt requires.
- Every ingredient and step is reachable from that root. Every non-root node has exactly one consumer; reject shared subrecipes and split quantities until a future explicit representation supports them.
- Render ingredient leaves in depth-first `input_ids` order. Require that this matches the supplied ingredient array order; explain mismatches for manual correction rather than quietly changing the recipe order.
- Apply documented node, depth, and text-size limits to prevent pathological layout or stack exhaustion.

Forward references can be resolved from the full map; array order alone is not proof of acyclicity. Schema-valid output is not necessarily semantically valid. Surface validation paths/IDs, preserve the JSON draft, and allow correction; do not fabricate missing quantities or cooking steps.

## Deterministic layout algorithm

Use zero-based columns internally; ingredient text is column 0 and prep is column 1. Validation guarantees each subtree has a contiguous interval of unique ingredient rows.

1. Build an ID map and root. Traverse children in `input_ids` order; compute each node's `firstRowIndex` and `leafCount`.
2. Each ingredient text descriptor occupies one cell at column 0, with `rowSpan = 1` and `colSpan = 1`.
3. Bottom-up, assign each step's `startCol`:
   - If it has multiple children, all raw ingredients, and every prep is empty, set `startCol = 1`; omit their prep cells.
   - Otherwise, a raw ingredient requires next column 2, including an unprepped ingredient joining a later mixture. A child step requires `child.startCol + 1`. Take the maximum of those requirements.
   - A unary step on an unprepped raw ingredient therefore starts at column 2 under this contract, with an empty prep cell at column 1.
4. Set `totalCols = root.startCol + 1`. The root occupies one column.
5. Top-down, each non-root step spans from its own start column to its parent's start column, exclusive: `colSpan = parent.startCol - child.startCol`.
6. For ingredients whose prep is not omitted, emit a prep/spacer descriptor at column 1, with `rowSpan = 1` and `colSpan = parent.startCol - 1`. Never stretch the ingredient text cell.
7. Emit each step only in its first leaf row, with `rowSpan = leafCount`. Bucket descriptors by first row and sort by column.
8. Prepend setup rows, each spanning `totalCols`, and render title immediately above the table. Construct all content through DOM text nodes.
9. Verify grid occupancy in tests: every ingredient-row coordinate is covered exactly once; all spans are positive and within bounds.

The computed tree and grid are derived data; JSON editing never edits spans directly. Keep node IDs and ancestor relationships in descriptors for optional hover/focus highlighting.

### Required Banana Bread acceptance fixture

| Item | First ingredient row | Start column | Rowspan | Colspan |
| --- | ---: | ---: | ---: | ---: |
| Wet mixture: mash until smooth | 0 | 2 | 4 | 1 |
| Dry mixture: whisk | 4 | 1 | 5 | 2 |
| Walnuts: empty prep/spacer | 9 | 1 | 1 | 2 |
| Fold | 0 | 3 | 10 | 1 |
| Bake | 0 | 4 | 10 | 1 |
| Cool in pan | 0 | 5 | 10 | 1 |
| Cool on rack | 0 | 6 | 10 | 1 |

There are 7 columns, 10 ingredient rows, and 2 setup rows with colspan 7. The four wet ingredients each have a column-1 prep cell, including blank vanilla prep. The five dry ingredients have no separate prep cells. The title is outside the table.

## Export and accessibility

Copy a self-contained HTML recipe fragment with title, actual table spans, and embedded/scoped styling, using rich `text/html` clipboard data where supported plus a plain-text alternative. Provide an explicit error/fallback if clipboard permissions fail. Exclude editor chrome and source images from this recipe export.

Print CSS hides controls/editor and prints the title and table with borders and readable wrapping; test wide recipes in landscape and avoid clipped output. Save PDF uses the browser print dialog.

Use native buttons, labeled editor/JSON controls, visible focus, and a polite live status region. Preserve valid table structure and offer a plain-text ingredient/step view for readers for whom merged cells are hard to navigate. Bonus dependency highlighting must work on keyboard focus as well as hover.

## Chrome extension stage

Package the same modules as a Manifest V3 extension with local scripts/styles and no remote code or inline handlers. The toolbar action opens/focuses the extension's full-page editor. Keep `LanguageModel` calls in that visible extension document, preserving the user gesture; do not put inference in a content script or service worker.

Start with paste-based input and no site permissions. Then add optional **Import from current tab** using user-triggered `activeTab` and `scripting`, with permission requests limited to the actual capture feature. Prefer selected content, otherwise extract a bounded recipe/article candidate; preview it in the editor before conversion. Treat captured HTML as untrusted and run the same sanitizer. Current-page import is an added extension capability, not required for the standalone milestone.

Persist optional drafts/settings through a storage adapter only if needed; do not make core modules depend on extension storage. Verify current Prompt API behavior and minimum supported Chrome version before setting manifest constraints. Reuse all layout fixtures and test extension CSP, capture messages, and inference in the visible extension page.

## Implementation plan and completion gates

### 1. Standalone shell and rich source editor

Create the module structure, responsive panes, cream/green visual system, sanitized rich paste/image input, sample loader, and capability-independent controls. Gate: sample text and images can be edited without executing pasted markup; keyboard interaction and narrow layouts work.

### 2. Contract, validation, and layout engine

Add the exact schema, prompt/example fixtures, graph validation, pure descriptors, and safe table DOM renderer. Gate: Demo renders the reference's exact spans; occupancy tests pass for mixed prep, empty prep groups, unary chains, nested combinations, and late ingredients. Negative fixtures cover duplicate IDs, missing references, cycles, multiple roots, unreachable nodes, shared dependencies, and inconsistent order.

### 3. Manual JSON, export, and print

Add the debounced JSON drawer, field-specific errors, last-valid rendering, copy HTML, and print styling. Gate: invalid drafts do not replace output; exported HTML reproduces the table; print preview remains readable without application controls.

### 4. Real Chrome local AI

Add feature detection, capability status, monitored user-triggered creation, structured prompting, cancellation, cleanup, and stale-result protection. Gate: real inference succeeds on an eligible Chrome/device; missing/unavailable/downloading/downloadable states and failures are exercised through adapter fakes. If eligible hardware is unavailable, report real inference as unverified while delivering working demo/manual modes.

### 5. Standalone acceptance and polish

Compare the sample visually with the supplied image, check accessibility, paste safety, clipboard failure, input limits, and long recipes. Add dependency highlighting if the core flow is complete. Gate: document how to serve the page, browser requirements, limitations, and test commands. Decide whether a bundled single-file distribution is needed and verify it separately.

### 6. Extension packaging and optional capture

Add the MV3 shell, load-unpacked instructions, and shared app packaging. Gate: paste/demo/manual/AI/export work in the extension page without duplicated business logic. Add current-tab capture as a separately tested enhancement with bounded input and explicit user action.

## Initial scope boundaries

No cloud inference, backend, automatic URL fetching, arbitrary DAG splitting/reuse, OCR/image understanding, or full word-processor behavior. Rich source images are preserved for the user's reference. The schema carries recipe text and dependencies only. These choices keep the first standalone release small while preserving a direct path to the extension.
