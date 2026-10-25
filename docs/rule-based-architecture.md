# Archived rule-based architecture

This is the architecture of tag `working-rules-v11`, before the model-led refactor. It is retained for provenance, not as current implementation guidance. See [current architecture](architecture.md).

# Architecture and data contract

[Back to README](../README.md) · [Troubleshooting](troubleshooting.md) · [Lessons learned](lessons-learned.md)

Detailed pipeline, module responsibilities, validation rules and layout design. Paths in code examples are relative to the repository root. Extension and packaging directories in the design remain planned, not implemented.

## Current conversion pipeline (`staged-v11-procedure-labels`)

Conversion now separates extraction from dependency bookkeeping:

1. **Extract ingredients.** The model returns a source title (or empty) and an array of verbatim ingredient phrases, without IDs. The app checks each phrase against the source and assigns `ing_1`, `ing_2`, etc. A missing title becomes “Recipe.”
2. **Select cooking passages.** Code splits the source into numbered, nonoverlapping passages. Before asking the model to select actions, it excludes known section headings, the extracted title, exact ingredient entries, and an ingredient-list block explicitly bounded by INGREDIENTS and a preparation heading. The remaining passages keep their original IDs and source slices. A new session returns only `passage_ids` from that eligible list. The app rejects unknown/duplicate selections, restores source order, copies the original passage text, and assigns `step_1`, `step_2`, etc. The model cannot rewrite action wording or numbers. Preparation stays among the selected actions; ingredient `prep` fields remain empty. Generated `setup` can contain shared-quantity explanatory notes. Manual/demo setup behavior is unchanged.
3. **Preserve ingredient roles and prepare separate uses in code.** Align the accepted ingredient phrases with the source list to retain explicit section labels, including concatenated “For the topping” and “For the pan” headings. When two uses are explicitly supported by “half” / “about half” followed by “a little more,” “some more,” “remaining,” or “rest of,” create two separately identified use entries tied to the original total and their action IDs. Ambiguous section alignment or allocation is not guessed. This is local preprocessing, with no extra model request.
4. **Connect one action at a time using source evidence.** Each action gets an isolated, fresh session. Its request contains the current action, its position and total action count, neighboring action text, and eligible inputs: unused ingredients and unconsumed earlier action results. The model returns an object with exactly one fixed field per eligible input, rather than generating an ID list. An empty string means “not selected” when that choice is allowed. A bounded English instruction recognizer requires unambiguous explicit ingredient uses at their operation, removes descriptive/negated mentions from fresh-input choices, and constrains supported independent preparations and result joins. Required fields omit the empty-string choice; excluded results allow only that choice. Selecting a raw ingredient requires one of the exact current-action evidence phrases provided by code; an ingredient without a supported mention can only be left unselected. Earlier results use the value `use` or an empty string, restricted by the same per-action rules. Named results retain source-mentioned referents through their dependencies. Result candidates include their exact action text and the ingredient texts contained in that result. Each request omits the full source and full action inventory. Code validates the decisions and derives `input_ids`, removes consumed inputs, and makes the new result available for later actions. The last action must consume all remaining inputs or validation fails; the app does not add missing edges. Final tree validation and ingredient ordering by dependency traversal still run before rendering. IDs, original ingredient quantities, source section labels, assigned use actions, and action text remain fixed after preprocessing.

After graph validation, **shorten procedure labels** in separate batches of at most eight eligible actions. This changes only display text; the model chooses `keep` or `compact` from bounded candidates. Original instructions and all graph fields stay unchanged. Label failures retain original wording without a correction.

For **N** selected actions, graph construction uses **2 + N requests**: ingredient extraction, passage selection, and N linking decisions. **Only one correction is allowed across the entire conversion**, for at most **3 + N graph requests**, not one correction per action or stage. A correction runs in a fresh session using the same stage/action input plus the validation reason; malformed generated text is not replayed. Accepted earlier stages and action connections are never regenerated. Transport failures, whitespace loops, output-limit errors, cancellation, and timeouts do not cause retries.

The presentation phase adds **ceil(K / 8)** requests for K eligible shortening candidates (zero when K is zero); failures can end it early.

The fixed 10-minute conversion limit is shared by all stages, action requests, and the optional correction, starting when the first session is ready; it also covers later session creation. Initial model startup has its own timeout. Cancel and cleanup work throughout. The 512-character formatting-whitespace guard remains active. A separate connection guard validates fixed fields and their values while streaming: unknown or repeated fields and unsupported values stop the request; missing fields fail validation before acceptance. It also bounds malformed or oversized output. Only unused ingredients and unconsumed earlier results receive fields, excluding self, future, and already consumed references. The browser-facing linking schema uses objects, strings, enums, required fields, and no additional properties; no array-size or uniqueness keywords are needed.

The modal shows which action is being connected, stage-specific measurements, and the shared correction use. It stays open on failure and closes only after a valid grid renders. Raw snapshots identify the action and correction, and retain the action, eligible candidates, and evidence choices alongside the received response so a linking decision can be inspected. Snapshots also show the source section, any assigned use with its original shared total, and the reason for a required or excluded connection. Diagnostic reports identify `staged-v11-procedure-labels` and report each request's prompt, instruction, and schema character counts; source and candidate text remain confined to the opt-in output snapshots.

### What source grounding guarantees—and what it does not

Accepted ingredient/title phrases must occur in the input, allowing only whitespace differences. Actions are copied directly from code-generated source passages and are never accepted as model-written text. The app does not convert units, repair numbers, or paraphrase instructions. This rejects generated substitutions such as `550 g` → `55550 g` and fabricated temperatures. It also rejects partial numeric matches such as extracting `50 g flour` from `550 g flour`.

For linking, code computes allowed evidence phrases by matching ingredient names against the current action conservatively. It accounts for case, accents, simple plurals, joined names such as “fiordilatte,” and a narrow grease-to-fat preparation alias. Returned evidence is still an exact phrase from the action. Two raw ingredients cannot use the same evidence phrase in one action: a single mention of “oil” is not authority to consume several listed oil portions. These checks do not invent quantities or modify the source text. Source sections distinguish same-name entries. A unique ingredient mention can establish the current section; otherwise an explicit section name or a continuation of a single-section prior mixture can provide context. This restricts conflicting same-name choices, not unrelated ingredients with unique mentions. Supported divided-ingredient entries are only eligible at their assigned action.

This is a text-fidelity check, **not a completeness or cooking-accuracy proof**. A model can still omit an ingredient, choose the wrong source phrase, select an optional variation, or connect valid entries incorrectly. A correctly copied phrase can itself be wrong in the source. Review the final grid against the recipe. Recipes outside the supported two-use English wording still need manually stated separate portions. Shared graph nodes remain unsupported. The original quantity is displayed as one shared total, not duplicated full allocations; no exact gram split is invented. This wording is not a general quantity-accounting data model.

The [development history](lessons-learned.md) records earlier designs and measured failures. References there to whole-recipe generation, a full-recipe repair, or old prompt lengths are historical and superseded by this pipeline.

## Architecture decisions

- Use vanilla HTML, CSS, and JavaScript modules. No runtime framework or required third-party dependencies.
- Use a `contenteditable` div for rich recipe input, including pasted text, lists, emphasis, and images. Keep the generated table in a separate, read-only output region.
- Do not use an iframe for the editor. A scoped stylesheet and explicit paste handling provide sufficient layout control without adding focus, selection, sizing, and cross-document complexity. An iframe would not itself sanitize pasted content.
- Treat the rich source document and the extracted recipe graph as separate data models. Images remain visible in the editor; version one sends normalized text to the model. Image recognition and images inside the generated table are outside the initial scope.
- Keep the supplied flat `RECIPE_DAG_SCHEMA` as the final editor/export contract. Use smaller schemas for separate ingredient, action, and connection requests; build and validate the final graph in application code.
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
  aiService.js                   stages and per-action linking, sessions, streaming, correction budget
  recipeExtraction.js            stage schemas, source grounding, fixed IDs, graph assembly
  actionConnections.js           eligible candidates, fixed decisions, per-action acceptance
  connectionSemantics.js         bounded operation, preparation and result-use rules
  cookingPassages.js             exclude headings and ingredient-list passages
  ingredientSections.js          source ingredient section alignment
  ingredientUses.js              source roles and explicit divided portions
  procedureLabels.js             bounded display-only shortening candidates
  ingredientEvidence.js          conservative ingredient-name matches in action text
  sourcePassages.js               numbered exact source slices for action selection
  conversionDialog.js            stage history, timing, on-demand raw output snapshots
  outputGuard.js                 early stop for runaway formatting whitespace
  connectionGuard.js             fixed-field decision validation and bounded linking output
  recipeSchema.js                exact supplied nonrecursive schema
  systemPrompt.js                ingredient/action/connection/label instructions
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
- Query `LanguageModel.availability(SAMPLING_OPTIONS)` during capability discovery and handle `unavailable`, `downloadable`, `downloading`, and `available`.
- Invoke `LanguageModel.create()` directly from the conversion click path, before unrelated asynchronous work can consume user activation. Supply the current stage's system instructions and a download monitor.
- Share `SAMPLING_OPTIONS = { samplingMode: 'most-predictable' }` between availability checks and session creation (`LanguageModel.create({ ...SAMPLING_OPTIONS, ... })`). This explicitly selects deterministic sampling compatible with MTP speculative decoding instead of relying on Chrome's defaults. The implementation lives in `src/aiService.js`.
- Prefer `session.promptStreaming()` with the current stage schema and `omitResponseConstraintInput: false`; fall back to `prompt()` only when streaming is unavailable.
- Parse output, validate it, and return structured errors. Destroy an acquired session in `finally`, including failures and cancellation. Use a fresh session for each extraction stage, each action-linking request, each label batch, and each correction; destroy it before proceeding.
- Keep model input text-only for the first release. Allow Chrome to include schema guidance (`omitResponseConstraintInput: false`); each stage has focused instructions and a small output schema.
- Do not silently fall back to mock output when real inference fails. Demo is an explicit user choice.

Missing-API help should explain supported Chrome, device/model eligibility, secure context, and applicable setup requirements. Include `chrome://flags/#prompt-api-for-gemini-nano` as a development troubleshooting hint where relevant, not a guarantee that enabling a flag fixes every device. Recheck capabilities at implementation time; API exposure and eligibility vary.

Chrome's official documentation covers availability, user activation, structured output, and session lifecycle: [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Checked while preparing this plan on 2026-10-18. Treat the supplied claims about schema-engine internals as constraints to accommodate, rather than dependencies on a particular internal implementation.

## Data contract and semantic validation

Preserve the exact supplied schema: `{ title, setup, ingredients: [{ id, text, prep }], steps: [{ id, action, input_ids }] }`, with required fields and no additional properties. Keep the exact Banana Bread example as the demo/layout fixture; do not change the external schema to encode layout coordinates.

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
