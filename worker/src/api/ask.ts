import type { Env } from '../index';
import { getGraph, type Graph, type GraphNode } from '../lib/graphStore';
import { searchNodes, expandSubgraph } from '../lib/retrieval';

const MODEL = '@cf/google/gemma-4-26b-a4b-it';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function extractAnswer(aiResponse: unknown): string {
  if (typeof aiResponse === 'string') return aiResponse;
  if (aiResponse && typeof aiResponse === 'object') {
    const obj = aiResponse as Record<string, unknown>;
    if (typeof obj.response === 'string') return obj.response;
    const choices = obj.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
  }
  return String(aiResponse);
}

/**
 * 그래프 관계를 근거로 후속 질문 후보를 만든다. LLM 추가 호출 없이 즉시 생성되고,
 * 관계 타입에 맞는 자연스러운 질문이 나오도록 템플릿을 나눠 쓴다.
 */
function buildSuggestions(graph: Graph, subgraph: Graph, seedIds: string[], asked: string[]): string[] {
  if (!seedIds.length) return [];

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seedSet = new Set(seedIds);
  const askedText = asked.join(' ').toLowerCase();
  const suggestions: string[] = [];
  const usedTargets = new Set<string>();

  const phrase = (edge: { relation: string }, from: GraphNode, to: GraphNode): string | null => {
    switch (edge.relation) {
      case 'explained_by':
        return `${to.name_ko}가 ${from.name_ko}로 이어지는 과정을 더 자세히 설명해줘`;
      case 'causes':
        return `${from.name_ko}가 ${to.name_ko}를 유발하는 조건은 뭐야?`;
      case 'mitigated_by':
        return `${to.name_ko}로 ${from.name_ko}를 어떻게 완화할 수 있어?`;
      case 'computed_by':
        return `${to.name_ko}는 어떻게 계산돼?`;
      case 'uses_parameter':
        return `${to.name_ko}는 어떤 값이고 어디에 영향을 줘?`;
      case 'contains':
        return to.type === 'Procedure' || to.type === 'Message'
          ? `${to.name_ko}의 동작 흐름을 알려줘`
          : `${to.name_ko}에 대해 더 알려줘`;
      case 'affects':
        return `${from.name_ko}가 ${to.name_ko}에 어떤 영향을 줘?`;
      default:
        return null;
    }
  };

  for (const edge of subgraph.edges) {
    if (suggestions.length >= 3) break;

    // seed에서 뻗어나가는 관계만 후보로 삼는다
    const fromSeed = seedSet.has(edge.from);
    const toSeed = seedSet.has(edge.to);
    if (fromSeed === toSeed) continue;

    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const target = fromSeed ? to : from;
    if (seedSet.has(target.id) || usedTargets.has(target.id)) continue;
    // 이미 대화에서 다룬 주제는 건너뛴다
    if (askedText.includes(target.name_ko.toLowerCase())) continue;

    const text = phrase(edge, from, to);
    if (!text) continue;

    usedTargets.add(target.id);
    suggestions.push(text);
  }

  return suggestions;
}

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await request
    .json<{ messages?: ChatMessage[] }>()
    .catch(() => ({}) as { messages?: ChatMessage[] });

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages is required' }, { status: 400 });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) {
    return Response.json({ error: 'no user message found' }, { status: 400 });
  }

  const graph = await getGraph(env.GRAPH_KV);
  const seeds = searchNodes(graph, lastUser.content, 8);
  const subgraph = seeds.length
    ? expandSubgraph(
        graph,
        seeds.map((node) => node.id),
        2,
      )
    : { nodes: [], edges: [] };

  const context = subgraph.nodes.length
    ? subgraph.nodes
        .map((node) => {
          const ref = node.layer === 'base' ? `, ${node.specRef ?? '조항 미상'}` : '';
          return `- [${node.id} | ${node.type}${ref}] ${node.name_ko}(${node.name_en}): ${node.description}`;
        })
        .join('\n')
    : '(현재 질문과 직접 매칭되는 노드를 찾지 못함)';

  const relations = subgraph.edges.length
    ? subgraph.edges
        .map((edge) => `- ${edge.from} --${edge.relation}--> ${edge.to}${edge.note ? ` (${edge.note})` : ''}`)
        .join('\n')
    : '(없음)';

  const systemPrompt = `당신은 3GPP 셀룰러 RF 지식 그래프를 근거로 대화하는 RF 엔지니어 보조입니다. 사용자와 여러 turn에 걸쳐 대화를 이어갑니다.

가장 최근 사용자 질문과 관련된 그래프 노드/관계:

[노드]
${context}

[관계]
${relations}

답변 원칙:
1. 위 노드와 관계를 최대한 서로 연결하고 조합해서 적극적으로 설명을 구성하세요. 완벽히 맞는 노드가 없어도 관련 노드들의 인과관계(causes/explained_by/affects 등)를 이어붙여 합리적으로 추론하세요.
2. "정보가 부족합니다"는 최후의 수단입니다. 관련 노드가 하나라도 있으면 그것으로 답을 만드세요.
3. 스펙 조항 번호(specRef)나 구체적 수치는 노드에 실제로 적힌 내용만 인용하고 새로 만들어내지 마세요.
4. 한국어로, 실무 엔지니어가 바로 이해할 수 있게 간결하면서도 인과관계가 드러나게 답하세요.
5. 이전 대화 맥락을 기억하고 자연스럽게 이어서 답하세요.
6. 서식은 마크다운만 사용하세요: 강조는 **굵게**, 목록은 "- ", 파라미터·수식 이름은 \`백틱\`으로 감싸세요.
7. LaTeX 문법은 절대 쓰지 마세요. \\rightarrow / \\to 대신 화살표는 →를 그대로 쓰고, $...$ 로 감싸지 말고, 첨자는 P_PUSCH, P_CMAX 처럼 일반 텍스트로 쓰세요. 수식은 P_PUSCH = min(P_CMAX, P0 + α·PL + ...) 형태의 평문으로 쓰세요.
8. 답변 마지막에 근거로 사용한 노드 id 목록은 적지 마세요. 근거 노드는 화면에 자동으로 표시됩니다.`;

  const aiMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

  const seedIds = seeds.map((node) => node.id);
  const askedTexts = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const suggestions = buildSuggestions(graph, subgraph, seedIds, askedTexts);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send = (payload: Record<string, unknown>) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

  // 응답 스트림을 먼저 돌려주고, 진행 상황을 이벤트로 흘려보낸다
  (async () => {
    try {
      await send({
        type: 'status',
        text: seeds.length
          ? `그래프에서 관련 노드 ${subgraph.nodes.length}개 · 관계 ${subgraph.edges.length}개 확보`
          : '직접 매칭되는 노드를 찾지 못해 인접 지식으로 추론합니다',
      });

      await send({
        type: 'context',
        seedIds,
        suggestions,
        nodes: subgraph.nodes,
        edges: subgraph.edges,
      });

      await send({ type: 'status', text: '근거 관계를 정리하는 중' });

      let streamed = false;
      let reasoningChars = 0;
      let lastReasoningReport = 0;
      let answeringAnnounced = false;

      // 토큰 단위로 보내면 이벤트가 수백 개가 되므로 적당히 묶어서 흘려보낸다
      let pending = '';
      const flush = async () => {
        if (!pending) return;
        const text = pending;
        pending = '';
        await send({ type: 'delta', text });
      };

      try {
        const aiStream = (await env.AI.run(MODEL, {
          messages: aiMessages,
          stream: true,
        })) as unknown as ReadableStream<Uint8Array>;

        const reader = aiStream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === '[DONE]') continue;

            let chunk: Record<string, unknown>;
            try {
              chunk = JSON.parse(data);
            } catch {
              continue;
            }

            const choices = chunk.choices as
              | Array<{ delta?: { content?: string | null; reasoning_content?: string | null } }>
              | undefined;
            const delta = choices?.[0]?.delta;

            // gemma는 먼저 추론을 흘리고 그 다음 실제 답변을 보낸다
            if (delta?.reasoning_content) {
              reasoningChars += delta.reasoning_content.length;
              if (reasoningChars - lastReasoningReport > 250) {
                lastReasoningReport = reasoningChars;
                await send({ type: 'status', text: `인과관계 추론 중 (${reasoningChars}자)` });
              }
            }

            const piece = delta?.content ?? (typeof chunk.response === 'string' ? chunk.response : '');
            if (piece) {
              if (!answeringAnnounced) {
                answeringAnnounced = true;
                await send({ type: 'status', text: '답변 작성 중' });
              }
              streamed = true;
              pending += piece;
              if (pending.length >= 48) await flush();
            }
          }
        }
        await flush();
      } catch {
        streamed = false;
        pending = '';
      }

      // 스트리밍이 불가한 경우 한 번에 받아서 전달한다
      if (!streamed) {
        await send({ type: 'status', text: '답변 작성 중' });
        const aiResponse = await env.AI.run(MODEL, { messages: aiMessages });
        await send({ type: 'delta', text: extractAnswer(aiResponse) });
      }

      await send({ type: 'done' });
    } catch (err) {
      await send({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
