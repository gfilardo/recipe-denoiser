// Pinned dependency; downloaded only when the user starts a WebLLM conversion.
import {CreateMLCEngine} from 'https://esm.run/@mlc-ai/web-llm@0.2.86';
let engine, settings;
self.onmessage = async ({data}) => {
  try {
    if(data.type === 'load') {
      settings=data.settings;
      engine=await CreateMLCEngine(data.model, {initProgressCallback: p=>self.postMessage({type:'progress',progress:p.progress})}, {context_window_size:settings.contextWindow});
      self.postMessage({type:'ready'});
    } else if(data.type === 'generate') {
      await engine.resetChat();
      const output=await engine.chat.completions.create({messages:data.messages,stream:true,temperature:settings.temperature,max_tokens:settings.maxTokens,
        response_format:{type:'json_object',schema:JSON.stringify(data.schema)}});
      for await(const chunk of output) {
        const choice=chunk.choices[0];
        if(choice?.finish_reason === 'length') throw Error('WebLLM reached its 4096-token response limit; incomplete output was discarded.');
        if(choice?.delta?.content) self.postMessage({type:'chunk',id:data.id,text:choice.delta.content});
      }
      self.postMessage({type:'done',id:data.id});
    }
  } catch(error) { self.postMessage({type:'error',message:error.message || String(error)}); }
};
