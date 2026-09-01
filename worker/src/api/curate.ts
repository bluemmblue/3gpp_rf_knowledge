import type { Env } from '../index';

const MODEL = '@cf/google/gemma-4-26b-a4b-it';

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function handleCurate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!isAuthorized(request, env)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  const text = body.text;
  if (!text || typeof text !== 'string') {
    return Response.json({ error: 'text is required' }, { status: 400 });
  }

  const prompt = `다음은 3GPP 스펙 원문 또는 요약 텍스트입니다. 이 텍스트에서만 근거를 찾아 절차(Procedure), 메시지(Message), 파라미터(Parameter), 공식(Formula) 후보와 그 관계를 추출해 JSON으로만 응답하세요. 텍스트에 없는 내용은 만들어내지 마세요.

형식:
{"nodes":[{"id":"kebab-case-id","type":"Procedure|Message|Parameter|Formula","layer":"base","name_ko":"...","name_en":"...","description":"...","specRef":"...","verified":false}],
 "edges":[{"id":"unique-id","from":"node-id","to":"node-id","relation":"contains|triggers|uses_parameter|computed_by|affects","note":"..."}]}

JSON 외 다른 텍스트는 출력하지 마세요.

텍스트:
${text}`;

  const aiResponse = await env.AI.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
  });

  let raw = String(aiResponse);
  if (aiResponse && typeof aiResponse === 'object') {
    const obj = aiResponse as Record<string, unknown>;
    if (typeof obj.response === 'string') {
      raw = obj.response;
    } else {
      const choices = obj.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content === 'string') raw = content;
    }
  }

  let draft: unknown = null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      draft = JSON.parse(jsonMatch[0]);
    } catch {
      draft = null;
    }
  }

  return Response.json({
    draft,
    raw,
    warning: '이 결과는 LLM이 생성한 초안입니다. 저장 전 반드시 스펙 조항과 내용을 직접 검증하세요.',
  });
}
