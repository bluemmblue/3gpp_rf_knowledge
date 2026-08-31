const TYPE_COLOR = {
  Procedure: '#4f8cff',
  Message: '#35c48c',
  Parameter: '#c48cff',
  Formula: '#f2c14e',
  Symptom: '#ff8a5c',
};

let graph = { nodes: [], edges: [] };
let cy;

async function loadGraph() {
  const res = await fetch('/api/graph');
  graph = await res.json();
  renderGraph();
  renderIssueChips();
}

function renderIssueChips() {
  const container = document.getElementById('issue-chips');
  const symptoms = graph.nodes.filter((n) => n.type === 'Symptom').sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
  container.innerHTML = symptoms
    .map((n) => `<button class="issue-chip" data-node-id="${n.id}">${n.name_ko}</button>`)
    .join('');
  container.querySelectorAll('.issue-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectNode(btn.dataset.nodeId));
  });
}

function selectNode(id) {
  const nodeData = graph.nodes.find((n) => n.id === id);
  if (!nodeData) return;
  showNodeDetail(nodeData);
  highlightNodes([id, ...relatedIds(id)]);
  const cyNode = cy.getElementById(id);
  if (cyNode.length) cy.fit(cyNode.closedNeighborhood(), 80);
}

function relatedIds(id) {
  const ids = new Set();
  graph.edges.forEach((e) => {
    if (e.from === id) ids.add(e.to);
    if (e.to === id) ids.add(e.from);
  });
  return Array.from(ids);
}

function renderGraph() {
  const elements = [
    ...graph.nodes.map((n) => ({
      data: { id: n.id, label: n.name_ko, ...n },
    })),
    ...graph.edges.map((e) => ({
      data: { id: e.id, source: e.from, target: e.to, ...e },
    })),
  ];

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': (ele) => TYPE_COLOR[ele.data('type')] || '#888',
          'label': 'data(label)',
          'color': '#e7ecf5',
          'font-size': 11,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'width': 26,
          'height': 26,
          'border-width': (ele) => (ele.data('layer') === 'application' ? 2 : 0),
          'border-style': 'dashed',
          'border-color': '#ff8a5c',
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 1.2,
          'line-color': '#3a4560',
          'target-arrow-color': '#3a4560',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'opacity': 0.7,
        },
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#4f8cff',
          'border-style': 'solid',
        },
      },
      {
        selector: '.dimmed',
        style: { opacity: 0.12 },
      },
      {
        selector: '.hidden-layer',
        style: { display: 'none' },
      },
    ],
    layout: { name: 'cose', animate: false, padding: 30 },
  });

  cy.on('tap', 'node', (evt) => {
    const data = evt.target.data();
    showNodeDetail(data);
    highlightNodes([data.id, ...relatedIds(data.id)]);
  });
  applyLayerToggle();
}

const RELATION_LABEL = {
  contains: '포함',
  triggers: '유발함(다음 단계)',
  uses_parameter: '사용하는 파라미터',
  computed_by: '계산식',
  affects: '영향을 줌',
  causes: '유발할 수 있음',
  explained_by: '이 메커니즘으로 설명됨',
  mitigated_by: '완화 요인',
};

function nodeById(id) {
  return graph.nodes.find((n) => n.id === id);
}

function buildScenarioLines(node) {
  const outgoing = graph.edges.filter((e) => e.from === node.id);
  const incoming = graph.edges.filter((e) => e.to === node.id);
  const lines = [];

  outgoing.forEach((e) => {
    const target = nodeById(e.to);
    if (!target) return;
    const label = RELATION_LABEL[e.relation] ?? e.relation;
    lines.push(`→ <strong>${target.name_ko}</strong> — ${label}${e.note ? ` · ${e.note}` : ''}`);
  });

  incoming
    .filter((e) => e.relation === 'causes' || e.relation === 'affects')
    .forEach((e) => {
      const source = nodeById(e.from);
      if (!source) return;
      lines.push(`← <strong>${source.name_ko}</strong>이(가) 이 현상을 유발할 수 있음${e.note ? ` · ${e.note}` : ''}`);
    });

  return lines;
}

function showNodeDetail(node) {
  const badgeClass = node.layer === 'application' ? 'badge symptom' : 'badge';
  const specRef = node.layer === 'base'
    ? `<div class="spec-ref">${node.specRef ?? '조항 미상'}${node.verified ? '' : ' <span class="unverified">(미검증)</span>'}</div>`
    : '';
  const scenarioLines = buildScenarioLines(node);
  const scenarioHtml = scenarioLines.length
    ? `<div class="scenario"><strong>가능한 시나리오 / 관련 항목</strong><ul>${scenarioLines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`
    : '';
  const flowHtml = node.flow
    ? `<div class="flow"><strong>흐름도</strong><pre>${node.flow}</pre></div>`
    : '';
  document.getElementById('node-detail').innerHTML = `
    <span class="${badgeClass}">${node.type}</span>
    <div><strong>${node.name_ko}</strong> (${node.name_en})</div>
    <p>${node.description}</p>
    ${specRef}
    ${flowHtml}
    ${scenarioHtml}
  `;
}

function applyLayerToggle() {
  const showBase = document.getElementById('toggle-base').checked;
  const showApp = document.getElementById('toggle-application').checked;

  cy.nodes().forEach((node) => {
    const layer = node.data('layer');
    const hide = (layer === 'base' && !showBase) || (layer === 'application' && !showApp);
    node.toggleClass('hidden-layer', hide);
  });

  cy.edges().forEach((edge) => {
    const hide = edge.source().hasClass('hidden-layer') || edge.target().hasClass('hidden-layer');
    edge.toggleClass('hidden-layer', hide);
  });
}

function highlightNodes(ids) {
  cy.elements().removeClass('highlighted dimmed');
  if (!ids.length) return;
  const matched = cy.nodes().filter((n) => ids.includes(n.id()));
  cy.elements().addClass('dimmed');
  matched.removeClass('dimmed').addClass('highlighted');
  matched.connectedEdges().removeClass('dimmed');
  if (matched.length) cy.fit(matched, 60);
}

document.getElementById('toggle-base').addEventListener('change', applyLayerToggle);
document.getElementById('toggle-application').addEventListener('change', applyLayerToggle);

document.getElementById('search').addEventListener('input', (evt) => {
  const q = evt.target.value.trim().toLowerCase();
  if (!q) {
    cy.elements().removeClass('highlighted dimmed');
    return;
  }
  const matchedIds = graph.nodes
    .filter((n) => `${n.name_ko} ${n.name_en} ${n.description}`.toLowerCase().includes(q))
    .map((n) => n.id);
  highlightNodes(matchedIds);
});

document.getElementById('ask-btn').addEventListener('click', async () => {
  const question = document.getElementById('ask-input').value.trim();
  if (!question) return;
  const answerBox = document.getElementById('ask-answer');
  answerBox.textContent = '답변 생성 중...';
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    answerBox.textContent = data.answer ?? '답변을 받지 못했습니다.';
    highlightNodes((data.nodes ?? []).map((n) => n.id));
  } catch (err) {
    answerBox.textContent = '요청 중 오류가 발생했습니다: ' + err.message;
  }
});

let curateDraft = null;

document.getElementById('curate-btn').addEventListener('click', async () => {
  const token = document.getElementById('admin-token').value.trim();
  const text = document.getElementById('curate-text').value.trim();
  const resultBox = document.getElementById('curate-result');
  if (!token || !text) {
    resultBox.textContent = '토큰과 텍스트를 모두 입력하세요.';
    return;
  }
  resultBox.textContent = '추출 중...';
  try {
    const res = await fetch('/api/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      resultBox.textContent = '오류: ' + (data.error ?? res.status);
      return;
    }
    curateDraft = data.draft;
    resultBox.textContent = JSON.stringify(data.draft ?? { raw: data.raw }, null, 2);
  } catch (err) {
    resultBox.textContent = '요청 중 오류가 발생했습니다: ' + err.message;
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const token = document.getElementById('admin-token').value.trim();
  const resultBox = document.getElementById('curate-result');
  if (!token || !curateDraft) {
    resultBox.textContent = '먼저 추출을 실행하세요.';
    return;
  }
  try {
    if (curateDraft.nodes?.length) {
      await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nodes: curateDraft.nodes }),
      });
    }
    if (curateDraft.edges?.length) {
      await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ edges: curateDraft.edges }),
      });
    }
    resultBox.textContent = '저장 완료. 그래프를 다시 불러옵니다.';
    await loadGraph();
  } catch (err) {
    resultBox.textContent = '저장 중 오류가 발생했습니다: ' + err.message;
  }
});

loadGraph();
