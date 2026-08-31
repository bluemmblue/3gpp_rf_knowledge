import type { Env } from '../index';
import { getGraph } from '../lib/graphStore';
import { searchNodes, expandSubgraph } from '../lib/retrieval';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await request.json<{ question?: string }>().catch(() => ({}) as { question?: string });
  const question = body.question;
  if (!question || typeof question !== 'string') {
    return Response.json({ error: 'question is required' }, { status: 400 });
  }

  const graph = await getGraph(env.GRAPH_KV);
  const seeds = searchNodes(graph, question, 5);

  if (seeds.length === 0) {
    return Response.json({
      answer: '그래프에서 관련 노드를 찾지 못했습니다. 다른 키워드로 질문해 보세요.',
      nodes: [],
      edges: [],
    });
  }

  const subgraph = expandSubgraph(
    graph,
    seeds.map((node) => node.id),
    2,
  );

  const context = subgraph.nodes
    .map((node) => {
      const ref = node.layer === 'base' ? `, ${node.specRef ?? '조항 미상'}` : '';
      return `- [${node.id} | ${node.type}${ref}] ${node.name_ko}(${node.name_en}): ${node.description}`;
    })
    .join('\n');

  const relations = subgraph.edges
    .map((edge) => `- ${edge.from} --${edge.relation}--> ${edge.to}${edge.note ? ` (${edge.note})` : ''}`)
    .join('\n');

  const prompt = `다음은 3GPP 셀룰러 RF 지식 그래프에서 질문과 관련된 노드와 관계입니다.

[노드]
${context}

[관계]
${relations}

위 정보만 근거로 다음 질문에 한국어로 간결하게 답하세요. 답변 마지막에 근거로 사용한 노드 id를 괄호로 표기하세요. 그래프에 없는 내용은 추측하지 말고 정보가 부족하다고 답하세요.

질문: ${question}`;

  const aiResponse = await env.AI.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
  });

  const answer = typeof aiResponse === 'object' && aiResponse !== null && 'response' in aiResponse
    ? (aiResponse as { response: string }).response
    : String(aiResponse);

  return Response.json({
    answer,
    nodes: subgraph.nodes,
    edges: subgraph.edges,
  });
}
