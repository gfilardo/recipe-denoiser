export const WEBLLM_MODEL = 'Qwen2.5-7B-Instruct-q4f16_1-MLC';
export const WEBLLM_VERSION = '0.2.86';
export const WEBLLM_SETTINGS = {temperature:0, contextWindow:16384, maxTokens:4096};

// One worker per conversion, fresh message history per stage. No recipe interpretation here.
export function createWebLLMBackend({workerFactory = () => new Worker(new URL('./webllmWorker.js', import.meta.url), {type:'module'})} = {}) {
  let worker, pending, active, sequence = 0;
  function stop(reason = new DOMException('Local inference stopped', 'AbortError')) {
    worker?.terminate(); worker = null;
    const load = pending; pending = null; load?.reject(reason);
    const stream = active; active = null; stream?.error(reason);
  }
  async function load(progress) {
    if (worker && !pending) return;
    if (pending) return pending.promise;
    worker = workerFactory();
    const promise = new Promise((resolve,reject) => { pending = {resolve,reject}; });
    pending.promise = promise;
    worker.onmessage = ({data}) => {
      if (data.type === 'progress') progress(data.progress);
      else if (data.type === 'ready') { const p=pending; pending=null; p?.resolve(); }
      else if (data.type === 'error') stop(new Error(data.message));
      else if (active && data.id === active.id) {
        if (data.type === 'chunk') active.enqueue(data.text);
        if (data.type === 'done') { const s=active; active=null; s.close(); }
      }
    };
    worker.onerror = event => stop(new Error(event.message || 'WebLLM worker failed to load. Check network access and WebGPU support.'));
    worker.postMessage({type:'load',model:WEBLLM_MODEL,settings:WEBLLM_SETTINGS});
    return promise;
  }
  return {
    dispose: stop,
    async create({initialPrompts,signal,monitor}) {
      signal?.throwIfAborted();
      let listener = () => {};
      monitor?.({addEventListener(type,fn) { if(type === 'downloadprogress') listener=fn; }});
      const abort = () => stop(signal.reason);
      signal?.addEventListener('abort',abort,{once:true});
      try { await load(progress => listener({loaded:progress})); signal?.throwIfAborted(); }
      catch(error) { signal?.removeEventListener('abort',abort); throw error; }
      let owned;
      return {
        promptStreaming(prompt,{responseConstraint}) {
          if(active) throw Error('A WebLLM request is already running.');
          signal?.throwIfAborted();
          const id=++sequence; owned=id;
          return new ReadableStream({
            start(controller) {
              active={id,enqueue:v=>controller.enqueue(v),close:()=>controller.close(),error:e=>controller.error(e)};
              worker.postMessage({type:'generate',id,messages:[...initialPrompts,{role:'user',content:prompt}],schema:responseConstraint});
            },
            cancel() { if(active?.id===id) { active=null; stop(); } }
          });
        },
        destroy() { signal?.removeEventListener('abort',abort); if(active?.id===owned) stop(); }
      };
    }
  };
}
