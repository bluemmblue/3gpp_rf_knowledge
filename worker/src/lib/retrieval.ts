import type { Graph, GraphNode } from './graphStore';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function searchNodes(graph: Graph, query: string, limit = 5): GraphNode[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = graph.nodes.map((node) => {
    const haystack = tokenize(`${node.name_ko} ${node.name_en} ${node.description}`);
    const score = tokens.reduce((acc, token) => {
      const hit = haystack.some((word) => word.includes(token) || token.includes(word));
      return acc + (hit ? 1 : 0);
    }, 0);
    return { node, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.node);
}

export function expandSubgraph(graph: Graph, seedIds: string[], hops = 2): Graph {
  const nodeIds = new Set(seedIds);
  const edgeIds = new Set<string>();

  for (let hop = 0; hop < hops; hop++) {
    for (const edge of graph.edges) {
      if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.from);
        nodeIds.add(edge.to);
      }
    }
  }

  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => edgeIds.has(edge.id)),
  };
}
