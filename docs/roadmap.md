# Roadmap and original acceptance plan

[Back to README](../README.md) · [Architecture](architecture.md)

The standalone app exists. These are the original implementation gates and future extension design, not a claim that every acceptance check has been completed. No extension is currently packaged. See the [test and field evidence](lessons-learned.md) for verification limits.

## Objective and delivery order

Build a standalone, client-side HTML application first, then reuse its editor, AI adapter, validation, and renderer in a Chrome extension. Convert noisy recipe prose into the left-to-right dependency table in the supplied Banana Nut Bread reference image. Recipe processing stays on-device; no backend or cloud AI fallback.

The standalone MVP is implemented. This document preserves the original delivery plan and remaining extension work.

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
