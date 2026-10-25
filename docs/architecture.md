# Model-led architecture

[README](../README.md) · [Pipeline diagram](pipeline.md) · [Global review explained](global-graph-review.md) · [Evaluation](../evaluation/README.md) · [Lessons](lessons-learned.md) · [Previous architecture](rule-based-architecture.md)

## Responsibility boundary

The local model interprets language. Application code owns schemas, IDs, source-excerpt checks, input availability, graph integrity, resource limits and rendering. There are no cooking-verb dictionaries, ingredient aliases, section parsers, role heuristics, pronoun rules, predetermined shortening candidates or recipe-specific fallbacks in the runtime.

The working rule-based baseline is preserved in tag **`working-rules-v11`**, commit `ad1d60d`. The current pipeline identifier is **`model-led-v13-direct-graph`**. It is a new experimental interpretation path, not a claim of improved accuracy.

## Stages

1. **Ingredient uses.** The model reads the full source and returns a title and entries with verbatim `text` and inferred `role`; text is reused as source evidence. It interprets separate portions, quantities, sections and method-only ingredients. Code requires a nonempty ingredient text and a supporting excerpt that occurs in the source, then assigns IDs. Roles and source excerpts are retained as interpretation metadata for linking and diagnostics.
2. **Cooking operations.** The model returns global equipment/environment setup and ordered food actions with supporting excerpts. Every food preparation is an action, including work on a single ingredient; the runtime planning schema has no ingredient-preparation field. This prevents a multi-input operation from being hidden in an unchecked one-ingredient cell. The model still decides operation boundaries and setup classification. Existing Manual JSON/demo preparation fields remain supported.
3. **Model review.** A fresh session compares the draft with the complete source and returns the same setup/action format. Code checks shape, source excerpts and numeric consistency. Both draft and review remain in diagnostics; the same model can repeat omissions or introduce errors.
4. **Direct global interpretation.** A fresh session receives the original source, fixed ingredients/roles and actions/excerpts. No per-action drafts are generated. The model assigns each ingredient and nonfinal result a next consuming action. Code regroups the destinations, checks references, lists empty operations and validates the full graph. One separate graph correction remains available even after extraction correction. Completed invalid output and validation feedback accompany the correction; no edges are automatically changed.
5. **Concise labels.** The model freely generates shorter labels in batches of four. Only nonempty shorter labels with the same numeric tokens (including their multiplicity) as the original are accepted. An invalid batch retains full wording. IDs, edges and full instructions remain unchanged.

**Numeric consistency is mechanical.** Generated ingredient, setup, preparation and action text may not introduce numeric tokens absent from its cited excerpt or repeat them more often. Labels must preserve every numeric token in the full instruction. These checks use Unicode number characters, not English words, cooking dictionaries or unit conversions. Unsupported numeric rewrites fail visibly and may use the single correction. Extraction can still omit a number, and a valid number can still refer to the wrong unit or operation; this is not semantic verification.

**Source citations are traceability, not factual validation.** A valid excerpt does not prove that an ingredient amount, action paraphrase, inferred role or summary faithfully represents it. Code deliberately does not claim to resolve cooking meaning. The user must review quantities, omissions, dependencies and summary fidelity. Full model instructions are available in JSON/text view and on hover; original recipe wording remains in the source editor and diagnostic excerpts.

## Request lifecycle and limits

For K label batches, normal conversion uses 4 + K requests: ingredients, operations, plan review, global graph, then labels. At most two corrections can occur: one shared by extraction/plan review and one reserved for the graph. Each request has fresh chat history. Chrome uses most-predictable sampling; WebLLM uses temperature zero. The graph correction receives validation feedback and a completed previous response when available. It cannot alter the fixed plan. See [pipeline](pipeline.md) and [engine comparison](backend-comparison.md).

The internal `reviewGraph: false` option retains the previous sequential path for focused adapter tests. The app and browser evaluation use global review by default. Mocked tests exercise the new default separately; passing tests do not demonstrate local-model accuracy.

The UI shares 10 minutes for Chrome or 30 minutes for WebLLM across inference, subsequent initialization, correction and labels. Initial startup has a separate two-minute limit. Cancellation, late-session cleanup, streaming diagnostics and browser errors remain handled by the adapter. All output has a 40,000-character application limit and a formatting-whitespace guard; selected-ID linking lists and global graph output also have ID-derived streaming limits. These bounds do not infer language meaning.

Invalid optional labeling or a labeling transport error retains full wording for the remaining batches without spending the graph correction. Shared-deadline expiry and user cancellation still stop conversion. Diagnostics include raw outputs, accepted model interpretation and linking/label context; nothing is silently replaced with a known-good answer. Graph attempts and correction feedback are retained for comparison.

## Stable graph contract

The editor/export recipe contract is unchanged:

```text
{ title, setup,
  ingredients: [{ id, text, prep }],
  steps: [{ id, action, input_ids }] }
```

Only code assigns IDs. Validation requires unique IDs, existing references, nonempty inputs, no repeated consumption, no cycles, one final root and complete reachability. Extraction/linking uses earlier references only. Assembly orders ingredient leaves by dependency traversal without changing quantities. The renderer still requires a single-consumer tree, not a general shared-node DAG. This representation limitation remains explicit; model-led interpretation does not remove it.

## Layout and presentation

`layoutRecipe.js` is unchanged. It computes leaf-row intervals and column positions, compacts groups of raw unprepared ingredients, and assigns deterministic row/column spans. Manual and demo recipes use the same validator and renderer. Tests check exact Banana Bread spans and rectangular occupancy.

`tableRenderer.js` changes only visible action-cell text when a generated label is available, retaining the full instruction in a hover title and accessible label. The text view and JSON keep full model instructions. HTML export preserves displayed labels. Manual JSON edits reset presentation labels. Source images are reference material only; inference remains text-only.

## Modules

| Module | Responsibility |
| --- | --- |
| `app.js`, `editor.js`, `sourceSanitizer.js` | UI, source input and paste safety |
| `aiService.js`, `systemPrompt.js` | Stage orchestration and language tasks |
| `numericFidelity.js` | Language-independent numeric token checks |
| `recipeExtraction.js` | Extraction schemas, excerpt checks, IDs and assembly |
| `actionConnections.js` | Live inputs, model decisions and reference checks |
| `procedureLabels.js` | Label request batches and shape/length/numeric checks |
| `connectionGuard.js`, `outputGuard.js` | Streaming structure and resource limits |
| `conversionDialog.js` | Measurements and inspectable interpretation snapshots |
| `recipeSchema.js`, `validateRecipe.js` | Final graph contract and integrity |
| `layoutRecipe.js`, `tableRenderer.js`, `exportRecipe.js` | Deterministic table and export |
| `evaluation/` | Real-browser runner, review cases and historical traces |

Paths in this table are relative to `src/` except `evaluation/`.

## Verification

Automated tests validate orchestration and mechanical guarantees using explicit mocked responses. They do not substitute schema-permitted answers for failed model output or score semantic understanding. Historical tests enforcing individual cooking rules were removed along with those modules. The [real-model evaluation guide](../evaluation/README.md) separates structural success from manually reviewed semantic accuracy and preserves raw results. No successful real Chrome run of `model-led-v13-direct-graph` has yet been recorded here.
