# Provisional drafts and global graph review

> Historical design (v8–v12). V13 removes provisional drafting and reserves a separate graph correction. See [the current pipeline](pipeline.md).

[README](../README.md) · [Full pipeline](pipeline.md) · [Architecture](architecture.md) · [Lessons learned](lessons-learned.md)

This document explains the connection strategy in **`model-led-v11-material-destinations`**. The [full pipeline diagram](pipeline.md) covers extraction through rendering; the sequence diagram here shows what the application and local model exchange while building the graph.

## Why local decisions remain provisional

A connection can look plausible by itself and still prevent a correct interpretation of later actions. If an early mixing step omits an ingredient, connecting the final baking step cannot repair that omission. A retry limited to the failing action has the same restriction.

The earlier implementation committed each action's connections immediately. The current approach separates **small generation tasks** from **final decisions**: the model drafts inputs action by action, then independently interprets the complete graph. Earlier edges remain changeable until global review succeeds.

This is not a numerical optimization algorithm or a guarantee of escaping a local minimum. It gives the model permission and context to revise decisions that a greedy workflow would freeze.

## The conversation between application and model

Each model request uses a fresh browser-local session. “Local model” below represents those separate sessions, not a persistent chat memory. The application explicitly includes the required context in each request.

```mermaid
sequenceDiagram
    autonumber
    participant App as Application
    participant Model as Browser-local model
    participant Check as Structural validation
    participant UI as Recipe table and diagnostics

    Note over App,Model: Ingredient entries and action plan have already been extracted and reviewed
    loop Draft actions until complete or the first unusable response
        App->>Model: Source, action plan, all ingredients, earlier results and provisional edges
        Model-->>App: Proposed input IDs for this action
        App->>Check: Check draft shape, IDs and streaming bounds
        alt Usable draft row
            Check-->>App: Retain provisionally, including empty rows or cross-row conflicts
        else Malformed, unknown, duplicate or oversized selection
            Check-->>App: Stop drafting; record failed action and completed prefix
            Note over App,Model: Hand off early; do not retry or salvage the failed row
        end
    end

    App->>Check: Inspect complete or partial draft for structural issues
    Check-->>App: First issue, if present; no inferred repair
    App->>Model: Full source, fixed actions and ingredients; no proposed edges
    Note over App,Model: Global model reconstructs all edges independently of the draft
    Model-->>App: One consuming action ID per ingredient or nonfinal result
    App->>Check: Validate exact keys, references, single consumption and connected tree
    opt Invalid graph and the shared correction is still available
        App->>Model: Original global-review request plus validation feedback
        Model-->>App: Complete replacement destination map
        App->>Check: Validate replacement
    end
    alt Reviewed graph passes structural checks
        App->>UI: Preserve reviewed graph; proceed to optional labels and rendering
    else Reviewed graph remains invalid
        App->>UI: Keep failure and snapshots visible; do not display the draft as a result
    end
```

The early-handoff path applies to draft response validation and selected-ID streaming failures. Browser/transport errors, whitespace-loop limits, cancellation and deadline expiry still stop conversion. They are not hidden by the diagram's handoff path.

## What is provisional, and what is fixed?

| Data | During drafting | During global review |
| --- | --- | --- |
| Original recipe | Supplied as evidence | Supplied again as evidence |
| Ingredient entries and quantities | Fixed | Fixed |
| Action IDs, wording and order | Fixed | Fixed |
| Connection choices | Tentative; do not consume candidates | Any draft edge may be replaced |
| Missing or conflicting connections | Retained or reported for review | Must be resolved before acceptance |
| Short display labels | Not generated yet | Generated only after graph acceptance |

Each draft request offers every ingredient and every earlier action result, including candidates selected by previous draft rows. That prevents an early proposal from making a later candidate unavailable. It also means drafts can conflict: the final model pass reconstructs the associations from the source rather than the application choosing which proposal wins. Drafts remain visible for comparison but are not included in that request.

The global phase cannot invent a missing cooking operation or change an ingredient amount. Those require changes to the fixed interpretation, outside this phase. The single-consumer tree contract also remains: it does not support arbitrary shared dependencies.

## Why the global response assigns destinations

Positional arrays produced the wrong row count. Explicit action keys removed row ambiguity, but the model then assigned all ingredients to the first action and reused them in the next. The response repeated the bad draft's pattern; the snapshot does not establish whether copying, task confusion or model limitations caused it.

The current format expresses the existing single-consumer rule directly. Each ingredient and nonfinal result is a required key, with one action ID as its destination. For an illustrative two-action plan:

```json
{
  "ing_1": "step_1",
  "ing_2": "step_1",
  "step_1": "step_2"
}
```

Here both ingredients go to the first action, and that action's result goes to the second. The final result has no destination and is not a key. This is a format example, not a recipe-specific fallback. Code groups the chosen destinations into action inputs without inferring any association. JSON key order cannot change which action consumes a material.

The schema requires every nonfinal material once and permits only later destinations for results. Streaming guards detect duplicate keys before JSON parsing can overwrite them. Many materials may share a destination. Final validation still rejects actions without inputs, disconnected graphs and incompatible references. A structurally valid destination map can still describe the wrong recipe.

Draft evidence is kept separately from the global request. The global model sees the original recipe and fixed interpretation, not the earlier proposed edges. This permits comparison of drafts against an independent interpretation while avoiding a suggested answer. The extra drafting requests remain experimental overhead; their usefulness must be measured.

## Responsibility and recovery boundaries

The model interprets portions, references, mixtures and material flow. The application supplies identities, enforces structure and resource limits, preserves diagnostics and renders the result. There are no English cooking dictionaries or recipe-specific edge repairs in this path.

Draft failures do not spend a local correction. Global review is a normal stage, even when the draft appears structurally valid. One response-validation correction is shared across the conversion; planning may already have spent it. An invalid global response therefore does not always get another attempt.

A complete run uses **4 + A + K** requests: ingredient extraction, action planning, plan review, A draft requests, global graph review and K optional label batches. Early draft handoff skips subsequent draft requests. The shared correction can add one request. The UI's ten-minute inference deadline includes these stages; initial startup has a separate two-minute limit.

## How to judge whether it helps

Compare the provisional draft with the reviewed graph in the output snapshot. Check whether review fixes upstream omissions, preserves independent preparations and connects the intended mixtures. Also check for regressions: a reviewer can endorse a bad draft or replace a good edge with a wrong one.

Successful validation proves the graph satisfies the application's structural contract. It does not prove recipe accuracy. Automated tests cover upstream revision, incomplete drafts, explicit action identity, failure handling and cleanup using simulated model responses. Real browser runs are needed to establish whether this strategy improves interpretation. See the [evaluation guide](../evaluation/README.md).
