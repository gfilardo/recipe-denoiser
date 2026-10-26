# Lessons learned and development history

[Back to README](../README.md) · [Current architecture](architecture.md) · [Troubleshooting](troubleshooting.md)

This is the preserved chronological investigation log. Old pipeline versions, request counts, prompts, timeout selectors and test totals describe the revision being investigated; they are not current setup instructions. The current implementation uses `model-led-v3-plan-review` and a fixed 10-minute UI conversion limit. The prior rule-based implementation is archived in tag `working-rules-v11`. Detailed failures and limitations are retained so future changes can be checked against actual observations.

## Recent findings

- [Ingredient portions and pistachio preparation](#autumn-cake-duplicate-pistachio-portions-at-blanching-staged-v10-preparation-roles)
- [Consolidated lessons from user testing](#latest-lessons-from-user-testing-2026-10-20)
- [Display-only procedure shortening](#shorter-procedure-cells-without-changing-the-graph-staged-v11-procedure-labels)
- [Fixed conversion limit](#fixed-conversion-limit)

## Earlier investigations

### Local model startup troubleshooting

If startup waits on Chrome, the app displays elapsed time and download progress beside Convert. It cancels initialization after two minutes without download progress and inference after the selected conversion time limit (10 minutes by default). Keep the page visible during startup. To inspect Chrome model readiness, open `chrome://on-device-internals` in Chrome. A timeout identifies a stalled API call, not its underlying cause; device eligibility, model downloads, and browser runtime issues need to be checked there. Cancel and retry after the model is ready, or use Demo / Manual JSON.


### Incompatible sampling options (MTP)

If Chrome reports `The sampling options are incompatible with speculative decoding (MTP)`, the session is being requested with sampling settings the active model cannot use. The error names `samplingMode: 'most-predictable'`, `topK: 1`, or `temperature: 0` as compatible options.

The fix in `src/aiService.js` sets `samplingMode: 'most-predictable'` through a shared `SAMPLING_OPTIONS` constant passed to both `availability()` and `create()`. Reload the app after updating and retry **Convert to Recipe Grid**.

Chrome's [Prompt API sampling documentation](https://developer.chrome.com/docs/ai/prompt-api#sampling_parameters) describes `samplingMode` for the web sampling-parameters origin trial and the legacy numeric options for extensions. If the error persists after reloading, check that the browser exposes the web sampling option; support depends on the Chrome configuration.

Validation for this fix: all 17 existing automated tests passed, and `git diff --check` reported no whitespace errors. These checks do not verify real Chrome inference; conversion with an eligible local model still needs browser verification.


### Invalid model-generated recipe graphs

A reported pizza conversion failed with `Duplicate or empty ID: step10`. Its output also reused other IDs, mixed `step10` and `step_10`, referenced nonexistent nodes (including `setup`), omitted ingredient connections, and corrupted cooking temperatures. Renaming the first duplicate alone cannot repair these ambiguous dependencies.

Structured JSON output can still contain duplicate IDs, missing references, unused ingredients, or disconnected steps. The AI adapter now runs `validateRecipe()` before returning a conversion. If parsing or graph validation fails, it sends the validation error back to the same local session and requests one complete corrected recipe. The repair shares the original inference timeout and cancellation signal. If the second response is invalid, conversion fails with the validation reason; invalid output is never rendered as a grid.

The system prompt explicitly requires unique, consistent IDs, references to ingredients or earlier steps, and newly added ingredients in each step's inputs. It also instructs the model to preserve source quantities, temperatures, units, and times. Graph validation cannot establish factual accuracy: review generated cooking values against the original recipe. The app does not guess repairs to ambiguous references or cooking temperatures.

Implementation: `src/aiService.js` parses and validates each response using `src/validateRecipe.js`; `src/systemPrompt.js` supplies the stronger ID, dependency, and source-fidelity rules. During the single repair attempt, the UI reports that it is asking the local model to correct invalid output. API failures and cancellation are not treated as graph errors to retry.

After updating, reload the app and convert the original recipe again. If correction still fails, try a shorter source or use Manual JSON to correct the full graph. Check generated quantities and temperatures against the original source even when graph validation passes.

Verification: `npm test` passed all 20 tests, including duplicate-ID correction, persistent missing-reference rejection after exactly one repair, and cancellation during repair with session cleanup. `git diff --check` passed. These tests use a simulated model API; successful correction by the real Chrome model remains unverified.


### Conversion and repair timeouts

The **Time allowed for conversion** selector offers 3, 10, or 20 minutes, defaulting to 10 minutes. Initial conversion and the optional single repair share this deadline; starting the repair does not reset it. The selection is fixed during a running conversion. The adapter retains a three-minute default for callers that do not supply a limit. A timeout identifies the active stage and selected limit. For a three-minute selection:

- **Initial conversion:** “The initial recipe conversion timed out after 3 minutes. No repair attempt was started.”
- **Repair:** “The recipe repair timed out within the shared 3 minutes limit for initial conversion and one repair attempt.”

Both messages suggest choosing a longer time limit, a shorter recipe, or Manual JSON. Reload after updating to receive the new messages. Automated tests cover both timeout stages and session cleanup; the suite now contains 21 tests. The timeout messages diagnose where the deadline expired, not why the model was slow.


While inference is pending, the conversion dialog updates elapsed time every second and separately displays streamed output activity when supported. The clock alone is not evidence that the model is generating tokens. Cancel remains available. An initial-conversion timeout means no repair was started; raising the limit gives the first response more time but does not fix or diagnose slow or stalled inference. Real model completion within the longer limit remains unverified.


### What we learned from the pizza conversion

The supplied sheet-pan pizza recipe is a normal-length recipe. Its timeout is not evidence that the source is too long. The stage-specific error confirmed that the **initial response** exceeded three minutes and **no repair attempt had started**. There is at most one repair, and both responses share a deadline; repeated retries did not cause this observed timeout. Raising the UI default to ten minutes was a workaround, not a diagnosis or a demonstrated speed improvement.

The input also contains image placeholders, photo-reference numbers, and ingredients joined without clear separators. These are plausible sources of extraction errors, but have not been established as the cause of the delay. The model processes instructions and a full example as well as the user's recipe, and uses a structured-output schema. Prompt processing, output generation, structured-output constraints, and the browser/model runtime remain possible contributors; we have not isolated them. The earlier malformed response demonstrates that valid JSON shape does not guarantee correct graph connections or faithful cooking values.

### Conversion dialog and measurements

Conversion opens a modal dialog immediately, before session creation. It shows startup/download, initial response, validation, optional repair, and grid rendering. The dialog closes automatically **only after validation and successful grid rendering**. Errors, timeouts, and cancellation leave the dialog and timestamped history open until explicitly closed. Escape during a run cancels it and retains the history. The previous valid grid remains available when conversion fails.

`src/aiService.js` uses `promptStreaming()` when available, retaining the same schema, sampling options, cancellation, and shared deadline. It assembles incremental text before parsing and graph validation; partial output is never rendered as a recipe. A browser without streaming falls back to `prompt()` and explicitly reports that first-output timing is unavailable. A streaming API error is surfaced, not silently retried as another generation. See Chrome's [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api) for streaming and structured-output support.

The dialog records:

- Total elapsed time, including session preparation, and timestamped stage transitions.
- Time from each response request to its first nonempty output chunk, separately for initial generation and repair.
- Characters/chunks received and time since the last nonempty chunk. These are observations, not token counts or completion percentages.
- Response completion time, validation failures, repair start, and the final error or success.
- Source, instructions/example, and serialized schema character counts. These are not token counts or an exact measure of model context usage.

**Copy diagnostic report** copies the measurements and stage history. Reports stay in the page until the next conversion or reload and are copied only on request. They do not include the source recipe or full generated response; error messages may include model-generated IDs. No telemetry is sent to a server.

To investigate a slow conversion, first rerun the original recipe and copy the report if it fails. Then compare a tiny source, such as “Beat one egg with a pinch of salt. Cook in a lightly oiled pan until set,” using the same time limit and browser configuration. Keep the tab visible. Model warm-up and caching can affect comparisons; record run order. A long session-preparation stage points to startup, a long wait before first output points to the request/first-output path, and increasing output counts show that generation is progressing. None of these observations alone identifies the internal cause or proves the model is stalled. Further controlled experiments with prompt size or constraints should follow measurements, rather than assuming that a short recipe needs shortening.

Verification: 26 automated tests pass, covering streamed assembly and timing events, partial-output timeouts, one streamed repair, transport errors without retries, cancellation, and existing graph/layout behavior. Real Chrome model latency and successful conversion of the supplied pizza recipe remain unverified; streaming makes the next run observable rather than claiming to fix inference speed.

Browser verification with a simulated model covered successful auto-close after rendering, persistent API/validation errors, Escape and Cancel retaining history, starting another conversion, and desktop/mobile layout. No page errors occurred. These checks do not exercise real model inference.


### Response exceeded output limits and was truncated

A subsequent run reported “The response exceeded output limits and was truncated.” This identifies a response-length failure, distinct from the app's elapsed-time deadline. More waiting does not increase that limit. The error alone does not establish whether the model was verbose, repeating itself, or encountering a small runtime output budget, and it does not retroactively establish the cause of earlier timeouts.

The prompt now uses a small, compact branching example instead of the full indented Banana Bread example, requests compact JSON, and asks for concise actions with redundant consecutive actions combined. Quantities, temperatures, durations, essential actions, and all ingredients must still be retained. The demo fixture and external JSON schema are unchanged. This reduces unnecessary prompt/example size and encourages shorter output; it is a mitigation, not a verified resolution on the user's model.

Explicit output-truncation errors now receive an explanation that increasing the time limit will not help. The retained dialog/report includes the original browser error name and message, the attempt, and received character/chunk counts. Output-limit failures do not trigger another automatic generation. Even if received text happens to parse, a failed stream is discarded rather than accepted as a complete recipe. Generic input/context quota errors are not misclassified as output truncation. Non-streaming failures report zero received characters because no partial response is exposed to the app.

Verification: 28 automated tests pass, including truncation after parseable text, no retry after truncation, received-output diagnostics, and distinction from input quota failures. The subsequent real-model compact-prompt run also failed with output truncation; see the measured comparison below. Successful pizza conversion remains unverified.


Observed diagnostic report before the compact-prompt change: source 2,460 characters; instructions/example 3,722; schema 1,406. Session preparation finished at 0.2 seconds, first output arrived 1.9 seconds after the request, and the run ended at 346.8 seconds with 20,999 characters across 8,297 stream chunks. Output was still arriving immediately before truncation. No repair started. This run was dominated by response generation, rather than startup or waiting for first output, and ended at an output limit rather than the ten-minute timeout. Stream chunks must not be interpreted as tokens. The unusually long output suggests verbosity or repetition, but its contents were not captured in that report, so repetition remains unconfirmed. This evidence does not establish the outcome of the new compact prompt.


### Compact-prompt test result and next investigation

The user tested the revised **1,993-character** instructions/example against the same **2,460-character** pizza source and **1,406-character** schema, with the same ten-minute limit. It still failed with `QuotaExceededError`: “The response exceeded output limits and was truncated.”

| Observation | Previous prompt | Compact prompt |
| --- | ---: | ---: |
| Instructions/example characters | 3,722 | 1,993 |
| Session ready, elapsed from start | 0.2 s | 5.8 s |
| First output, measured from response request | 1.9 s | 1.7 s |
| Total elapsed at failure | 346.8 s | 582.5 s |
| Output characters received | 20,999 | 23,067 |
| Stream chunks received (not tokens) | 8,297 | 9,065 |
| Attempt | Initial response only | Initial response only |
| Failure | Output limit | Output limit |

The compact run reported download progress at 0% and 100% at the start; those events alone do not establish whether a new model download occurred. Output was still arriving immediately before failure. The initial response began at 5.8 seconds and failed at 582.5 seconds, before its shared ten-minute inference deadline. No repair attempt started, so retries did not account for this run's duration.

**Learning:** shrinking the prompt/example did not resolve truncation in this test. The compact run actually received more output and took longer. Both reports show quick first output followed by prolonged generation; neither establishes what the model was writing. Verbosity, repetition, and formatting issues remain hypotheses until the raw output is inspected. This pair of runs is not a controlled benchmark and does not prove that the shorter prompt caused the slowdown or identify a fixed character/token ceiling.

**Decision at that point:** pause implementation changes at the user's request (superseded by the subsequent request to address both failures below). The user will retry and inspect the existing **Show current output / Refresh output snapshot** dump, then copy or print it to investigate what is being generated. Preserve a snapshot and diagnostic report before starting another conversion or reloading. Further changes should be guided by that evidence. The 28 passing automated tests verify app behavior, not resolution of the real-model generation problem.


### Inspect or print current model output

In the conversion dialog, **Show current output** reveals an on-demand snapshot of the raw text received so far, labeled separately for initial and repair attempts. It is available while generation runs and after a timeout, truncation, validation failure, or cancellation. **Refresh output snapshot** captures newer output; the displayed text does not continuously repaint during generation. Non-streaming browsers expose text only when a response completes.

**Copy output snapshot** copies that text; **Print snapshot to console** explicitly logs it in the browser's developer console. No model text is automatically logged or added to the diagnostic report. The snapshot may contain recipe content and may be incomplete or invalid; it is never treated as a verified grid. Text is displayed in a read-only textarea, not interpreted as HTML. Both attempts remain available until the next conversion or page reload, which clears the snapshot. Console entries already printed are managed by the browser.


### Whitespace loop and incorrect recipe structure: mitigation

The user-supplied raw dump contained approximately 2,193 characters before 10,235 trailing whitespace characters. It had no top-level `steps` array: cooking actions were placed inside `ingredients`, with `text`/`prep` fields rather than `action`/`input_ids`. It also contained repeated step IDs, malformed prep strings, and a corrupted temperature. Adding the missing closing brace or trimming whitespace would not make it a valid recipe.

After the user's request to address both failures:

- `src/outputGuard.js` stops streaming after **512 consecutive JSON whitespace characters outside quoted strings**. The counter spans chunks, resets on content, and tracks escaped quotes/backslashes. Spaces within ingredient or action strings are not treated as formatting. This is an intentional heuristic for the compact-output format, not a JSON validity rule; extremely long formatting whitespace can trigger it even if valid JSON would eventually follow.
- The stream is canceled, the session is destroyed, and the dialog stays open with category `whitespace-loop`. The snapshot remains available. This early stop does not fabricate missing braces, accept partial output, or trigger another automatic generation. Non-streaming browsers cannot detect the loop while the response is pending and retain their existing timeout.
- Both initial generation and the existing single validation-repair request now use **`omitResponseConstraintInput: false`**, allowing Chrome to supply schema guidance to the model. Previously the flag was true. Chrome's [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api) describes this option; whether omission contributed to the observed structural error is still unproven.
- The prompt and repair instructions explicitly require separate `ingredients` and `steps` arrays and their respective fields. Schema and graph validation remain mandatory. Invalid completed responses still get at most one repair; ambiguous IDs, missing connections, and cooking temperatures are never guessed by the app.

Diagnostic details now reports **Schema guidance: enabled** to identify the revised configuration. The instruction character count has changed again; the historical 1,993-character count describes the earlier compact-prompt trial, not this version. The original shared deadline, output snapshots, and local-only processing remain in effect.

Verification: all 31 automated tests pass, including chunk-spanning whitespace detection, quoted whitespace and escapes, ordinary formatted JSON, snapshot retention/cleanup on early stop, and rejection/repair of cooking steps misplaced in ingredients. Replaying the user's actual dump in simulated 32-character chunks stopped below 3,000 received characters instead of continuing through its 10,235-character whitespace tail. This demonstrates the guard, not successful real-model pizza conversion. The schema/prompt change is a structural mitigation that still needs verification in the user's Chrome.


## Lessons from the completed-JSON failures

The latest supplied report used a 4,020-character source and 2,488-character instructions. The first response completed in 29.9 seconds (2,714 characters); a repair completed in another 26.3 seconds (2,490 characters), for 56.3 seconds total. Both responses were valid JSON with the required top-level arrays, but both contained duplicate IDs and nonexistent references. The repair worsened some quantities and temperatures and omitted ingredients. Examples in the dumps include `55000 g` becoming `55550 g`, `4440 g` becoming `44440 g`, and further corrupted baking temperatures. These are content failures, not JSON parsing errors. The source length also differed from earlier runs, so the timing change is not a controlled measurement of the schema-guidance change alone.

The earlier whitespace guard and schema guidance did not establish reliable recipe extraction. Valid JSON and schema compliance are separate from factual fidelity and graph validity. The successful lesson is to remove deterministic bookkeeping from the model and bound what any correction may change. IDs are now assigned by code, extracted wording is checked against source phrases, and the model can propose only fixed-ID connections during linking.

### Staged-pipeline verification and next user test

All 46 automated checks pass. Coverage includes source-number corruption, ingredients containing action objects, fixed ID generation, reference validation, graph ordering, preservation of accepted facts during connection correction, one correction globally, independent session cleanup, later-session startup timeout, partial-output retention, whitespace loops, and output-limit failures. Existing layout and malformed-graph tests remain. Browser checks with a simulated model cover three-stage success, a connection-only correction, failure retaining the previous grid, separately labeled output dumps, copying reports/snapshots, cancellation, and narrow-screen layout without page errors.

Reload and confirm **Pipeline: staged-v1** in Diagnostic details. Retry the same recipe. The history should show ingredient extraction, action extraction, then linking. If a source-text check fails, inspect that stage's dump; if linking fails, inspect its fixed-ID rows. Copy the diagnostic report and raw snapshots before another conversion or reload. A successful run should close the modal and show the grid; verify ingredient coverage and cooking details against the original. Successful conversion by the real local model is still pending—tests establish application behavior, not model capability.


### First reported staged run: ingredients pass, action grounding fails

The user tested `staged-v1` with a 2,717-character source and a ten-minute shared limit. The run ended after 32.5 seconds:

| Stage | Generation time | Completed response size | Result |
| --- | ---: | ---: | --- |
| Ingredients | 7.2 s | 494 characters | Source-text validation passed |
| Cooking actions | 10.3 s | 1,123 characters | `Setup 1` did not match the source |
| Cooking actions correction | 10.4 s | 1,094 characters | Same `Setup 1` validation failure |
| Connections | Not started | — | Blocked by failed action extraction |

The accepted ingredient response contained 13 entries, including dough, topping, garnish, and pan ingredients. Visible quantities included 550 g flour, 440 g water, 300 g tomato purée, and 250 g mozzarella, without the repeated-digit corruption seen in previous dumps. This is evidence that ingredient extraction and grounding succeeded in this run, not proof of overall recipe accuracy. The extracted title was the source heading “Ingredients for a 16x12 in sheet pan (40x30 cm),” showing that verbatim matching can accept a semantically poor title.

The supplied action snapshot put “work the flour and yeast … together with the water … and mix …” in `setup`, even though it consumes ingredients and belongs among cooking actions. Mixing also appeared in the actions list, creating overlapping instructions. Photo-reference numbers remained in the copied phrases. In the earlier supplied source, the passage says “start by working the flour and yeast”; changing “working” to “work” illustrates the kind of small grammatical rewrite that the strict contiguous-phrase check rejects. The exact 2,717-character input for this run was not attached, so that specific mismatch is an illustration, not a confirmed character-by-character diagnosis of this run.

**Lessons:** source grounding protects against invented numbers but also rejects harmless paraphrases. Exact wording alone does not establish the correct category (setup versus cooking action), title selection, ingredient coverage, or absence of repeated instructions. In this run the bounded correction repeated the same validation failure; the app correctly retained accepted ingredients, stopped after its single correction, and did not proceed to linking or show a new grid. No timeout, output-limit error, or whitespace-loop stop was reported.

**Evidence limits:** the pasted action snapshot is labeled 918 characters and ends mid-temperature, whereas the report records a completed initial action response of 1,123 characters and a completed correction of 1,094. It is therefore a partial snapshot/excerpt and cannot establish either completed response's full contents. The correction dump was not included. The report shows the completed responses reached source validation, so the excerpt ending mid-JSON is not evidence of a model output-limit failure. Source length differs from previous trials, so shorter generation times are not a controlled benchmark of the staged design.

No implementation change was made for this observation. Future investigation should compare the exact input with both completed action dumps, and distinguish wording mismatch from misclassification and duplicated actions before choosing a fix. Successful end-to-end conversion with the real model remains unverified.


### Passage selection replaces action rewriting (`staged-v2-passages`)

The failed `Setup 1` run showed that requiring a small model to reproduce exact source wording adds an unnecessary failure point. The action stage now receives a list of `{id, text}` source passages and returns only `{"passage_ids":["p_5","p_6"]}`. Its schema enumerates the IDs and accepts no setup, rewritten action text, quantities, or connections. Code retrieves the selected original text, restores source order, assigns step IDs, and rejects repeated or unknown selections. “Working” can no longer become “work,” and a selected temperature cannot acquire extra digits through action generation.

The splitter uses line breaks, sentence punctuation, and semicolons outside parentheses/brackets. It preserves decimal quantities, fractions, common unit abbreviations, and parenthetical temperature pairs. Passages retain exact source offsets; only surrounding whitespace is trimmed. Whole image-placeholder lines are omitted from the candidate list. It conservatively keeps some sentences together rather than cutting a quantity at an abbreviation. It does not split every conjunction or clean embedded photo numbers, since doing so could change source content. Different source occurrences of the same instruction remain separate passages, so two intentional ten-minute rests are not collapsed.

Setup-versus-action classification is removed from this stage: preparation operations remain selectable as actions, and generated `setup` is empty. This removes the exact-copy/setup failure from action selection, but does not solve every dependency-model limitation. Equipment-only operations, multi-operation sentences, or split ingredient portions may still be hard to connect under the existing single-consumer tree contract. Selection can still omit useful passages or include irrelevant ones. The app continues to reject invalid connections rather than manufacture inputs or quantities.

**Show current output** now includes the source passage-ID map alongside each stage's raw response, making an ID-only selection inspectable. The map is shown/copied/printed only through the existing user-requested snapshot controls; it is not inserted into the ordinary diagnostic report. The global one-correction budget, fresh sessions, shared deadline, whitespace guard, and final graph validation remain unchanged.

Verification: all 54 automated tests pass. Added checks cover source offsets, decimals/fractions/units, parenthetical temperatures, image placeholders, preservation of “working,” duplicate/unknown selection rejection, source-order restoration, legitimate repeated rests, and correction restricted to passage selection. Reload and confirm **Pipeline: staged-v2-passages** before retrying. Successful conversion by the real local model remains unverified; the next useful evidence is the selected IDs, their source passages, and the linking result.


### Connection-row repetition after passage selection

The next supplied snapshot selected 17 cooking passages (`p_5` through `p_21`) and retained a 494-character ingredient response. The connecting-stage snapshot had already reached 9,373 characters and continued emitting connection rows instead of ending after the expected 17. Many rows repeated the same small set of IDs. Its third row referenced `step_3` itself, so the response was invalid well before the long repetition became visible. This is content repetition, not the earlier whitespace loop. The snapshot is incomplete; it does not establish a final duration or browser error.

**What we learned:** selecting passage IDs removed the need to regenerate cooking text, but linking all actions remains a difficult separate task. A JSON-shaped response can still have the wrong number of rows, self-references, repeated consumers, or incorrect cooking relationships. Schema guidance and instructions alone did not enforce these rules in this run. Waiting longer cannot turn an already invalid row into a valid graph. The selected passages also include a dough-texture observation, so selection quality remains imperfect. This evidence does not establish the underlying model's internal cause, nor that every recipe is representable by our single-consumer tree.

**Implemented safeguard (`staged-v2-passages-bounded-links`):** the linking schema specifies exactly one row per action and bounded, unique inputs. Independently of browser schema enforcement, the app validates each completed row while streaming using the same checks as final assembly: nonempty inputs, known ingredient/earlier-action references, no repeated consumption, and no extra rows. A derived content budget also stops oversized output that never completes a row. The existing whitespace guard remains active. Neither guard truncates a bad response into a supposedly valid recipe.

An early connection validation failure cancels the stream, retains the received output snapshot, destroys the session, and can spend the existing **single correction across the entire conversion**. It does not add another retry allowance. The correction uses the frozen ingredients/actions in a fresh session; if it also fails, or the allowance was already used, the modal stays open with the failure. Transport, timeout, whitespace-loop and browser output-limit errors still do not trigger corrections. Full JSON and final connectivity validation remain required before applying a result.

All 61 automated tests pass. Verification covers fragmented and escaped IDs, self/forward/unknown references, repeated consumption, extra/empty rows, unfinished oversized output, cancellation of a stream that never closes, snapshot retention, the global correction bound, and recovery with unchanged earlier stages. This is an early-failure safeguard, not proof of accurate model linking. End-to-end success with the real local model still needs another user trial; increasing the time limit is not the recommended response to this repetition.


### Linking request rejected before output: schema compatibility rollback

After the bounded-links change, the next user snapshot again contained 494 characters of ingredient output and a selection of 17 passages, but the connecting stage returned **zero characters** with “The request is invalid - the input or options could not be processed.” This is distinct from the earlier repeated-row generation. No linking output was available to validate.

The recent addition of nested `minItems`/`maxItems` constraints and `uniqueItems` is the leading regression hypothesis. The error does not identify a particular keyword, and we have not isolated one on the user's browser. Chrome's [structured-output documentation](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api) itself demonstrates `maxItems`, so this observation must not be generalized into a claim that all array bounds are unsupported. The exact schema combination or its compilation cost may matter; that remains unconfirmed.

The compatibility fix restores the earlier browser-facing connection schema (object, arrays, strings, fixed-ID enums, required fields, no extra fields). Row-count, uniqueness, reference checks, content budget, whitespace guard, and final graph validation remain enforced locally. There is no automatic retry without schema guidance and no extra correction allowance. The diagnostic report now distinguishes this specific zero-output request rejection as `request-invalid`, retains the original browser message/name, and explains that it is not a timeout or repetition failure. Reloaded builds identify `staged-v2-passages-bounded-links-compat`.

**Lesson:** mocked model tests establish application behavior, not acceptance by Chrome's schema compiler or accurate model output. The previous 61 passing tests did not establish compatibility of the newly added schema keywords. All 62 automated tests now pass, including the restored schema contract, early stream safeguards, and request-rejection cleanup/no-retry diagnostics. The compatibility rollback and real-model end-to-end linking still require a browser trial.


### Linking copies the two-row prompt example

The next user trial reached linking successfully: 495 characters of ingredients, 17 selected cooking passages, then complete linking responses of 42 and 41 characters. Both linking attempts returned the same two rows, `[["ing_1","ing_2"],["step_1"]]`, matching the concrete example embedded in the linking system prompt. Validation rejected both because 17 rows were required. This trial shows the request was accepted after the schema rollback; it does not identify the specific constraint responsible for the prior rejection.

The match strongly suggests example copying, although we cannot observe the model's internal reasoning. The response is complete JSON, not truncated output or a whitespace/repetition loop. It is also semantically incomplete: the first source action mixes flour, water, and yeast, but these two IDs cover only flour and water. The bounded correction repeated the same answer rather than resolving the error. No new grid was applied.

The linking prompt now describes the output structure in words without a concrete example of ingredient/step edges. Each request and its optional correction explicitly include the actual `expected_rows` and `row_order`. Instructions ask for every action and for ingredient selection based on cooking text rather than ingredient-list position. Row-count failures now report the received count as well as the expected count. The simple browser schema, local stream guards, single shared correction allowance, and final validation remain unchanged. The pipeline identifier is `staged-v2-passages-explicit-rows`.

**Lesson:** an illustrative answer can become the model's answer, especially when it contains IDs that also appear in the real task. Explicit task dimensions remove that ambiguity but do not establish graph accuracy. All 63 automated tests pass, including a 17-action mocked conversion whose two-row response is rejected and whose correction receives unchanged explicit row requirements. This test verifies request construction and validation, not that the real model will follow the revised prompt. Real-model linking remains unverified.


### Explicit row counts still loop inside the first row

The next real `staged-v2-passages-explicit-rows` trial used a 2,717-character source and selected 17 actions. Ingredient extraction and passage selection passed by 9.7 seconds. Initial linking hit its content budget at 43.6 seconds; the single correction hit the same budget at 85.3 seconds. Thus linking and correction accounted for the remaining 75.6 seconds, including session preparation and validation. Neither produced a usable graph.

The attached snapshots show repetition **inside the first unfinished input row**, not excess completed rows. The initial response lists many ingredients, repeats `ing_1`, and then includes self/forward step references. The correction starts with three ingredients followed by `step_1` (a self-reference for the first action), then repeatedly emits mostly `step_1` and `step_3`. Neither closes its first row. The row validator therefore never receives a completed row; the separate content budget catches the runaway. This exposes the granularity of the current guard, not a valid response rejected for being slightly too long.

The limit was 2,578 content characters. The snapshots contain 2,579 and 2,868 total characters respectively: the guard excludes formatting whitespace outside strings, whereas diagnostic output length includes it. A whole streamed chunk is also retained before validation scans it, so the snapshot may extend past the exact stopping character. These are character measurements, not tokens. The final failure is currently classified as `other` because the exhausted-correction wrapper is a generic error; its message still identifies the content-budget stop.

**Lessons:** removing the concrete two-row example changed the observed failure but did not make linking reliable. Exact counts, schema guidance, a fresh session, and one correction were insufficient on this recipe. The correction repeated the same failure pattern. The first two stages passed their validators, but this does not prove complete or semantically correct extraction (the selection still includes the dough-texture observation). The evidence supports a failure of the current linking task design with this model; it does not isolate the internal model/decoding cause.

The recommended next experiment is to request connections for one action at a time, supplying only eligible ingredients and prior results, validating each answer before proceeding, and assembling IDs in code. That would reduce each output to a small decision and make progress measurable, but adds requests and still cannot guarantee sound cooking relationships. It must preserve a global deadline and bounded correction allowance, and must not invent ingredient portions or silently force a sequential chain. Shared ingredient uses and equipment preparation remain limitations of the current single-consumer tree. This experiment is not implemented by this documentation update. Increasing the content/time limit or adding another same-task retry is not supported by this evidence. No application behavior changed for this observation; successful real-model linking remains unverified.


### One-action linking replaces whole-graph generation (`staged-v3-action-links`)

The first-row repetition established a practical boundary: reducing the prompt example and checking completed rows did not make a whole-graph request reliable. A guard can stop wasted generation, but it cannot improve the model's choice of cooking relationships. The new implementation therefore reduces the linking decision itself, rather than increasing time/output budgets or repeating the same graph request again.

After ingredients and passages are accepted, linking proceeds in source action order. Each fresh session sees one current action, neighboring action text, and an explicit list of eligible inputs. Those inputs are unused ingredients and unconsumed earlier results, with exact source ingredient text available inside each result candidate. The model returns only `input_ids` for the current action. An accepted decision updates the candidate list before the next request. For example, once flour, water, and yeast have been consumed into a dough result, the later resting action can select that result; it cannot select those ingredients again as fresh inputs. Separate results remain eligible until a later action combines them. No concrete example of ingredient or step IDs is embedded in the linking instructions.

The stream guard now checks a completed ID as soon as its closing quote arrives. This closes the gap exposed by the supplied dump: a repeated ingredient or a reference to the current action is rejected even if the model never closes its input array. Malformed structures and a derived content budget still bound other runaway output. Received text remains available in the snapshot; no invalid prefix is converted into an accepted answer. Local validation rejects empty answers, unknown or ineligible IDs, duplicates, and final actions that leave candidates disconnected. The final recipe still passes the existing tree validator.

This design deliberately keeps one correction globally, including ingredient extraction, passage selection, and all linking requests. A correction repeats only the failed action/stage with its unchanged accepted context; later actions do not start until it passes. The entire run retains the shared deadline and cleanup behavior. The modal reports the current action and total, and snapshots retain the action and eligible inputs with each response so a wrong decision can be diagnosed directly. For the reported 17-action selection, a normal run makes 19 requests, with at most 20 if the correction is used. More small requests can add session overhead; shorter individual responses are not a promise of lower end-to-end latency.

**Lessons and limits:** eligible-input lists move reference bookkeeping into code and avoid asking a small model to plan every graph edge in one output. They do not prove that a locally valid choice is the right cooking choice. A wrong early link can make a later action impossible, and the app stops rather than silently rewriting accepted links or forcing a sequential chain. Split ingredient quantities, repeated ingredient use, equipment-only operations, and overly broad or irrelevant selected passages still expose limitations of the single-consumer tree representation. No ingredient portions, quantities, or missing relationships are fabricated to force success. The simple schema preserves the compatibility rollback; acceptance by a particular Chrome/model version and successful real-model conversion still require verification.

**Verification:** all 81 automated tests pass. Chrome checks with a simulated model confirmed action-by-action progress, a valid result rendering before the modal closes and focuses the result heading, and immediate cancellation when an invalid ID completes inside an unfinished list. That failure gets at most the one shared correction. Failure and cancellation retain the previous grid. Output snapshots include the current action and eligible candidates; copied diagnostic reports exclude recipe text. Narrow-screen checks found no page errors or horizontal page overflow. A real-model check through native Chrome could not start because computer-control permission was unavailable; no real inference run was completed for this revision.

Reload and confirm **Pipeline: staged-v3-action-links** before testing. The linking history should advance through individual actions. If it fails, preserve the report and output snapshot: the latter now identifies the failing action, the available candidates, and the model's choice. Check ingredient coverage, selected passages, and dependencies against the original even when a grid renders. Automated and simulated-model checks establish application behavior; they do not establish local-model capability.


### A structurally valid first link consumed every ingredient

The first reported `staged-v3-action-links` trial stopped after about 15 seconds, with ingredient extraction and passage selection completing by 9.7 seconds. Its first linking response was short, valid JSON, and used every available ingredient exactly once. That passed the structural checks—but the action only mixed flour, yeast, and water. The model had also consumed all oil, salt, tomato, oregano, mozzarella, basil, and pepper into the first result.

The second action selected that result for the dough rest. At the third action, “Then add the oil … and the salt …,” the candidate list contained only the preceding result: all raw ingredients had already been consumed. Both the initial answer and the single correction repeated `step_2` twice and were rejected immediately. The duplicate was the stopping error, but the earlier acceptance of all 13 ingredients was the more consequential failure. Removing the duplicate alone would have hidden a wrong cooking graph.

**What we learned:** smaller requests and eligible-input bookkeeping prevented another prolonged generation loop, but eligibility proves only that an input is available, not that the current action uses it. Structural validation must be distinguished from evidence for the cooking relationship. Accepting a bad early link also changes later candidate lists; the later failure cannot be understood from its response alone. The saved action/candidate context made this causal chain visible. The trial is evidence of this concrete failure, not proof of the model's internal reasoning or of accurate extraction elsewhere.

### Fixed ingredient decisions with action evidence (`staged-v4-grounded-links`)

Each per-action linking request now has a fixed object field for every eligible candidate. For a raw ingredient, code computes a small set of evidence phrases from the current action using conservative ingredient-name overlap. The field can contain one of those exact phrases to select the ingredient, or an empty string to leave it unused. An ingredient with no matching evidence has only the empty-string choice. Prior result fields permit `use` or an empty string, since a direction such as “cover and rest” can refer to a mixture without restating all of its ingredients. Code derives the input IDs from these decisions; the model no longer generates an extensible list of references.

For the reported first mixing action, flour, water, and yeast have evidence in the action. The toppings do not, so the “consume all 13” answer cannot pass. This removes the specific earlier acceptance error without pretending that every allowed choice is correct. The fixed-field schema also reduces opportunities for a repeated ID list. Stream validation rejects repeated or unknown fields and unsupported values; missing fields are rejected before a response is accepted. The linking schema uses only simple object/string/enum constraints, required fields, and no extra properties, preserving the earlier compatibility approach without array bounds or uniqueness keywords. A derived output budget and the whitespace guard remain in force.

The evidence helper handles case and accent differences, simple plurals, joined ingredient names such as “fiordilatte,” and a narrow alias between greasing and a fat ingredient. Evidence values always come from the original action text. This is a lexical check with deliberate limits: implicit additions, collective names such as “dry ingredients,” and unrecognized synonyms may fail to produce an allowed choice. Multiple oil or salt entries may share one textual mention; selecting two raw ingredients with the same evidence is rejected rather than treating that mention as proof that both portions are added. Choosing the correct one of several portions and representing repeated uses of the same ingredient remain unresolved semantic and tree-model constraints. The app does not manufacture portions, alter quantities, or change numbers to make the graph fit.

Per-action sessions, accepted earlier work, one shared correction, the global deadline, and final tree validation remain. The modal still reports action progress and retains failures, while raw snapshots now include each candidate's evidence choices. A missing ingredient or incorrectly chosen prior result can still produce a wrong or impossible graph. This change specifically prevents unmentioned raw ingredients from being accepted as additions to the current action; it does not establish complete semantic accuracy or successful conversion by the real local model.

Reload and confirm **Pipeline: staged-v4-grounded-links** before testing. On the first pizza action, the evidence choices should distinguish flour, water, and yeast from ingredients reserved for later actions. If a decision fails, retain the report and snapshot so the action, allowed evidence, selected values, and remaining inputs can be compared together. Successful real-model conversion remains unverified for this revision.


Verification for `staged-v4-grounded-links`: all 93 automated tests pass. The reported first pizza action permits evidence only for flour, water, and yeast; unrelated toppings/garnish, whole-action quotes, and next-action-only ingredient mentions are rejected. Tests also cover fixed-field streaming, duplicate keys before JSON parsing, evidence enums, missing fields, ambiguous repeated portions, exact text and quantities, branch composition, scoped corrections, cancellation, shared deadlines, and final assembly. Syntax and whitespace checks pass. An attempted browser UI check was blocked before page access because the browser tool could not verify the admin-enforced security policy. No browser or real-model success is claimed for this revision.


### Grounded linking still needs ingredient-role and portion context

The next `staged-v4-grounded-links` trial did not complete. An earlier blank selection spent the single shared correction. A later decision tried to allocate the same action evidence to multiple ingredient portions, and validation stopped the run. This is a different failure from the earlier all-ingredients-first-action answer: evidence can establish that an action mentions oil or salt without establishing which listed oil or salt entry it means.

The extracted ingredient strings had flattened the recipe's original sections. “For the topping” and “For the pan” are meaningful context: they distinguish the dough oil, topping oil, and pan oil even though all share the name “extra virgin olive oil.” Exact strings and quantities survived, but their roles did not. Name overlap alone cannot recover that lost relationship reliably. Rejecting several portions selected from one mention avoids silently consuming them all; it does not supply the missing interpretation. A bounded correction spent on an earlier empty answer also leaves no later correction allowance, as designed.

### A manually reasoned pizza table demonstrates the representation

The [sheet-pan pizza JSON](../examples/sheet-pan-pizza.json) and its [rendered table](../examples/sheet-pan-pizza.html) provide a concrete reference built from the supplied recipe using the existing recipe contract, validator, and layout engine. The standalone HTML serializes the layout cells into a table. This is a manually reasoned adaptation of the source, not a successful automatic extraction or a fallback inserted into the AI conversion flow. No automatic conversion behavior was changed while creating this reference.

The reference preserves the 13 original ingredient entries but represents them as **14 ingredient-use leaves**. The topping oil's single 25 g total is used in two places: about half in the topping and a little more for the later drizzle. Those uses receive separate leaves tied in their wording to the same original total. No exact split such as 12.5 g is invented, and the original 25 g is not presented as two independent full quantities. The dough oil and pan oil remain separate entries: 30 g for the dough, and an unspecified amount for greasing the pan.

The **17 curated cooking steps** retain the dough rests, folds and rise, and form explicit branches for greasing the pan, preparing the topping, and cutting/draining the mozzarella during the first bake. These branches join at the relevant later actions and end in one final pizza result. Every ingredient-use leaf has one consumer and the graph has no shared references. The source's dough-texture observation does not need its own ingredient-consuming action. The table expresses material dependencies; it is not a schedule that proves exactly when independent work occurs.

**What this establishes:** this recipe can be represented by the existing tree-shaped table when its ingredient roles and explicitly described separate uses are interpreted correctly. The repeated automatic failures do not show that the recipe itself is unrepresentable. They show that the current extraction/linking pipeline does not reliably make those distinctions. Structural validation, verbatim text, and per-action evidence each address a different failure class; none alone establishes a correct cooking interpretation.

**What remains to solve automatically:** preserve section roles during ingredient extraction, distinguish same-name entries by that context, and represent separate uses only when supported by the source. A portion representation needs to retain its original total and avoid duplicate quantities. Grouping or splitting selected passages also requires care: an observation, equipment preparation, and an ingredient-consuming operation are not interchangeable graph nodes. The reference makes these decisions explicit for this recipe; it does not justify silently applying the same decisions to other recipes or accepting ambiguous model output. Use it as a concrete comparison for future conversion changes while keeping real-model success separate from validation/rendering of a manually prepared graph.

Reference validation: the graph has 14 ingredient-use rows, 17 actions, and a 15-column layout. Every grid position is covered exactly once, with no gaps or overlaps. Both new reference checks pass, bringing the automated suite to 95 passing tests. The HTML has not been visually checked in a browser; these results establish graph and layout validity, not successful automatic model conversion.


### Fix: separate ingredient roles and source-supported uses (`staged-v5-ingredient-uses`)

The action-3 failure exposed two distinct requirements. Separately listed dough, topping, and pan oils are different entries even though they share an ingredient name. Separately described uses of one listed topping-oil allowance also need different graph leaves, with both pointing in their labels to the same 25 g total. A generic oil node cannot express this correctly in the current single-consumer tree.

The new preprocessing preserves source-list sections and creates the supported shared-use entries before linking. For the reported pizza, 13 listed ingredients become 14 use entries. Step 3 offers only dough oil and dough salt for the ambiguous oil/salt mentions; topping and pan portions cannot be selected there. The two topping-oil uses are restricted to the selected topping-mixing and drizzling passages. Both retain the exact original ingredient phrase and an exact source portion phrase. Neither receives an invented 12.5 g quantity. Other ingredient strings and all cooking passages remain unchanged.

This rule is intentionally bounded: full-list source alignment must be unambiguous, same-name portions must be distinguishable by section, and the two recognized portion phrases must cover the ingredient mentions in that scope. Unsupported wording, unclear allocations, or additional uses are not silently split. Section context remains an interpretation aid, not a guarantee of semantic correctness. The model still chooses result dependencies and can omit ingredients or make other errors.

Validation: all 108 automated checks pass. Regression coverage includes the user's exact concatenated source and selected passages, the action-3 oil/salt choices, separate pan oil, the shared 25 g topping total, full graph/grid validation, ambiguous allocations, and a simulated streaming conversion completing in 19 requests (2 extraction requests plus 17 links), with no correction. This simulated model supplies expected choices; it is not evidence that Chrome's local model now completes the recipe. No new retry or inference stage was added. Reload and confirm **Pipeline: staged-v5-ingredient-uses** before the next real-model trial; retain the report and output snapshot if it still fails.


### Real-model progress: late unused ingredients and the last-mention fix review

The next supplied `staged-v5-ingredient-uses` run reached action 17 of 17 and stopped at 64.3 seconds. The final response and its single correction both left `ing_3`, `ing_5`, and `ing_6` unconnected. The snapshot identifies the earlier omissions: action 3 selected the rested dough but left the correctly offered dough oil and salt empty; action 11 selected topping oil, oregano, and topping salt but omitted the offered tomato. Thus passing action 3 established that the previous conflicting-portion error was avoided, not that the step was correctly interpreted. The final-step correction could not change already accepted earlier rows.

The same dump reveals a second error independent of the omissions. Action 11 consumed the resting dough while preparing the separate topping. Action 15 consumed the baked-pizza result while cutting and draining mozzarella. The model treated these independent preparations as continuations of the previous result. Structural validation only checks a connected tree, so those edges are not rejected on cooking meaning alone.

The reviewed working-tree change marks an unambiguous raw ingredient as required at its last remaining evidence opportunity and removes the empty-string choice from its schema. This blocks the reported oil/salt/tomato omissions at their respective steps without extra model requests. All 109 existing automated checks pass. However, two review reproductions establish limits:

- Replaying the supplied decisions while selecting the newly required ingredients passes full recipe validation but retains both incorrect branch connections. The new tests exercise expected correct rows, not the complete reported bad sequence. A regression needs to check that topping preparation leaves the dough available, and mozzarella preparation leaves the baked pizza available for their later joins. This branch issue predates the reviewed change and remains unresolved.
- With “Mix flour and water” followed by “Rest until the flour is hydrated,” the first flour choice remains optional because another mention exists. If omitted there, flour becomes mandatory during the rest; the resulting graph passes validation. A last textual mention is not proof that fresh ingredient input belongs at that action. This mandatory-choice rule therefore needs an incorporation/use check or an actionable early failure, rather than forcing a descriptive mention into an ingredient addition.

Lesson: distinguish permitted inputs, required additions, and prior-result dependencies. Preventing an orphan at the last action is useful, but neither all ingredients consumed nor a structurally valid graph establishes the correct cooking process. This review changed documentation only; it did not modify Claude's implementation. The review reproductions used local code and supplied responses, not a new Chrome inference run.


### Fix: actual ingredient use and independent results (`staged-v6-action-use`)

The last-mention requirement has been removed. A future descriptive mention no longer makes an earlier explicit addition optional, and the last mention cannot force a raw ingredient into a rest or observation. The local instruction recognizer looks for an affirmative operation governing the ingredient phrase. It excludes descriptions such as “until the flour is hydrated,” negations, and ingredient references inside already composed mixtures from fresh-use evidence. Conditional or alternative instructions remain uncertain rather than mandatory. Same-name ambiguity remains subject to the source-section rules; overlapping ingredient names are not forced into multiple uses.

For the reported pizza, dough oil and salt are required at “Then add the oil ... and the salt,” and tomato is required at the topping-mixing action. The snapshot's empty selections are rejected at those actions by both the schema and local validation, before the omissions can be accepted and carried to the final step. The existing single shared correction budget is unchanged.

Prepared results now retain source-mentioned names through their ancestry. A supported “Meanwhile” preparation using fresh ingredients keeps unrelated existing results unused; it still permits an existing result explicitly worked on, such as “Meanwhile mix garlic into the sauce.” This excludes the dough from topping mixing and the baked pizza from mozzarella cutting/draining. “Retrieve the dough” selects the dough rather than the newly prepared topping. Explicit joining instructions require the referenced preparations. A narrow surface reference (“spread ... over the surface”) can refer back to the still-live result spread in the immediately preceding action. In this recipe those rules preserve and then join dough/topping and baked pizza/drained mozzarella at the appropriate actions. No leftovers are appended to the final step.

The new tests retain the selected decisions from the supplied failed output in `tests/fixtures/pizza-reported-links.json`. They reject its omissions and wrong result edges at the actions where they occur, including tests that first supply the missing ingredients so those omissions cannot hide the independent-branch errors. They also cover the flour-hydration counterexample, negation, alternatives, ambiguous ingredient portions, and a valid existing-sauce use during a “Meanwhile” instruction.

Validation: all 117 automated checks pass. A simulated streaming replay preserves the reported decisions wherever the new schema permits them and otherwise uses a permitted schema value; it produces the expected 17-action graph in 19 requests with no correction. This is stronger regression coverage than feeding only a hand-written correct graph to the mock, but remains a simulated model test. Successful real Chrome inference is not claimed. Reload and confirm **Pipeline: staged-v6-action-use** for the next trial.

Limitations: this recognizer covers a bounded set of English operations, mixture names and reference patterns; it is not a general cooking-language parser. Unrecognized or ambiguous instructions may still need model interpretation or Manual JSON. The final tree validation remains necessary and still cannot, by itself, prove cooking accuracy. The lesson is to enforce supported semantic requirements at the relevant action and validate actual failure sequences, rather than equating ingredient-name matches or eventual graph connectivity with correct interpretation.


### Autumn Cake: reject document metadata before linking (`staged-v7-cooking-passages`)

The new recipe did not fail while heating almond milk. Its selected passage IDs included `p_2` (“FOR A 7-INCH PAN”) and `p_9` (“Orange peel 1”). Source ordering made the pan-size heading action 1, so every offered input was empty. The model returned all-empty fields twice. The linking correction was being spent on a document heading that could never have cooking inputs. The ingredient entry would have been another invalid action immediately afterward.

Known document structure is now excluded before selection: section headings, the extracted title, exact ingredient entries, and a block with explicit INGREDIENTS/preparation boundaries. The prompt and schema contain only eligible passages, preserving original IDs and wording. A response that still returns an excluded ID fails at selection, where the existing single correction can address it; it cannot reach linking. Without an explicit preparation boundary, unknown prose is retained rather than deleting everything after an ingredient heading. This is a conservative structural filter, not a general action classifier.

Inspecting the actual first cooking action also exposed compound-name ambiguity: “almond” matched almond flour and garnish almonds inside “almond milk.” A shorter modifier match is now excluded when every occurrence is covered by a longer offered ingredient phrase. Separate occurrences remain valid. Shared head nouns, such as “oil” in “olive oil,” remain ambiguous because they can represent separately listed portions. For the first cake action, only almond milk is eligible and its explicit pour operation requires it.

Validation: all 122 automated checks pass. The fixture retains the supplied source, ingredient extraction and invalid passage selection. Tests reject both bad IDs, preserve exact source slices, retain instructions without a preparation heading, check compound modifiers and separate oil portions, and exercise a mocked selection correction followed by the first real cooking action. That integration test deliberately stops after the milk action validates; it does not claim the entire cake converted successfully. Existing pizza regressions continue to pass.

Lesson: source-grounded IDs alone do not establish that a passage is a cooking action. Validate document role before dependency linking, and distinguish an ingredient's full name from words used as modifiers in another ingredient. Reload and confirm **Pipeline: staged-v7-cooking-passages** for another real-model trial. No new retry allowance or inference stage was added, and no source quantities were rewritten.


### Autumn Cake: omissions masked several incorrect links (`staged-v8-cake-links`)

The next run reached action 27 but left `ing_1` (Type 00 flour) and `ing_5` (Cardamon) unused. The snapshot showed why: sifting was not recognized as a required use, both flour entries shared the generic “flour” evidence, and the instruction spelled the spice “cardamom” while the ingredient list spelled it “Cardamon.” These were earlier interpretation failures, not missing inputs to the final serving sentence.

The same snapshot exposed additional errors that merely attaching those two leftovers would hide: the milk infusion was consumed while blanching nuts; orange peel was added while peeling those nuts; the eggs/batter and sifted dry ingredients were not independent; garnish pistachios entered the batter; orange juice was selected for zest; and garnish almonds were selected when adding prepared almond milk. Unmolding and brushing also need the cake and separately prepared juice to remain separate until their actual join.

Changes in this revision:

- Recognize sifting and the additional supported cake operations. Resolve the distinct “flour ... almond flour” mentions without forcing multiple portions from a single shared head noun. Recognize the explicit cardamon/cardamom spelling pair; this is not arbitrary fuzzy food-name matching.
- Keep operation words separate from ingredient names: “peel them” does not mean adding orange peel. Recognize the source's orange-peel/orange-zest naming pair using exact action evidence. Rose water is not ordinary blanching water. Ingredient strings and amounts are preserved.
- Include prepared-result contents when distinguishing compound-name modifiers and source roles. A prepared milk infusion can account for “almond milk”; that mention does not consume garnish almonds. Prepared cake pistachios do not become a second allocation from the garnish list.
- Preserve independent blanching, new-bowl egg and flour preparations, and orange-juice preparation. Direct drain/chop pronouns continue the preceding preparation. Supported dry-ingredient, unmolding, and surface-brushing references join the appropriate results rather than automatically chaining everything to the immediately previous action.
- Statements about later work, such as “the juice will be used to brush the cake,” do not introduce those inputs during zest addition.

Validation: all 129 automated checks pass. New fixtures preserve the reported linking responses and a separately reviewed expected graph. Tests cover both missed ingredients, noun/verb and spelling distinctions, the incorrect branch edges, and complete graph and rectangular-layout validation. A simulated streaming replay keeps the recorded decisions when permitted and substitutes a permitted schema choice otherwise; it completes the expected 27-action graph with 17 original ingredient entries in 29 requests, without a correction. Source action text and ingredient quantities remain unchanged. The earlier pizza and cake-selection regressions still pass.

Lesson: report every semantic error visible in a failed trace, not only the unused inputs that trigger the final validator. Counts and connectivity can hide premature ingredient use and collapsed parallel work. These additions remain bounded English/source-reference rules, not a general cooking-language parser. No successful new Chrome inference is claimed. Reload and confirm **Pipeline: staged-v8-cake-links** before testing again.


### Halloween Muffins: observation tense hid an immediate milk addition (`staged-v9-clause-scope`)

The reported final leftover, `ing_9`, was milk. Its actual use was action 6: “You will notice that the batter becomes thicker, so thin it with the milk poured in a trickle 6.” The candidate snapshot exposed an application error: milk had no evidence choices, so the constrained model could only leave it unused. Retrying the final action could not fix that earlier exclusion.

The future-tense guard had applied “will” across the entire sentence. The bounded instruction recognizer now separates an initial “you will notice/see/find” observation from a following comma plus “so/then” explicit operation. It recognizes thinning and diluting as ingredient uses. Milk is required at action 6; it is not appended to the serving action. Future uses, negations, conditional additions and observations without an instruction remain guarded.

Validation: 132 automated checks pass. A regression preserves the reported source, extraction, passage selection and all 16 linking responses. Replaying those links with milk added at its actual use produces a valid graph without changing action text. This is a deterministic regression, not a fresh Chrome model run or proof of complete recipe accuracy.

The same snapshot exposes remaining limitations: ingredient extraction omitted sugar eyes, passage selection omitted taking out and drying the glaze packet, and a combined stacking/boiling passage merged the muffins with glaze preparation early. Water used to warm a sealed packet is a process aid, not a food ingredient incorporated into the muffins. Those extraction and representation issues are not solved by the clause fix. A connected tree alone does not establish recipe completeness or correct material flow.

Lesson: inspect the choices supplied to the model before blaming its answer. An empty allowed choice can make a correct link impossible. Trace final leftovers back to their source use and test both the positive instruction and nearby negative/future cases. Reload and confirm **Pipeline: staged-v9-clause-scope** when testing this revision.


### Autumn Cake: duplicate pistachio portions at blanching (`staged-v10-preparation-roles`)

The latest Chrome trace selected both `ing_6` and `ing_13` for the single pistachio mention in action 3, and repeated that decision on correction. Section extraction was correct: the two 50 g entries remained separate, with the second under FOR GARNISH. The missing information was the role of the independent blanching action. Both portions were still offered, unlike the earlier recorded replay where the model happened to choose just the cake portion. Passing that earlier replay did not cover this alternative model response.

A bounded lookahead now connects a preparation to its first later explicit ingredient mention when that mention describes the prepared ingredient (chopped, blanched, toasted or roasted), a matching preparation operation appears in between, and the later action has an unambiguous source-section role. Here, chopping is followed by folding the chopped pistachios into the batter with cardamom and rose water. That anchors the blanching portion to the cake section. The garnish portion remains available for decoration. Explicit current section context takes precedence; absent preparation evidence, conditional uses or unresolved roles do not justify guessing from ingredient order or inheriting an unrelated preceding mixture.

Validation: 135 automated tests pass. Tests reject the reported double selection at action 3, require the cake portion there, reserve the garnish portion for decoration, and retain unresolved cases. The full simulated cake replay now includes this latest double-selection response and completes the expected 27-action graph with unchanged ingredient quantities and no correction under schema enforcement. This is not a fresh Chrome inference result.

Lesson: separate listed portions need source-grounded roles before schema generation. Duplicate detection after generation is necessary but insufficient when the schema still permits both conflicting choices. Regression tests should include newly observed model choices, not only previously successful choices. Reload and confirm **Pipeline: staged-v10-preparation-roles** before retrying.


### Latest lessons from user testing (2026-10-20)

The user confirmed that the clause-scope fix resolved the reported Halloween Muffins failure. This is user-reported evidence from a real retry, beyond the simulated regression. It confirms resolution of that failure, not an audit of every ingredient and instruction in the resulting table. The missing sugar eyes, omitted packet-drying instruction and process-water representation remain separate known limitations. The latest Autumn Cake preparation-role fix has 135 passing automated tests, but no successful real-model retry has yet been reported for that revision.

- **Inspect the allowed choices, not just the model response.** At the muffin milk step, our own rules excluded the correct choice. At the cake blanching step, they allowed two conflicting choices. Better prompting or repeating the same request cannot reliably compensate for either problem.
- **Resolve portions by their use, not their name or amount.** Two identical 50 g pistachio entries represent different allocations. Preserve both entries and their section metadata. The later use of chopped nuts in the batter can identify the earlier preparation; garnish nuts remain available for decorating. Do not merge the entries, double the quantity or pick the first entry merely because it appears first.
- **Scope language rules locally.** An observation followed by an instruction can contain both future wording and an immediate ingredient addition. A sentence-wide exclusion can suppress a valid use. Test nearby negated, conditional and genuinely future instructions when adding an affirmative rule.
- **Trace failures to the earliest wrong decision.** An unused ingredient at the final action often reflects an earlier exclusion or omission. Attaching leftovers at serving would hide the defect. Repeating a correction with unchanged choices can reproduce the same failure.
- **Exercise alternative model choices.** The earlier cake replay passed because its recorded blanching response selected only the cake portion. A real run selected both portions twice. Tests must challenge the constraints with that observed failure as well as the expected graph; replay success alone does not establish robustness.
- **Keep validation claims separate.** Valid JSON, a connected graph, a complete recipe and faithful cooking dependencies are different properties. Automated tests and simulated schema enforcement provide bounded evidence; user retries establish behavior in Chrome. Neither alone proves general recipe understanding.

The changes through `staged-v10-preparation-roles` were committed and pushed as `d1eaa98`. This lessons entry records the subsequent documentation update.


### Shorter procedure cells without changing the graph (`staged-v11-procedure-labels`)

After graph validation, an additional local-model phase selects shorter display labels. The validated recipe, action text, IDs, input order, edges, ingredient entries and layout descriptors remain unchanged. Labels are passed separately to the table renderer. The full original instruction stays in the text view and JSON, and is available as the cell's hover title and accessible label. Copied/downloaded HTML uses the compact visible labels and retains those original-text attributes. Editing or reloading Manual JSON renders its original instructions; compact labels are presentation state, not part of the graph schema. Text wrapping and physical cell sizes may change, but node placement and row/column spans do not.

This first version is deliberately bounded. Code offers an original and a compact candidate only for recognized wording reductions, such as removing an introductory recipe title or “Then”, shortening “until you obtain”, and reducing a bare ingredient-only mixing list to “Mix” when every immediate ingredient input supplies the omitted names. Amounts, partial-use qualifiers, equipment, temperatures, durations, conditions and distinct operations are not freely paraphrased. Many detailed cells will therefore remain longer than a few words. The model checks those candidates against the original and immediate inputs and returns only `keep` or `compact`, in batches of at most eight eligible procedures. It cannot supply arbitrary rewritten text or edit any graph field.

The modal reports the extra phase and the number of shortened labels. It shares the existing conversion deadline. Invalid responses, output loops or model request failures keep original wording for the remaining batches and do not consume the graph's correction allowance. Previously accepted labels can remain. User cancellation and expiry of the shared deadline still stop conversion normally. There is no extra inference request when no shortening candidate is available.

Validation: 142 automated checks pass. New tests compare the complete recipe and layout before and after the phase; check preservation of numeric, conditional and equipment details; reject invented label selections; cover optional-phase failure and cancellation; and verify that rendering changes only action-cell text while exposing the original wording. The model integration is simulated; real Chrome behavior of this additional phase still needs user testing.

Lesson: concision belongs after dependency validation and in the presentation layer. A shorter label can rely on visible inputs, but must not erase a cooking detail simply to meet a word count. Keeping the original text separately makes the reduction inspectable and avoids feeding abbreviated wording back into graph construction.


### Fixed conversion limit

The time-limit dropdown has been removed. The app now always passes a 10-minute shared conversion budget and shows that same limit in the progress dialog. Cancellation remains available. Earlier entries describing the 3/10/20-minute selector describe historical behavior.


### Reset: let the local model interpret recipes (`model-led-v1`)

The project is intended to demonstrate local language models, but successive recipe-specific fixes moved interpretation into application code. The old label phase was especially misleading: code authored shortening candidates and the model only selected between them. Replays that replaced invalid recorded answers with an allowed enum value established constraint behavior, not actual model performance.

Before changing direction, the working implementation was committed as `ad1d60d`, tagged `working-rules-v11`, and pushed. Its 142 tests passed. The tag preserves that baseline without keeping a hidden runtime fallback.

The new pipeline removes ingredient-name aliases, English cooking-verb rules, section-role matching, pronoun/parallel-preparation heuristics, fixed passage classification and candidate shortening. The model now extracts ingredient uses/roles and actions from the full source, proposes dependencies from all live inputs, and generates its own concise labels. Code retains IDs, excerpt traceability, schema/reference checks, graph integrity, deterministic layout, session cleanup and resource limits.

Generated text can now be wrong even when its source excerpt exists. Summary fidelity also requires review; length and shape checks cannot prove meaning preservation. That is an explicit model limitation to measure, not a gap to cover with another recipe-specific parser. Failed interpretation remains visible rather than being silently repaired.

Old rule-enforcement tests were removed. Mechanical lifecycle/layout tests remain, and a small real-browser evaluation runner records actual outputs, timing, correction use and structural success separately from human semantic assessment. Historical traces are retained under `evaluation/legacy-traces/`. No new real-device success is claimed before those evaluations are run and reviewed.

Lesson: keep the application responsible for structure and the model responsible for language. Evaluate the actual model on held-out recipes and report limitations honestly; a high count of tests for handwritten rules is not evidence of local-model capability.


### Reference mismatch: chronology collapsed into one material branch (`model-led-v2-material-flow`)

The supplied Banana Bread screenshot shows every action spanning all ten ingredient rows, including pan preparation and oven preheating. This layout strongly indicates that all ingredient leaves entered an early common ancestor and every later operation followed it. Without the raw response, the exact first mistaken selection cannot be established from the screenshot alone. The renderer displays the supplied dependencies; narrower columns would not restore the missing wet/dry branches.

The refactor had made every extracted instruction a graph action requiring at least one food input. It no longer let the model populate setup or ingredient preparation, despite those fields existing in the reference contract. The prompt also asked the model to attach equipment preparation to a food action. This encouraged chronology to masquerade as food flow and made all-input chains structurally valid.

The model now explicitly classifies global setup, initial per-ingredient preparations and material-processing actions. Application code assigns IDs, checks preparation references and source excerpts, and maps the returned categories to the existing schema. Linking instructions distinguish material participation from temporal order. No cooking-verb rules, recipe-specific inferred connections or hardcoded reference graph were added to runtime code. Ingredient preparation is passed to linking context, including inside intermediate results.

A contract regression supplies a model-shaped Banana Bread plan and verifies that it can reproduce the reference's exact seven-column grid, separate four-row wet and five-row dry branches, ingredient preparation cells, and final joining steps. It preserves the overmixing warning and pan-transfer instruction. This verifies representation, not local-model performance. The Banana Bread source is added to real-browser evaluation with branch-specific human review criteria. The next real run must demonstrate that the model chooses those distinctions correctly.

Lesson: removing heuristics is not sufficient; the model must receive an output contract that can express the desired result. Setup, ingredient preparation and food dependencies are different categories. A connected single-consumer tree still does not prove that the model interpreted them correctly.


### Observed dry-branch loss and all-input selection (`model-led-v3-plan-review`)

The supplied output snapshot confirms two model errors, rather than a renderer defect. The action extraction attached the entire five-ingredient dry whisking operation to flour's preparation field, leaving no dry-mixture action in the plan. The first linking response then returned `use` for all ten available ingredients. The remaining actions could only consume that already merged result, producing full-height cells. Compared with the built-in source, the draft also omitted the overmixing warning.

The next experiment adds a fixed fresh-session model review of the draft against the complete source before linking. The reviewer returns a full plan, checking classification and information coverage. Code does not identify dry ingredients or rewrite the plan using English rules. Linking now requests a selected-ID list, omitting unused candidates, instead of a repeated use/skip field for every candidate. The all-use response pattern motivated this representation change; it does not prove that enum ordering or checklist format caused the failure.

Selected-ID arrays have previously repeated in older pipelines, so generic streaming checks reject duplicate/unknown IDs and bound unfinished output. Shape, graph and resource validation remain mechanical. The reviewer can still repeat an error, and a selected-ID list can still contain every ingredient. Neither change is a semantic guarantee or a hardcoded repair.

Validation: 84 automated checks pass. The reported ingredient extraction and erroneous draft are preserved in `tests/fixtures/banana-failed-plan.json`. A test supplies that actual draft followed by an explicitly provided revised model-shaped plan, verifying that the review receives the full source and that the linker sees the revision. It does not substitute allowed schema values for recorded linking answers or claim a real-model correction. The next Chrome run must be checked for separate wet/dry branches and retained instructions. Diagnostics preserve draft, review and linking responses for comparison.


### A reviewer can introduce new errors (`model-led-v4-operation-review`)

The latest Banana Nut Bread snapshot identifies the origin of the repeated digits: the draft correctly said **55 minutes** and **10 minutes**, but the full-plan review generated **555** and **1010** while still citing the correct source phrases. These errors existed before label shortening. The visible label response in the supplied snapshot is incomplete, so it does not establish the final simplification outcome.

The reviewer also retained the five-ingredient whisking instruction as flour-only preparation. The wet-combination link correctly selected its four ingredients, but folding selected only the remaining dry ingredients and walnuts, omitting the existing wet result. That result was then joined at baking. The renderer faithfully displayed these wrong dependencies. A connected tree and a better-looking table were not evidence of correct cooking meaning.

Changes for the next experiment:

- Runtime planning now exposes only global setup and food actions. All food preparations, including single-ingredient work, go through explicit linking. Multi-ingredient work cannot hide in an ingredient preparation field. Existing demo and Manual JSON preparation cells remain supported. This can add action columns; the layout algorithm is unchanged.
- Generated numeric tokens are checked against the cited excerpt. Unsupported digits such as 555/1010 are rejected rather than quietly accepted or replaced. Optional labels must preserve all numeric tokens or retain the full wording. This is a language-independent lexical check, not a cooking rule or semantic guarantee. It does not detect all omissions, wrong units or reassigned values.
- Each proposed connection receives a fresh model audit with the full source, all available candidates and the proposed selection. The audit explicitly checks omissions as well as extra inputs before the row is frozen. This adds one request per action, shares the existing deadline and correction allowance, and may still repeat the model's error. Both selections are visible in diagnostics.

The cooking-specific English rules remain removed from active conversion: no ingredient aliases, cooking-verb matching, section allocation, pronoun heuristics or recipe-specific repairs. Model instructions are written in English; they ask the model to interpret language rather than having code match English cooking words. JSON, IDs, excerpts, numeric tokens, resource bounds and graph integrity are application responsibilities. Historical rule documentation and the explicit demo are not automatic fallbacks.

Validation: **87 automated tests pass**, and the diff whitespace check passes. Regression tests preserve the actual failed review and link outputs. They reject the recorded numeric corruption and obsolete preparation classification, and use explicitly simulated model responses to check that an input audit can restore an omitted intermediate result before the next action. Cancellation and optional-label fallback remain covered. These tests verify handling, not that Chrome's model now produces the right recipe. A real-device retry must check operation coverage (including the overmixing warning), wet/dry joining, timings and labels.


### Duplicate input was a symptom of an earlier semantic failure (`model-led-v5-input-decisions`)

The next real snapshot shows that numeric validation worked: the plan reviewer again generated 555, the guard rejected it, and the single correction restored 55. However, both the action-1 selector and its audit attached all ten ingredients to “Mash the bananas.” Every subsequent operation inherited that combined result. Action 6 then repeated its only remaining candidate, step_5. Removing the duplicate would have hidden the earlier wrong graph. The plan also still omitted the overmixing warning relative to the built-in source.

The next experiment decomposes linking into independent candidate decisions. Each fresh local-model request sees the current operation, one available candidate, the action plan and original source, and answers a boolean participation question. It sees no prior selection to agree with. Code visits each candidate once and records positive decisions as edges. This prevents duplicate-ID generation by construction, but does not prevent all-true answers or prove that the chosen edges are correct. No candidate is filtered by an English word rule, and no expected graph is substituted. Empty/disconnected decisions still fail visibly.

The cost is more requests: three planning requests plus one request per available candidate per action, plus optional label batches. All share the conversion deadline. In the explicitly simulated nine-action regression there are 53 candidate judgments; that test is not a browser speed or accuracy result. Diagnostics preserve each candidate and answer so the model's actual behavior remains inspectable. The 87 automated tests pass, including independent branch assembly, numeric correction, cancellation, and optional-label handling. A new real-browser run is needed.

**Project boundary reaffirmed:** this is a demonstration of browser-local AI interpretation. The local model must extract, correlate and structure recipe information. Runtime code must not replace that work with English cooking sentences, keyword dictionaries, ingredient aliases, semantic parsers, recipe-specific fallbacks or hidden expected answers. Natural-language prompts instruct the model; code may validate JSON, IDs, references, source citations and numeric consistency, manage resources, and render the returned graph. Those checks reject unsupported output rather than authoring a recipe. Test fixtures and the explicit demo must never be presented as successful model outputs. Further changes should be evaluated by real local-model behavior, not merely by whether the app produces a table.


### Individual answers need collective recovery (`model-led-v6-connection-reconsideration`)

The user reported `step_7: select at least one input`. The attached v5 snapshot ends during the fifth candidate request for action 4, so it does not expose step 7's candidate answers or prove its earlier graph was correct. It does show selective answers for the first three operations, unlike v4's all-input selection. The reviewer again changed 55 to 555 and used the ordinary correction to restore it.

Code inspection identified a recovery gap: each boolean response was structurally valid, but validation of the combined selection happened outside the response-correction path. A collectively empty set therefore stopped immediately. Repeating the last candidate alone would not let the model reconsider the whole relationship.

The new path allows one fresh-session whole-set reconsideration per conversion, separately from the ordinary response correction. It supplies source, plan, candidates, prior decisions, accepted edges and the validation error. The local model must select the input IDs; code never infers the previous step, selects the sole candidate, deduplicates an answer or attaches leftovers. A second invalid set or invalid reconsideration still fails. This remains an experiment in task decomposition, not a claim of corrected recipe understanding.

Validation: 92 automated tests pass, including simulated recovery at step 7 after numeric correction, model refusal, duplicate selection, a second failure, cancellation and session cleanup. Those simulated answers are not a replay of unseen step-7 output. The [pipeline diagram](pipeline.md) documents responsibilities, recovery, costs and limits. A real browser retry is still needed to establish model behavior.


## V7: isolated votes missed complete material sets

The supplied v6 Banana Nut Bread snapshot (2026-10-21) includes the failure through action 8, unlike the earlier partial snapshot. Actions 1–3 selected their intended single inputs. Action 4 selected only mashed bananas and melted butter, omitting vanilla and beaten eggs. Action 5 selected only baking soda for whisking the dry ingredients. Action 6 selected only walnuts for folding, leaving both mixtures outside the result. These nonempty sets passed structural checks. All action 7 votes were false; its reconsideration selected `step_4`, transferring only the incomplete wet mixture. All action 8 votes were false and the reconsideration budget was exhausted. The compact actual decisions are preserved in `evaluation/legacy-traces/model-led-v6-missing-inputs.json`.

The late error is a symptom of earlier semantic omissions. Increasing the reconsideration allowance or wiring the latest result automatically would not repair them. Boolean schema validity does not establish completeness, and a nonempty selection is not evidence that the operation is correctly represented. The reviewer also changed 55 to 555 again; the numeric check rejected it and the ordinary correction restored 55.

`model-led-v7-complete-action-inputs` replaces independent votes with one complete-set selection per action. Every linking request now includes the full original source, all available materials, ancestry and accepted earlier connections. No proposed answer anchors it. The model selects all inputs; application code only validates IDs and structure. The separate one-use reconsideration path is removed, while the shared ordinary correction, streaming bounds and deadline remain. This revisits selected-ID linking with richer context; prior duplicate-ID and selection failures are still relevant risks, and their guards remain.

Tests verify request context, preserved model choices, bounded correction, cancellation and recorded failure evidence. They do not demonstrate improved real-model accuracy. Wrong but structurally valid selections and omitted warnings remain possible. A fresh browser run is needed before claiming success.


## V8: small requests must not mean irreversible local decisions

Reviewing the v6 omissions and the v7 sequential design exposed a broader limitation: a plausible local edge can constrain every later step. Giving an individual request the whole recipe is not enough when earlier edges are frozen. A late failure may require moving an ingredient into an earlier mixture, not adding another retry to the last action. This resembles a local-minimum problem, but the mechanism is greedy commitment rather than numerical optimization.

The new experiment separates generation size from decision scope. `model-led-v8-global-graph-review` drafts one action's inputs at a time, then asks the local model to review and replace the entire connection matrix. Draft edges do not consume candidates; every ingredient and earlier result remains selectable. Empty draft rows and conflicting uses across rows remain visible for review. Code checks IDs and format, and offers structural feedback, but never chooses semantic repairs.

Global review runs even for a structurally valid draft. It may revise the earliest connection and must produce a complete graph satisfying the existing single-consumer contract. The app retains both draft and reviewed output, rejects an invalid final graph, and never falls back silently to the draft. The single shared correction and deadline still bound work. There is no cooking-specific vocabulary, automatic latest-result edge or recipe-specific expected graph.

This approach trades an additional, larger model request for the ability to resolve upstream mistakes. It does not guarantee accuracy: the same model may endorse omissions, introduce errors, or repeat IDs. ID-only bounded output and streaming guards limit runaway generation. Ingredient and action definitions stay fixed, so graph review cannot repair missing operations or a recipe that needs a different graph representation.

Automated tests use explicitly simulated model responses to demonstrate upstream revision after an empty draft, review of valid drafts, visible failure instead of fallback, bounded correction, cancellation and repeated-output rejection. These are orchestration guarantees, not evidence of improved local-model recipe understanding. Evaluate real draft/review pairs before claiming improvement.


## V9: draft failure must not prevent global review

The supplied v8 snapshot stopped while drafting action 5, before any global review. The first two drafts selected every available candidate, the third selected eggs and `step_2`, and the fourth again selected everything. Action 5 enumerated all candidates and then repeated `step_1` in an unfinished JSON response. The selected-ID guard stopped the repetition. Action-plan correction had already used the shared correction, so the adapter terminated the conversion. Compact raw draft outputs are preserved in `evaluation/legacy-traces/model-led-v8-draft-repetition.json`.

This exposed an orchestration gap: provisional graph review was reachable only if every draft response was individually well formed. Optional proposals should not prevent the model from attempting the complete graph. In `model-led-v9-draft-handoff`, a draft validation or selected-ID streaming error stops drafting without a retry. The complete earlier rows, failed action/error and remaining action IDs go to global review. The model generates all final rows, including the missing ones, and may replace every earlier edge. No repeated IDs are silently deduplicated, no incomplete JSON is accepted and no guessed edges are supplied.

Final graph validation stays strict. The shared correction is still bounded, and transport failures, whitespace loops, cancellation and deadlines still stop processing. Tests cover streamed duplicate/unknown IDs and malformed JSON after planning has spent the correction, plus cancellation and transport failures. They demonstrate that review is reached, not that it understands the recipe.

The snapshot also contains poor semantic proposals before the visible failure. A successful handoff does not fix those by itself; global review may be anchored by bad drafts or repeat their mistakes. The next real-model output must be examined for actual graph correctness, not merely successful completion.


## V10: name the actions instead of relying on row position

The v9 snapshot reached global review after the draft handoff, but returned `inputs` with eleven single-element rows: one for each of ten ingredients, then one containing `step_1`. The fixed plan had ten actions. This is not an extra empty row that can safely be removed: it is ingredient enumeration rather than an action-to-input interpretation. Trimming or shifting rows would invent the association. The raw response is preserved in `evaluation/legacy-traces/model-led-v9-eleven-rows.json`.

`model-led-v10-keyed-graph-review` asks for a JSON object with exactly the fixed action IDs as required keys. Each value is the model's complete input-ID selection for that action. The schema restricts each field to ingredients and earlier actions. Code translates these explicit keys into the existing ordered graph rows; it does not guess which action an anonymous row belongs to. Streaming checks reject duplicate keys, repeated input IDs, unknown IDs and oversized output. Draft handoff, global revision and strict final graph validation remain.

This removes positional row counting from the model's output task. It does not establish semantic understanding: the model could still put the wrong ingredient under a valid action key. Tests verify structural constraints, preservation of selected IDs, arbitrary JSON key order, upstream revision, bounded retries and streaming checks. A real browser run is still required to assess schema compatibility and recipe accuracy. The shared correction budget has not been increased.


## V11: express single consumption through material destinations

The v10 snapshot returned every ingredient under `step_1`, then began `step_2` with `ing_1` again. The duplicate-input guard stopped it. Explicit action keys solved positional ambiguity but did not prevent material reuse or semantic errors. Its first selection matches the bad draft; this suggests possible anchoring but does not prove its cause.

The new experiment returns one action destination per ingredient or nonfinal result. Every material is a required key with a single action-ID value; multiple materials may share a destination. The model selects all associations globally. Code only groups these edges into existing action input arrays and checks the graph. No duplicate removal, ingredient-name rules or automatic previous-step links are used. Duplicate JSON keys remain an error, and result destinations must be later actions.

Draft edges and their validation feedback are now retained only in diagnostics, not supplied to the global model. It reconstructs associations from the full source and fixed ingredient/action plan. This avoids suggesting the failed draft as an answer, but does not establish better reasoning. Draft generation remains experimental overhead for comparison. The shared correction and resource limits remain unchanged.

Tests verify destination schema constraints, multiple inputs sharing a destination, exact regrouping of model choices, duplicate-key detection across streamed chunks, upstream replacement, draft handoff and cleanup. Real-model evaluation is still needed: assigning each material once can still omit an action's inputs or attach materials to the wrong operation.


## Ingredient citations: avoid cumulative copying

The Halloween Muffins snapshot failed before graph construction. Each ingredient citation repeated most of the ingredient list preceding it. Later quotations changed unrelated numbers (eggs `110 g` became `11 g`), and the correction produced further digit repetitions in the glaze citation. Exact-source validation correctly rejected this. The corrected inventory also omitted the food decorations present in the initial response. Without the original source, the snapshot alone cannot establish the complete expected inventory.

The ingredient prompt now asks the local model to identify ingredient boundaries even in concatenated text, quote only the shortest supporting contiguous excerpt per ingredient, and keep section interpretation in the role field. It explicitly rejects cumulative copying and asks corrections to retain the complete inventory and qualifiers. Code does not split ingredients with English word rules, salvage corrupted quotations, or relax numeric/source checks. This is a prompt experiment, not a demonstrated accuracy fix.

A regression test verifies that local quotations in a concatenated list are accepted and corrupted cumulative or local quotations are rejected. These tests validate the contract; a fresh browser run is required to see whether the model follows the revised instructions. Exact quotation matching still cannot prove inventory completeness or that all qualifiers were retained.


## V12: copy each ingredient once

The next Halloween Muffins run disproved the preceding prompt experiment as a sufficient fix. Initially every source field contained only a section heading, despite detailed ingredient text. Correction reverted to cumulative quotations and corrupted digits again (`110 g` to `11 g`, among others). Orange peel, baking soda and food decorations appeared initially but were absent from the correction. More instructions about short quotations did not reliably solve the dual-field task.

`model-led-v12-ingredient-quotes` removes the separate generated ingredient source field. The model returns `{text, role}`: text is a verbatim ingredient excerpt used both for display and evidence, while role contains interpretation. Code verifies the excerpt against the original, assigns IDs and stores the same text in the downstream source context. There are no ingredient-boundary heuristics, inferred replacements, relaxed quotation matching or extra retries. Action extraction and graph interpretation are unchanged.

This reduces duplicated output and eliminates disagreement between ingredient text and its separate citation. It does not prove that an excerpt is an ingredient, that every ingredient was selected, or that qualifiers were retained. A heading is also a real source excerpt, so semantic selection remains the model's responsibility. Verbatim output also retains source order and formatting rather than producing quantity-first labels. Tests cover exact reuse, concatenated entries, changed digits, paraphrase rejection and rejection of the obsolete extra field; browser evaluation remains necessary.


## Compare engines before adding more prompt patches

Repeated extraction and graph failures do not isolate the cause to model size: prompts, schema decoding and runtime behavior also differ. The engine selector now runs Chrome and WebLLM through one shared pipeline. WebLLM initially uses Qwen2.5 7B; this is a candidate to evaluate, not an established improvement. Diagnostics identify backend, model selection, settings and browser. Adapter tests cover fresh stage histories, schema forwarding, cancellation and failure without fallback.

A fixed pipeline is a useful controlled application comparison, but not a pure model benchmark. It was tuned against Chrome; sampling presets, token budgets and schema implementations are not identical. Compare semantic correctness on unchanged sources, track startup separately, and report unsuccessful runs too. See [the comparison protocol](backend-comparison.md). Real hardware validation is still required.


## First reported WebLLM run: larger model did not resolve extraction

The user identified the Halloween Muffins run as **WebLLM · Qwen2.5 7B**. Its raw snapshot is preserved in [the evaluation trace](../evaluation/legacy-traces/webllm-qwen25-7b-muffins-extraction.txt). The snapshot itself lacked backend settings and the original submitted source; backend attribution comes from the user's confirmation. Future output snapshots now include the same run configuration as diagnostic reports.

Ingredient extraction returned ten names without quantities or qualifiers, and omitted the glaze and food decorations visible in the later model-generated source quotation. Those names passed exact-substring validation. This is direct evidence that quotation matching does not establish ingredient completeness. The generated quotation is not an independently verified copy of the submitted source.

The first action response put a long ingredient summary in setup, quoted an entire recipe as its evidence, and returned only `combine ingredients`. Correction placed nearly the whole recipe in setup, used a website URL as its source, and still returned one action. The visible setup-source mismatch was therefore a valid rejection of a broader semantic failure. Allowing URLs, fuzzy citation matching or silently salvaging this plan would not produce a faithful recipe.

This run disproves any assumption that choosing the 7B backend alone would fix the task. It does not establish whether the underlying cause is model capability, prompt format, constrained decoding or runtime behavior. Keep the common pipeline fixed for a paired Chrome run on the exact same input. Further engine-specific investigations should be labeled separately from that comparison. No semantic success or inference fix is claimed for this trace.


## Chrome comparison: shared task failure, different symptoms

The user then supplied the Chrome built-in run for Halloween Muffins. Its [raw snapshot](../evaluation/legacy-traces/chrome-muffins-extraction.txt) lacks run configuration and independently captured source; backend attribution comes from the user. Treat these two runs as an exploratory comparison, not a reproducible benchmark with verified identical inputs/settings.

| Observation | WebLLM / Qwen2.5 7B | Chrome built-in |
| --- | --- | --- |
| Ingredient output | Ten ingredient names, no quantities; no decorations | 23 entries, mostly alternating names and detached quantities |
| Initial actions | One generic `combine ingredients` action | 22 rows, many action values literally `complete instruction` or `complete` |
| Setup | Ingredient summary with an entire-recipe quotation | Food operation; correction expanded to 19 cooking-operation entries |
| Evidence corruption | Correction supplied a URL as quotation | Altered words and digits; initial bake quotation says `3500°f` |
| Outcome | Rejected during action extraction | Rejected during action extraction |

Chrome's correction duplicates operations between setup and actions and introduces further omissions and number changes. The reported `setup 8 source` mismatch is merely the first detected error in that response, not the sole defect. The ingredient output passed substring checks despite separating material names from their quantities. Neither backend produced a usable recipe.

The literal `complete instruction` matches an illustrative value in the action system prompt. This is evidence of placeholder copying and a concrete weakness of that prompt format; it is not proof that the placeholder explains all other failures. Neither model size nor strict JSON shape establishes semantic extraction quality.

The next controlled investigation should isolate extraction before running graph construction: compare ordinary text extraction against constrained JSON on the same captured input, and separately remove illustrative placeholder values from prompts. Change one factor at a time and preserve outputs. Do not weaken source/numeric validation, merge detached quantities using cooking heuristics, or claim a successful fix based on simulated tests. The production pipeline remains unchanged for this observation.

The consolidated [takeaways and proposed extraction experiment](backend-comparison.md#what-we-learned) separate observed failures from hypotheses and describe how to test the next change without confounding it with a new backend or graph pipeline.


## Allow more inference time for WebLLM

A reported WebLLM timeout prompted increasing its UI conversion budget from 10 to 20 minutes; Chrome remains at 10 minutes. The report did not identify the failing stage, so this is a resource-budget adjustment rather than a diagnosed model fix. Initialization still has its separate progress-refreshed inactivity timer. Compare run quality and elapsed time separately, and record the unequal deadlines rather than treating completion rates as an equal-budget benchmark.


## A shared deadline is not a stage duration; snapshots must be current

A WebLLM/Qwen2.5 7B run reported that the shared 20-minute budget expired during global graph interpretation. The [attached snapshot](../evaluation/legacy-traces/webllm-banana-20min-snapshot.txt) identifies a 986-character Banana Nut Bread source, v12, WebLLM 0.2.86, temperature 0, a 16K context and a 4096-token response limit. It ends partway through action-plan review, with no graph request or timing history. It cannot establish how long graph interpretation ran, whether it repeated, or whether initialization or generation dominated that stage. The deadline covers the full conversion after initial readiness, not twenty minutes per stage.

The visible ingredient list retains quantities. The initial action response lists several operations but uses nonverbatim citations; its correction collapses the plan to one literal `complete instruction` action and copies the whole source into setup/evidence. That corrected draft passed the mechanical checks, demonstrating again that source matching is not semantic validation. The later reviewed plan is absent, so the draft cannot be assumed to be the final graph input.

The snapshot UI previously captured output only on Show/Refresh. Copying it after a failure could therefore send an earlier state. It now refreshes on copy and console print, and refreshes an open snapshot when conversion stops. Snapshots also include current status and timing history. No deadline increase, graph inference change or semantic fix is claimed. Inspect the fresh terminal snapshot before attributing the timeout to a graph loop or raising resource limits again.


## WebLLM budget extended to 30 minutes

At the user's request after another timeout, WebLLM's shared conversion budget increased from 20 to 30 minutes. Chrome remains at 10 minutes. Initialization and output guards are unchanged. This grants more execution time; it does not establish improved extraction accuracy or diagnose the previous timeout.


## Completed WebLLM graph: skipped preparations and unused drafting cost

The [30-minute-budget Banana Nut Bread run](../evaluation/legacy-traces/webllm-banana-empty-inputs.txt) failed validation after 1168.6 seconds (19 minutes 28.6 seconds), not a timeout. Its final graph request took 100.3 seconds. This particular run did not require more than twenty minutes; variability prevents concluding why the earlier run timed out.

The reviewed plan recovered nine actions but retained the entire recipe as setup and classified pan preparation as a food-result action. The graph assigned no inputs to steps 1–4: pan preparation, banana mashing, butter melting and egg beating. It routed ingredients directly to later operations, split dry ingredients between whisking and folding, and sent walnuts to baking. The first reported empty-input error is not the sole defect. Removing step 1 or inventing links would not fix the recipe.

Provisional linking consumed approximately 538.8 seconds, or nine minutes and 46% of elapsed time. Since v11 excludes those proposals from final inference, drafting now supplies diagnostic evidence only. Removing it from both backends is a concrete latency experiment, not a semantic fix. Record that as a new comparison condition.

Action classification/completeness and global graph interpretation still need separate investigation. The shared correction was already spent on action extraction; no graph correction remained. Changing this budget must be explicit. Do not attach unrelated ingredients, silently remove actions or assume more time will improve interpretation.


## V13: direct graph generation with a reserved correction

The runtime now skips all provisional linking requests on both engines. These drafts were excluded from final inference yet consumed about nine minutes in the recorded run. Normal conversion now uses four core requests plus label batches, independent of action count. This removes known overhead; no specific speedup on a new run is promised.

Extraction and plan review retain one shared correction; global graph interpretation has one separate correction. Completed invalid graph output and structural feedback are supplied to the model, including all empty action IDs. Streaming failures retain feedback without accepting partial edges. The application never invents links. Further invalid graph output still fails visibly.

Action prompts remove illustrative placeholder strings and explain that equipment-only setup is separate from food-result actions, with no whole-recipe setup or duplicated operations. No source keyword heuristics were added. Fixed-plan omissions can still make a faithful graph impossible, and structural success still does not establish semantic quality.

This is a combined change to call count, prompts and correction budget. It is not the previously proposed single-factor experiment. Tests verify no draft calls, independent bounded correction, prior-response feedback, empty-action reporting and cleanup; real browser runs must measure accuracy and latency. The pipeline identifier is `model-led-v13-direct-graph`.


## Experimental checkpoint — 2026-10-25

This checkpoint saves the accumulated transition from the tagged rule-based baseline to the v13 model-led experiment. It includes Chrome/WebLLM selection, verbatim ingredient extraction, direct global material destinations, separate bounded graph correction, numeric/source checks, refreshed diagnostic snapshots and documented failed browser runs. The old cooking-specific runtime modules are removed; the earlier working baseline remains available under `working-rules-v11`.

Validation: 112 automated tests cover structural contracts, orchestration, adapters and cancellation. They do not establish semantic recipe accuracy. The latest observed v12 WebLLM run failed graph validation; v13 still needs real-browser evaluation. This checkpoint is not labeled a working or accuracy-validated release.


## V13 Chrome: whitespace loop in action correction

The [Halloween Muffins trace](../evaluation/legacy-traces/chrome-v13-muffins-whitespace.txt) records Chrome 155, most-predictable sampling, schema guidance enabled, a 2622-character source and the v13 pipeline. The initial ingredient output passed mechanical checks but split names and quantities into 23 entries. The initial action response misplaced food operations in setup and altered source quotations and numbers. Validation rejected its first action citation at 35.5 seconds.

The fresh correction session emitted an unfinished object ending in a source value of `source:`, followed by tabs and other whitespace. The 512-consecutive-whitespace guard stopped the conversion at 51.4 seconds, with 632 characters received in 547 chunks. This was neither the ten-minute deadline nor a completed JSON response followed by harmless trailing whitespace. No graph request occurred; the reserved graph correction cannot address this earlier failure.

The trace shows that v13's graph changes and removal of illustrative action placeholders did not resolve extraction on this input. It does not prove that constrained decoding caused the loop. Preserve the guard and source checks; increasing the whitespace allowance or time budget would not repair the already incorrect interpretation. The proposed extraction-only comparison of constrained and unconstrained output remains the next diagnostic experiment, with source, backend and settings recorded and one factor changed at a time. No runtime behavior was changed for this observation.


## V14: compare native JSON enforcement without changing validators

The Chrome v13 whitespace loop motivates a controlled switch, not an assumption that grammar constraints caused the failure. Both engines now support extraction with or without native JSON enforcement. Both modes receive the same prompts and explicit output schema, still request JSON and use strict parsing, source/numeric checks and the same bounded correction. Graph and label stages remain constrained. Reports identify the condition per request.

This is an enforcement comparison rather than free-form prose extraction. Adding explicit schema text also changes the baseline from v13, so use matched v14 runs to interpret results. Automated tests verify prompt equality, option omission, validation and WebLLM request translation; actual model quality remains unmeasured for these conditions.
