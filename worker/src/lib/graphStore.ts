export interface GraphNode {
  id: string;
  type: 'Procedure' | 'Message' | 'Parameter' | 'Formula' | 'Symptom' | 'Implementation';
  layer: 'base' | 'application' | 'vendor';
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

