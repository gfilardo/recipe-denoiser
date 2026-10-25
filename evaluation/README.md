# Real local-model evaluation

[README](../README.md) · [Architecture](../docs/architecture.md)

`cases.json` is a small, fixed smoke-evaluation set, not a benchmark score. It covers independent preparations, distinct same-name portions, Spanish instructions and detail-preserving summaries. Do not tune code around these recipes. Add unseen recipes and review outputs before claiming generalization. `legacy-traces/` preserves source fixtures and model responses from earlier rule-based and model-led experiments; they are historical evidence, not evidence of success for the new pipeline.

On the served app, in an eligible Chrome environment, run this in DevTools:

```js
const {runEvaluation} = await import('./evaluation/run-in-browser.js');
const cases = await (await fetch('./evaluation/cases.json')).json();
const controller = new AbortController();
const report = await runEvaluation(cases, {
  signal: controller.signal,
  onCase: result => console.log(result.id, result.structuralSuccess, result.elapsedMs)
});
console.log(report);
```

Model initialization can require a user gesture or download. If the console run cannot initialize, convert the cases individually with the app's Convert button and save its diagnostic snapshots. Use `controller.abort()` to cancel a running evaluation. Each case shares a ten-minute budget. No report is uploaded automatically. Preserve browser version, OS, hardware, flags/model details and the raw outputs with each report; `userAgent` alone does not identify the model or hardware.

For each case, manually score ingredient/quantity coverage, operation coverage, portion allocation, parallel dependencies and label fidelity against `review`. Record omissions and changed facts even when the graph validates. Separate first-pass structural success, correction use, latency and human semantic assessment. This runner never substitutes an expected answer for a model answer and never automatically assigns a semantic pass. No real-model result is claimed for the new pipeline until such a report has been reviewed.


The default console runner uses Chrome and a ten-minute budget. The page selector additionally supports WebLLM with a thirty-minute budget. These limits differ; record them explicitly. Current v13 runs direct graph interpretation with no provisional drafting and reserves one graph correction independently of extraction/plan correction. See [the comparison protocol](../docs/backend-comparison.md).
