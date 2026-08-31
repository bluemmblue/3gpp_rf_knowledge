export interface GraphNode {
  id: string;
  type: 'Procedure' | 'Message' | 'Parameter' | 'Formula' | 'Symptom';
  layer: 'base' | 'application';
  name_ko: string;
  name_en: string;
  description: string;
  specRef?: string;
  verified?: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: 'contains' | 'triggers' | 'uses_parameter' | 'computed_by' | 'affects' | 'causes' | 'explained_by' | 'mitigated_by';
  note?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const GRAPH_KEY = 'graph:v1';

export async function getGraph(kv: KVNamespace): Promise<Graph> {
  const stored = await kv.get<Graph>(GRAPH_KEY, 'json');
  return stored ?? { nodes: [], edges: [] };
}

export async function saveGraph(kv: KVNamespace, graph: Graph): Promise<void> {
  await kv.put(GRAPH_KEY, JSON.stringify(graph));
}

function upsertById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export async function addNodes(kv: KVNamespace, nodes: GraphNode[]): Promise<Graph> {
  const graph = await getGraph(kv);
  graph.nodes = upsertById(graph.nodes, nodes);
  await saveGraph(kv, graph);
  return graph;
}

export async function addEdges(kv: KVNamespace, edges: GraphEdge[]): Promise<Graph> {
  const graph = await getGraph(kv);
  graph.edges = upsertById(graph.edges, edges);
  await saveGraph(kv, graph);
  return graph;
}
