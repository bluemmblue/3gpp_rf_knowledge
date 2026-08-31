import type { Env } from '../index';
import { addNodes, addEdges, type GraphNode, type GraphEdge } from '../lib/graphStore';

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function handleSave(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!isAuthorized(request, env)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request
    .json<{ nodes?: GraphNode[]; edges?: GraphEdge[] }>()
    .catch(() => ({}) as { nodes?: GraphNode[]; edges?: GraphEdge[] });

  let nodeCount: number | undefined;
  let edgeCount: number | undefined;

  if (body.nodes?.length) {
    const graph = await addNodes(env.GRAPH_KV, body.nodes);
    nodeCount = graph.nodes.length;
    edgeCount = graph.edges.length;
  }
  if (body.edges?.length) {
    const graph = await addEdges(env.GRAPH_KV, body.edges);
    nodeCount = graph.nodes.length;
    edgeCount = graph.edges.length;
  }

  if (nodeCount === undefined && edgeCount === undefined) {
    return Response.json({ error: 'nodes or edges required' }, { status: 400 });
  }

  return Response.json({ ok: true, nodeCount, edgeCount });
}
