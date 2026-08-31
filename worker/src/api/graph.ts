import type { Env } from '../index';
import { getGraph } from '../lib/graphStore';

export async function handleGraph(_request: Request, env: Env): Promise<Response> {
  const graph = await getGraph(env.GRAPH_KV);
  return Response.json(graph);
}
