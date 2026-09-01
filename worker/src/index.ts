import { handleGraph } from './api/graph';
import { handleAsk } from './api/ask';

export interface Env {
  GRAPH_KV: KVNamespace;
  AI: Ai;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/graph') return handleGraph(request, env);
    if (url.pathname === '/api/ask') return handleAsk(request, env);

    return env.ASSETS.fetch(request);
  },
};
