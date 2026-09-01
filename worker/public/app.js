const TYPE_COLOR = {
  Procedure: '#7C9BB5',
  Message: '#8FA98A',
  Parameter: '#9C8FB8',
  Formula: '#C9A45C',
  Symptom: '#C97B54',
};

let graph = { nodes: [], edges: [] };
let cy;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

// 이 배율보다 축소되면 허브·증상 노드만 라벨을 남겨 화면이 글자로 뒤덮이지 않게 한다
const LABEL_ZOOM_THRESHOLD = 0.95;
const HUB_DEGREE = 5;

/* ---------- 탭 ---------- */

function showTab(name) {
  document.querySelectorAll('.tab').forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === name);
  });
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

async function loadGraph() {
  const res = await fetch('/api/graph');
  graph = await res.json();
  renderGraph();
  renderIssueChips();
}

function renderIssueChips() {
  const container = document.getElementById('issue-chips');
  const symptoms = graph.nodes
    .filter((n) => n.type === 'Symptom')
    .sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
  container.innerHTML = symptoms
    .map((n) => `<button class="issue-chip" data-node-id="${n.id}">${escapeHtml(n.name_ko)}</button>`)
    .join('');
  container.querySelectorAll('.issue-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectNode(btn.dataset.nodeId));
  });
  document.getElementById('issue-count').textContent = `(${symptoms.length})`;
  syncIssueChips([...chatFocusIds]);
}

document.getElementById('issue-toggle').addEventListener('click', () => {
  const section = document.getElementById('issue-section');
  const collapsed = section.classList.toggle('collapsed');
  document.getElementById('issue-toggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (cy) cy.resize();
});

function selectNode(id) {
  const nodeData = graph.nodes.find((n) => n.id === id);
  if (!nodeData) return;
  showNodeDetail(nodeData);
  showTab('node');
  highlightNodes([id, ...relatedIds(id)]);
  syncIssueChips([id]);
}

function syncIssueChips(activeIds) {
  const set = new Set(activeIds);
  document.querySelectorAll('.issue-chip').forEach((btn) => {
    btn.classList.toggle('active', set.has(btn.dataset.nodeId));
  });
}

function relatedIds(id) {
  const ids = new Set();
  graph.edges.forEach((e) => {
    if (e.from === id) ids.add(e.to);
    if (e.to === id) ids.add(e.from);
  });
  return Array.from(ids);
}

/** 연결 수(degree)를 미리 계산해 노드 크기·라벨 우선순위에 쓴다. */
function computeDegrees() {
  const deg = new Map(graph.nodes.map((n) => [n.id, 0]));
  graph.edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  });
  return deg;
}

/** fcose 플러그인이 로드됐으면 쓰고, 실패 시 내장 cose로 안전하게 되돌린다. */
function buildLayoutOptions(quality = 'proof') {
  const hasFcose = typeof cytoscape !== 'undefined' && typeof window.cytoscapeFcose !== 'undefined';
  if (hasFcose) {
    return {
      name: 'fcose',
      quality,
      animate: false,
      randomize: true,
      padding: 30,
      // 전체 보기 배율이 너무 낮아지지 않도록 간격을 적당히 유지한다
      nodeSeparation: 62,
      idealEdgeLength: 68,
      nodeRepulsion: 5200,
      gravity: 0.45,
      gravityRange: 2.6,
      numIter: 3500,
      tile: true,
      tilingPaddingVertical: 20,
      tilingPaddingHorizontal: 20,
    };
  }
  return {
    name: 'cose',
    animate: false,
    padding: 30,
    randomize: true,
    componentSpacing: 90,
    nodeRepulsion: () => 9000,
    idealEdgeLength: () => 70,
    nodeOverlap: 20,
    gravity: 45,
    numIter: 2500,
  };
}

function renderGraph() {
  const degrees = computeDegrees();

  const elements = [
    ...graph.nodes.map((n) => ({
      data: { id: n.id, label: n.name_ko, degree: degrees.get(n.id) ?? 0, ...n },
    })),
    ...graph.edges.map((e) => ({
      data: { id: e.id, source: e.from, target: e.to, ...e },
    })),
  ];

  if (typeof window.cytoscapeFcose !== 'undefined') {
    try {
      cytoscape.use(window.cytoscapeFcose);
    } catch {
      /* 이미 등록된 경우 무시 */
    }
  }

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    wheelSensitivity: 0.25,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': (ele) => TYPE_COLOR[ele.data('type')] || '#A6ADB8',
          'label': 'data(label)',
          'color': '#3B3A36',
          'font-size': 10.5,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 5,
          'text-wrap': 'wrap',
          'text-max-width': 92,
          'line-height': 1.25,
          'text-outline-width': 2.5,
          'text-outline-color': '#F7F5F0',
          // 연결이 많은 노드를 크게 그려 시각적 위계를 만든다
          'width': (ele) => 20 + Math.min(ele.data('degree') ?? 0, 12) * 1.9,
          'height': (ele) => 20 + Math.min(ele.data('degree') ?? 0, 12) * 1.9,
          'border-width': (ele) => (ele.data('layer') === 'application' ? 2 : 0),
          'border-style': 'dashed',
          'border-color': '#C97B54',
          'z-index': 10,
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 1,
          'line-color': '#CFCABF',
          'target-arrow-color': '#CFCABF',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.75,
          'curve-style': 'bezier',
          'opacity': 0.65,
          'z-index': 1,
        },
      },
      {
        selector: 'node.label-off',
        style: { 'text-opacity': 0 },
      },
      {
        // 축소 상태에서 남겨둔 라벨은 크게 키워 작은 배율에서도 읽히게 한다
        selector: 'node.label-lg',
        style: {
          'font-size': 16,
          'font-weight': 600,
          'text-max-width': 150,
          'text-outline-width': 3.5,
          'z-index': 25,
        },
      },
      {
        selector: 'node.emphasis',
        style: {
          'text-opacity': 1,
          'font-size': 12.5,
          'font-weight': 600,
          'text-outline-width': 3.5,
          'z-index': 40,
        },
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#5E7F9E',
          'border-style': 'solid',
          'z-index': 30,
        },
      },
      {
        selector: 'edge.highlighted',
        style: { 'line-color': '#5E7F9E', 'target-arrow-color': '#5E7F9E', 'opacity': 0.9, 'width': 1.8 },
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
    layout: buildLayoutOptions(),
  });

  cy.on('tap', 'node', (evt) => {
    const data = evt.target.data();
    showNodeDetail(data);
    showTab('node');
    // 클릭한 노드 주변만 강조하고, 화면은 그대로 두어 시야가 튀지 않게 한다
    highlightNodes([data.id, ...relatedIds(data.id)], { fit: false });
    syncIssueChips([data.id]);
  });

  // 빈 공간을 클릭하면 강조 해제
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('highlighted dimmed');
      syncIssueChips([...chatFocusIds]);
    }
  });

  // 마우스를 올린 노드와 이웃의 라벨은 축소 상태에서도 또렷하게 보여준다
  cy.on('mouseover', 'node', (evt) => {
    evt.target.closedNeighborhood().nodes().addClass('emphasis').removeClass('label-off');
  });
  cy.on('mouseout', 'node', () => {
    cy.nodes().removeClass('emphasis');
    updateLabelVisibility();
  });

  cy.on('zoom', updateLabelVisibility);

  updateLegendCounts();
  applyTypeFilter();
  updateLabelVisibility();
}

/**
 * 배율에 따라 라벨 밀도를 조절한다.
 * 많이 축소했을 때는 허브·증상 노드만 크게 보여주고, 확대하면 전부 보여준다.
 */
function updateLabelVisibility() {
  if (!cy) return;
  const zoom = cy.zoom();
  const forceAll = document.getElementById('toggle-all-labels').checked;
  const showAll = forceAll || zoom >= LABEL_ZOOM_THRESHOLD;
  // 많이 축소된 상태에서는 기준을 더 올려 표시 개수를 줄인다
  const minDegree = zoom < 0.55 ? HUB_DEGREE + 3 : HUB_DEGREE;

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (showAll) {
        node.removeClass('label-off label-lg');
        return;
      }
      const keep = node.data('type') === 'Symptom' || (node.data('degree') ?? 0) >= minDegree;
      node.toggleClass('label-off', !keep);
      node.toggleClass('label-lg', keep);
    });
  });
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
    lines.push(`→ <strong>${escapeHtml(target.name_ko)}</strong> — ${label}${e.note ? ` · ${escapeHtml(e.note)}` : ''}`);
  });

  incoming
    .filter((e) => e.relation === 'causes' || e.relation === 'affects')
    .forEach((e) => {
      const source = nodeById(e.from);
      if (!source) return;
      lines.push(
        `← <strong>${escapeHtml(source.name_ko)}</strong>이(가) 이 현상을 유발할 수 있음${e.note ? ` · ${escapeHtml(e.note)}` : ''}`,
      );
    });

  return lines;
}

function showNodeDetail(node) {
  const badgeClass = node.layer === 'application' ? 'badge symptom' : 'badge';
  const specRef =
    node.layer === 'base' && node.specRef ? `<div class="spec-ref">${escapeHtml(node.specRef)}</div>` : '';
  const scenarioLines = buildScenarioLines(node);
  const scenarioHtml = scenarioLines.length
    ? `<div class="scenario"><strong>가능한 시나리오 / 관련 항목</strong><ul>${scenarioLines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`
    : '';
  const flowHtml = node.flow ? `<div class="flow"><strong>흐름도</strong><pre>${escapeHtml(node.flow)}</pre></div>` : '';
  document.getElementById('node-detail').innerHTML = `
    <span class="${badgeClass}">${escapeHtml(node.type)}</span>
    <div><strong>${escapeHtml(node.name_ko)}</strong> (${escapeHtml(node.name_en)})</div>
    <p>${escapeHtml(node.description)}</p>
    ${specRef}
    ${flowHtml}
    ${scenarioHtml}
  `;
}

/** 범례에서 켜진 종류만 그래프에 남긴다. (복수 선택) */
function applyTypeFilter() {
  if (!cy) return;
  const hiddenTypes = new Set(
    [...document.querySelectorAll('.cy-legend .lg')]
      .filter((btn) => btn.getAttribute('aria-pressed') === 'false')
      .map((btn) => btn.dataset.type),
  );

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.toggleClass('hidden-layer', hiddenTypes.has(node.data('type')));
    });
    cy.edges().forEach((edge) => {
      const hide = edge.source().hasClass('hidden-layer') || edge.target().hasClass('hidden-layer');
      edge.toggleClass('hidden-layer', hide);
    });
  });
}

/** 범례에 종류별 노드 개수를 표시한다. */
function updateLegendCounts() {
  const counts = new Map();
  graph.nodes.forEach((n) => counts.set(n.type, (counts.get(n.type) ?? 0) + 1));
  document.querySelectorAll('.cy-legend .lg').forEach((btn) => {
    const el = btn.querySelector('.lg-n');
    if (el) el.textContent = counts.get(btn.dataset.type) ?? 0;
  });
}

/** 선택 영역을 화면 안에 담되, 과도한 확대/축소로 노드를 잃지 않게 배율을 제한한다. */
function focusOn(collection) {
  if (!collection || !collection.length) return;
  cy.animate({ fit: { eles: collection, padding: 70 }, duration: 220, easing: 'ease-out' });
}

function highlightNodes(ids, opts = {}) {
  cy.elements().removeClass('highlighted dimmed');
  if (!ids.length) return;
  const matched = cy.nodes().filter((n) => ids.includes(n.id()));
  if (!matched.length) return;
  cy.elements().addClass('dimmed');
  matched.removeClass('dimmed').addClass('highlighted');
  matched.connectedEdges().removeClass('dimmed');
  if (opts.fit !== false) focusOn(matched);
}

/** 필터로 노드가 줄어들면 보이는 노드만으로 배치를 다시 계산해 빈 공간을 없앤다. */
let relayoutTimer = null;
function relayoutVisible() {
  if (!cy) return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => {
    const visible = cy.elements(':visible');
    if (!visible.length) return;
    visible.layout(buildLayoutOptions('default')).run();
    cy.fit(cy.nodes(':visible'), 50);
    updateLabelVisibility();
  }, 120);
}

document.querySelectorAll('.cy-legend .lg').forEach((btn) => {
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', on ? 'false' : 'true');
    applyTypeFilter();
    relayoutVisible();
  });
});

document.getElementById('legend-all').addEventListener('click', () => {
  document.querySelectorAll('.cy-legend .lg').forEach((btn) => btn.setAttribute('aria-pressed', 'true'));
  applyTypeFilter();
  relayoutVisible();
});

document.getElementById('toggle-all-labels').addEventListener('change', updateLabelVisibility);

document.getElementById('cy-fit').addEventListener('click', () => {
  cy.elements().removeClass('highlighted dimmed');
  cy.animate({ fit: { eles: cy.nodes(':visible'), padding: 50 }, duration: 250, easing: 'ease-out' });
});

document.getElementById('cy-relayout').addEventListener('click', () => {
  cy.layout(buildLayoutOptions()).run();
  updateLabelVisibility();
});

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
  syncIssueChips(matchedIds);
});

/* ---------- 챗봇 ---------- */

const chatHistory = [];
const MAX_HISTORY = 12;
const chatFocusIds = new Set();
let lastSuggestions = [];

const ROLE_LABEL = { user: '나', assistant: 'RF 어시스턴트' };

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

const LATEX_SYMBOLS = {
  rightarrow: '→',
  Rightarrow: '⇒',
  leftarrow: '←',
  to: '→',
  times: '×',
  cdot: '·',
  approx: '≈',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  pm: '±',
  alpha: 'α',
  beta: 'β',
  Delta: 'Δ',
  delta: 'δ',
  mu: 'μ',
  sum: 'Σ',
  log: 'log',
  min: 'min',
  max: 'max',
};

/** 모델이 섞어 보내는 LaTeX 문법을 일반 텍스트/기호로 정리한다. */
function stripLatex(input) {
  let s = input;

  // 수식 구분자 제거: $...$, \(...\), \[...\]
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$1');
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\$([^$\n]+)\$/g, '$1');

  // \text{...}, \mathrm{...} 등은 내용만 남긴다
  s = s.replace(/\\(?:text|mathrm|mathit|mathbf|operatorname)\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');

  // 알려진 기호 치환
  s = s.replace(/\\([A-Za-z]+)/g, (whole, name) => LATEX_SYMBOLS[name] ?? name);

  // 첨자 표기 정리: P_{PUSCH} → P_PUSCH, 10^{x} → 10^x
  s = s.replace(/([_^])\{([^{}]*)\}/g, '$1$2');

  return s;
}

/** 답변의 마크다운(굵게/기울임/목록/코드/헤딩)을 HTML로 변환한다. */
function renderMarkdown(text) {
  let s = escapeHtml(stripLatex(text));

  const blocks = [];
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre class="md-pre">${code.replace(/\n$/, '')}</pre>`);
    return `@@CB${blocks.length - 1}@@`;
  });

  s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  };

  for (const raw of s.split('\n')) {
    const line = raw.trim();

    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      closeList();
      out.push(`<div class="md-h">${heading[1]}</div>`);
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul class="md-list">');
        listType = 'ul';
      }
      out.push(`<li>${bullet[1]}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol class="md-list">');
        listType = 'ol';
      }
      out.push(`<li>${numbered[1]}</li>`);
      continue;
    }

    closeList();
    out.push(`<p class="md-p">${line}</p>`);
  }
  closeList();

  return out.join('').replace(/@@CB(\d+)@@/g, (_, i) => blocks[Number(i)] ?? '');
}

function refChipsHtml(refIds) {
  if (!refIds || !refIds.length) return '';
  const chips = refIds
    .map((id) => {
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) return '';
      return `<button class="ref-chip" data-node-id="${id}">${escapeHtml(node.name_ko)}</button>`;
    })
    .filter(Boolean)
    .join('');
  return chips ? `<div class="turn-refs"><span class="refs-label">근거 노드</span>${chips}</div>` : '';
}

function suggestionsHtml() {
  if (!lastSuggestions.length) return '';
  const chips = lastSuggestions
    .map((q, i) => `<button class="suggest-chip" data-suggest-index="${i}">${escapeHtml(q)}</button>`)
    .join('');
  return `<div class="suggest-box"><span class="suggest-label">이어서 물어보기</span><div class="suggest-chips">${chips}</div></div>`;
}

/** 스트리밍 중 갱신할 자리만 미리 만들어 둔다 (전체 재렌더 방지). */
function streamSkeletonHtml() {
  return (
    `<div class="turn assistant" id="stream-turn">` +
    `<span class="turn-role">${ROLE_LABEL.assistant}</span>` +
    `<div class="status-line" id="stream-status"><span class="spinner"></span><span class="status-text"></span></div>` +
    `<div class="msg assistant md streaming" id="stream-msg" hidden></div>` +
    `</div>`
  );
}

function renderChat(pendingText, partialAnswer) {
  const log = document.getElementById('chat-log');
  const turns = document.getElementById('chat-turns');

  const userCount = chatHistory.filter((m) => m.role === 'user').length;
  turns.textContent = userCount ? `${userCount}개 질문 · 맥락 유지 중` : '';

  if (!chatHistory.length && !pendingText && !partialAnswer) {
    log.innerHTML =
      '<div class="chat-empty"><strong>그래프를 근거로 답하는 챗봇입니다.</strong><br>' +
      '이어서 질문하면 앞선 대화를 기억하고, 답변에 사용된 근거 노드가 그래프와 상단 키워드에 자동으로 표시됩니다.</div>';
    return;
  }

  const parts = chatHistory.map((m) => {
    const roleLabel = ROLE_LABEL[m.role] ?? m.role;
    const bodyHtml = m.role === 'assistant' ? renderMarkdown(m.content) : escapeHtml(m.content);
    const bodyClass = m.role === 'assistant' ? 'msg assistant md' : 'msg user';
    return (
      `<div class="turn ${m.role}">` +
      `<span class="turn-role">${roleLabel}</span>` +
      `<div class="${bodyClass}">${bodyHtml}</div>` +
      refChipsHtml(m.refIds) +
      `</div>`
    );
  });

  if (pendingText || partialAnswer) {
    parts.push(streamSkeletonHtml());
  } else {
    parts.push(suggestionsHtml());
  }

  log.innerHTML = parts.join('');

  log.querySelectorAll('.ref-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectNode(btn.dataset.nodeId));
  });
  log.querySelectorAll('.suggest-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = lastSuggestions[Number(btn.dataset.suggestIndex)];
      if (q) sendChat(q);
    });
  });

  log.scrollTop = log.scrollHeight;
}

/* 스트리밍 중에는 해당 말풍선만 갱신하고, 렌더링은 프레임 단위로 합쳐서 처리한다. */
const stream = {
  statusEl: null,
  msgEl: null,
  logEl: null,
  text: '',
  frame: 0,
};

function beginStream(statusText) {
  renderChat(statusText, '');
  stream.logEl = document.getElementById('chat-log');
  stream.statusEl = document.querySelector('#stream-status .status-text');
  stream.msgEl = document.getElementById('stream-msg');
  stream.text = '';
  stream.frame = 0;
  if (stream.statusEl) stream.statusEl.textContent = statusText;
}

function setStreamStatus(text) {
  if (stream.statusEl) stream.statusEl.textContent = text;
}

/** 사용자가 위로 스크롤해 읽고 있으면 자동 스크롤로 방해하지 않는다. */
function keepScrolled() {
  const log = stream.logEl;
  if (!log) return;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

function appendStreamText(piece) {
  stream.text += piece;
  if (stream.frame) return;
  stream.frame = requestAnimationFrame(() => {
    stream.frame = 0;
    if (!stream.msgEl) return;
    stream.msgEl.hidden = false;
    stream.msgEl.innerHTML = renderMarkdown(stream.text) + '<span class="caret-blink"></span>';
    keepScrolled();
  });
}

function endStream() {
  if (stream.frame) {
    cancelAnimationFrame(stream.frame);
    stream.frame = 0;
  }
  const text = stream.text;
  stream.statusEl = null;
  stream.msgEl = null;
  stream.logEl = null;
  stream.text = '';
  return text;
}

async function sendChat(presetQuestion) {
  const input = document.getElementById('ask-input');
  const btn = document.getElementById('ask-btn');
  const question = (presetQuestion ?? input.value).trim();
  if (!question) return;

  chatHistory.push({ role: 'user', content: question });
  if (!presetQuestion) input.value = '';
  lastSuggestions = [];
  btn.disabled = true;

  let seedIds = [];
  beginStream('질문에서 키워드를 찾는 중');

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content })),
      }),
    });

    if (!res.body) throw new Error('스트림을 받지 못했습니다.');

    const reader = res.body.getReader();
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
        let evt;
        try {
          evt = JSON.parse(trimmed.slice(5).trim());
        } catch {
          continue;
        }

        if (evt.type === 'status') {
          setStreamStatus(evt.text);
        } else if (evt.type === 'context') {
          seedIds = evt.seedIds ?? [];
          lastSuggestions = evt.suggestions ?? [];
          // 답변을 기다리는 동안 그래프를 먼저 연동해준다
          seedIds.forEach((id) => chatFocusIds.add(id));
          const neighbors = seedIds.flatMap((id) => relatedIds(id));
          highlightNodes([...new Set([...chatFocusIds, ...neighbors])]);
          syncIssueChips([...chatFocusIds]);
        } else if (evt.type === 'delta') {
          appendStreamText(evt.text);
        } else if (evt.type === 'error') {
          appendStreamText(`\n\n(오류: ${evt.text})`);
        }
      }
    }

    const answer = endStream();
    chatHistory.push({
      role: 'assistant',
      content: answer.trim() || '답변을 받지 못했습니다.',
      refIds: seedIds,
    });
    renderChat();
  } catch (err) {
    endStream();
    chatHistory.push({ role: 'assistant', content: '요청 중 오류가 발생했습니다: ' + err.message });
    renderChat();
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

document.getElementById('ask-btn').addEventListener('click', () => sendChat());

document.getElementById('ask-input').addEventListener('keydown', (evt) => {
  if (evt.key === 'Enter' && !evt.shiftKey) {
    evt.preventDefault();
    sendChat();
  }
});

document.getElementById('chat-new').addEventListener('click', () => {
  chatHistory.length = 0;
  chatFocusIds.clear();
  lastSuggestions = [];
  renderChat();
  syncIssueChips([]);
  if (cy) cy.elements().removeClass('highlighted dimmed');
  document.getElementById('ask-input').focus();
});

renderChat();

loadGraph();
