# 3GPP RF 지식 그래프 대시보드

망(network)에서 단말 RF 프론트엔드 제어까지 이어지는 3GPP 셀룰러 지식을 그래프로 정리하고,
누구나 검색·탐색하거나 자연어로 질문할 수 있게 만든 웹 대시보드입니다.

- **배포 URL**: https://threegpp-rf-graph.min-rf.workers.dev
- **스택**: Cloudflare Workers + KV(그래프 저장) + Workers AI(`@cf/google/gemma-4-26b-a4b-it`) + Cytoscape.js(+fcose)

## 특징

- **기반 레이어(base)**: 3GPP 표준 절차(Procedure)·메시지(Message)·파라미터(Parameter)·공식(Formula)
- **응용 레이어(application)**: 약전계, 콜드랍, RACH 실패 같은 실무 증상(Symptom) 키워드가 기반 레이어 노드에 `explained_by`/`causes`로 연결됨
- **벤더 레이어(vendor)**: 3GPP 비표준 구현 영역(예: 퀄컴 모뎀 RF SW — MIPI RFFE, ASDIV, FBRx 폐루프 보정 등)을 별도 `Implementation` 타입으로 구분
- **물리 레이어(physical)**: 3GPP·벤더 어느 쪽에도 속하지 않는 범용 RF 회로 이론(임피던스 매칭, S-파라미터, PA/LNA/필터 등 소자, P1dB·IP3·EVM 같은 왜곡·선형성 지표)을 `Component` 타입으로 구분 — `증상 → 벤더 구현 → 물리적 원인`까지 인과 체인이 이어짐
- 이슈 키워드 클릭 → 그래프 강조 + 인과 체인 설명 자동 표시
- 대화형 챗봇(`/api/ask`, SSE 스트리밍)이 그래프를 근거로 답변하고, 관련 노드를 자동으로 하이라이트

## 폴더 구조

```
data/
  seed-nodes.json, seed-edges.json   # 현재 배포된 그래프의 source of truth (232 노드 / 347 엣지)
docs/
  schema.md      # 노드/엣지 타입 정의
  roadmap.md      # 향후 확장 항목 (디바이스 인스턴스 레이어 등)
worker/
  src/index.ts, src/api/*.ts, src/lib/*.ts   # Cloudflare Worker 백엔드
  public/                                       # 프론트엔드 (Cytoscape.js 대시보드)
  wrangler.toml                                 # KV/AI 바인딩 설정
.env               # CLOUDFLARE_API_TOKEN (커밋 금지, .gitignore 처리됨)
```

## 로컬 개발 / 배포

```bash
cd worker
npm install
npm run dev       # 로컬 개발 서버
npx tsc --noEmit  # 타입 체크
```

배포(실제 Cloudflare 계정에 영향):
```bash
cd worker
npx wrangler deploy
```

그래프 데이터를 갱신한 뒤 KV에 반영하려면 `data/seed-nodes.json` + `data/seed-edges.json`을 병합해
`worker/graph-seed.json`(BOM 없는 UTF-8)으로 만들고 아래로 업로드합니다:
```bash
npx wrangler kv key put --binding=GRAPH_KV "graph:v1" --path=graph-seed.json --remote
```

## 데이터 현황

| 상태 | 노드 | 엣지 |
|---|---|---|
| **배포됨** (`data/seed-nodes.json` + `seed-edges.json`, KV와 동기화 확인됨) | 267 | 402 |

배포된 도메인: RACH(2-Step 포함), 전력제어(open/closed-loop, PHR, MPR), TA, RLF, 셀 선택/재선택 심화,
CA/EN-DC(심화 포함: BWP, CSI, 동적 전력 공유, PSCell, EPS 폴백), 핸드오버/RRM(RLM, BFD/BFR, DAPS 포함),
RRC 상태/DRX/페이징, PUCCH/SRS 전력제어 및 SRS 심화, 안테나/MIMO(1T4R·2T4R, 빔 관리, 풀파워 전송),
퀄컴 모뎀 RF SW 벤더 레이어(MIPI RFFE, ASDIV, FBRx 폐루프, ET/APT, QXDM/FTM/QMI),
RF 회로 물리 레이어(전송선/임피던스, S-파라미터, PA/LNA/믹서/필터/듀플렉서 등 소자, P1dB/IP3/IMD/NF/EVM/PAPR),
PUSCH/PUCCH 주파수 호핑, NR PUSCH 안테나 포트/프리코더 동적 지시(SRI/TPMI).

## TODO

### 1. 신규 도메인 병합 (완료)
7개 도메인 초안(CA 심화, 안테나/MIMO, SRS 심화, EN-DC 심화, 퀄컴 벤더 레이어, 핸드오버 심화, 셀 선택 심화)을
`seed-nodes.json`/`seed-edges.json`에 병합 완료. id 중복 없음, dangling edge 없음, 그래프 연결성(BFS) 232/232
확인. `Implementation` 노드 타입 / `vendor` 레이어를 프론트엔드(색상, 범례, 배지, 테두리 스타일, 마크다운 설명
렌더링)에 반영하고 KV 업로드 + `wrangler deploy` 완료.

### 2. 데이터 검증 (1차 완료)
- [x] `qc-*`(퀄컴 벤더 레이어) 18개 노드 설명 전수 재검토 — MIPI RFFE/ASDIV/FBRx/ET·APT/QXDM/FTM/QMI 등 공개적으로 알려진
      업계 개념 수준으로만 서술되어 있고, 캘리브레이션 데이터처럼 내부 포맷·수치가 있는 항목은 "벤더 비공개 영역"이라고
      명시하며 구체값을 배제함을 확인. 비공개 정보 유출 없음.
- [ ] 모든 노드가 여전히 `verified: false` 상태 — RACH 2-Step(MsgA, TS 38.321 §5.1.2a/§5.1.3a), RLM Qout/Qin
      (TS 38.133 §8.1), 셀 선택 S-criteria(TS 38.304 §5.2.3.2), 재선택 R-criteria(TS 38.304 §5.2.4.6) 등 도메인별
      샘플 조항을 웹 검색으로 대조해 모두 정확함을 확인했으나, 232개 노드 전체의 조항 번호를 1:1로 대조한 것은 아니므로
      전수 검증 전까지는 `verified: false` 유지. 실제 스펙 PDF를 보유한 사용자의 최종 확인 권장.

### 3. 정리 (완료)
- [x] 관리자 큐레이션 엔드포인트 완전 제거 — `worker/src/api/curate.ts`, `save.ts` 삭제, `index.ts`의 `/api/curate`
      `/api/nodes` `/api/edges` 라우트 및 `ADMIN_TOKEN` 삭제, `graphStore.ts`의 미사용 `addNodes`/`addEdges`/`saveGraph`
      삭제. 프론트엔드 큐레이션 UI가 이미 삭제되어 호출하는 곳이 없었음. `GraphNode`/`GraphEdge` 타입에 빠져 있던
      `Implementation` 타입 / `vendor` 레이어도 함께 보정.
- [x] 루트의 `graph-backup.json`(구버전 103노드/90엣지 스냅샷)과 `index.html`(Hello World 데모) 삭제 — 실제
      대시보드는 `worker/public/`에 있고 source of truth는 `data/seed-*.json`이므로 둘 다 불필요.
- [x] `worker/graph-seed.json`은 이미 `.gitignore`에 포함되어 있고 git에 커밋된 적 없음을 확인.

### 4. 향후 확장 (보류 — `docs/roadmap.md` 참고)
실습 규모를 고려해 지금 구현하지 않고 로드맵으로만 유지한다.
- 디바이스 인스턴스 레이어: 칩셋/벤더별 실제 UE Capability 값 매핑 (3GPP 표준 스키마 위에 얹는 별도 레이어)
- 검색을 키워드 매칭 → 임베딩 기반 유사도 검색(Vectorize)으로 고도화
- 그래프 규모가 커지면 KV 단일 blob → D1(SQL) 전환 검토

### 5. RF Frontend Physical 지식 레이어 추가 (완료)
[rf-physical-domain-plan.md](docs/rf-physical-domain-plan.md)에서 계획한 4번째 레이어(`physical`)를 구현.
전송선/임피던스, S-파라미터, RF 소자(PA/LNA/믹서/VCO·PLL/필터/듀플렉서/커플러/아이솔레이터/안테나/스위치 —
신규 `Component` 타입), 왜곡·선형성 지표(P1dB/IP3/IMD/고조파/NF/선형성), 변조·신호 기초(I/Q/EVM/PAPR/성상도)
33개 노드를 추가하고, `qc-fbrx-closed-loop`/`qc-et-apt-tracking`/`param-mpr`/`endc2-formula-imd-frequency` 등
기존 base/vendor 노드와 15개의 브릿지 엣지로 연결해 `증상 → 벤더 구현 → 물리적 원인` 인과 체인을 완성.
id 중복 없음, dangling edge 없음, 그래프 연결성(BFS) 265/265 확인. `Component` 타입/`physical` 레이어를
프론트엔드(색상, 범례, 배지, 테두리 스타일)에 반영하고 KV 업로드 + `wrangler deploy` 완료.
참고 자료(rfdh.com)는 목차/주제 범위만 참고했고 서술은 직접 작성 — `rf-physical-domain-plan.md` 6절 참고.

### 6. 퀄컴 모뎀 RF SW 공개 자료 확장 (계획만 수립, 미착수)
[qc-public-sources-plan.md](docs/qc-public-sources-plan.md)에 벤더(vendor) 레이어를 확장하기 위한 계획을 정리.
공개 GitHub 저장소에 특정 벤더를 실명으로 다루는 내용이 들어가므로, **공식적으로 정식 발행된 자료만 사용**
(퀄컴 공식 웹사이트/개발자 문서/공개 특허/오픈소스 커널·libqmi 공개 문서/공개 컨퍼런스·논문), 로그인·NDA·사내
전용 자료 접근 금지, 출처 URL로 독립 검증 불가능한 내용 배제 등 원칙을 우선 확정했다.
- [ ] 1단계: 카테고리별 실제 접근 가능한 공개 URL 조사 및 기밀성 스크리닝 (아직 노드 작성 안 함)
- [ ] 2단계: 스크리닝된 자료 중 새 노드/보강 가치가 있는 항목을 추려 사용자 확인
- [ ] 3단계: 확정된 항목만 노드로 작성 → 병합 → 연결성 검증 → 배포
