import {convertRecipe} from '../src/aiService.js';

// Run explicitly on an eligible browser. No fake responses or repaired choices.
// Reports are returned to the caller and are never uploaded.
export async function runEvaluation(cases, {signal, onCase = () => {}, ...options} = {}) {
  const results=[];
  for(const entry of cases) {
    signal?.throwIfAborted();
    const events=[],outputs=[],start=performance.now();
    let labels={};
    try {
      const recipe=await convertRecipe(entry.source,{...options,signal,
        inferenceTimeoutMs:options.inferenceTimeoutMs ?? 600000,
        onProcedureLabels:value=>{labels=value;},
        onDiagnostic:event=>{
          // Completed/error responses remain available without storing every
          // cumulative streaming chunk (quadratic memory on long responses).
          if(event.type==='output') return;
          if(event.type==='response') outputs.push({stage:event.stage,attempt:event.attempt,text:event.text});
          events.push(event);
        }});
      results.push({id:entry.id,source:entry.source,structuralSuccess:true,recipe,labels,outputs,
        elapsedMs:performance.now()-start,corrections:events.filter(e=>e.type==='correction').length,
        review:entry.review,semanticReview:'not assessed',events});
    } catch(error) {
      signal?.throwIfAborted();
      results.push({id:entry.id,source:entry.source,structuralSuccess:false,error:error.message,
        elapsedMs:performance.now()-start,outputs,events,review:entry.review,semanticReview:'not assessed'});
    }
    onCase(results.at(-1));
  }
  return {pipeline:'model-led-v13-direct-graph',browser:navigator.userAgent,recordedAt:new Date().toISOString(),results};
}
