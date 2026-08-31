import { handleGraph } from './api/graph';
import { handleAsk } from './api/ask';
import { handleCurate } from './api/curate';
import { handleSave } from './api/save';

export interface Env {
  GRAPH_KV: KVNamespace;
  AI: Ai;
  ASSETS: Fetcher;
  ADMIN_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/graph') return handleGraph(request, env);
    if (url.pathname === '/api/ask') return handleAsk(request, env);
    if (url.pathname === '/api/curate') return handleCurate(request, env);
    if (url.pathname === '/api/nodes' || url.pathname === '/api/edges') {
      return handleSave(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
