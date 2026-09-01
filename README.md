# 3GPP RF 지식 그래프 대시보드

망(network)에서 단말 RF 프론트엔드 제어까지 이어지는 3GPP 셀룰러 지식을 그래프로 정리하고,
누구나 검색·탐색하거나 자연어로 질문할 수 있게 만든 웹 대시보드입니다.

- **배포 URL**: https://threegpp-rf-graph.min-rf.workers.dev
- **스택**: Cloudflare Workers + KV(그래프 저장) + Workers AI(`@cf/google/gemma-4-26b-a4b-it`) + Cytoscape.js(+fcose)

## 특징

- **기반 레이어(base)**: 3GPP 표준 절차(Procedure)·메시지(Message)·파라미터(Parameter)·공식(Formula)
- **응용 레이어(application)**: 약전계, 콜드랍, RACH 실패 같은 실무 증상(Symptom) 키워드가 기반 레이어 노드에 `explained_by`/`causes`로 연결됨
- **벤더 레이어(vendor)**: 3GPP 비표준 구현 영역(예: 퀄컴 모뎀 RF SW — MIPI RFFE, ASDIV, FBRx 폐루프 보정 등)을 별도 `Implementation` 타입으로 구분
- 이슈 키워드 클릭 → 그래프 강조 + 인과 체인 설명 자동 표시
- 대화형 챗봇(`/api/ask`, SSE 스트리밍)이 그래프를 근거로 답변하고, 관련 노드를 자동으로 하이라이트

## 폴더 구조

```
data/
  seed-nodes.json, seed-edges.json   # 현재 배포된 그래프의 source of truth (103 노드 / 149 엣지)
  domain-*.json                       # 아직 메인 그래프에 병합되지 않은 신규 도메인 초안 (아래 TODO 참고)
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
| **배포됨** (`data/seed-nodes.json` + `seed-edges.json`, KV와 동기화 확인됨) | 103 | 149 |
| **로컬 저장, 병합 대기** (`data/domain-*.json` 7개) | 129 | 195 |

배포된 도메인: RACH, 전력제어(open/closed-loop, PHR, MPR), TA, RLF, 셀 선택 개요, CA/EN-DC 기초,
핸드오버/RRM 측정 기초, RRC 상태/DRX/페이징, 2-Step RACH, PUCCH/SRS 전력제어 기초.

## TODO

### 1. 신규 도메인 병합 (우선순위 높음)
아래 7개 파일은 리서치 에이전트가 작성해 로컬에 저장만 되어 있고, 아직 `seed-nodes.json`/`seed-edges.json`에
합쳐지지 않았습니다. 병합 시 기존 노드 id와 충돌 없음을 재검증(스크립트로 dedupe/dangling-edge 체크) 후
KV 업로드 + `wrangler deploy`까지 필요합니다.

- [ ] `data/domain-ca2.json` — CA 심화: BWP 전환, CSI 보고, 크로스 캐리어 스케줄링, SCell 휴면, sTAG, PUCCH 그룹, CA 전력 배분 (18 노드 / 27 엣지)
- [ ] `data/domain-ant.json` — 안테나/MIMO: 1T4R·2T4R 표기, SRS 안테나 스위칭, UL/DL MIMO 레이어, 풀파워 전송, 빔 관리(BFD/BFR), LTE Tx 안테나 선택 (22 노드 / 32 엣지)
- [ ] `data/domain-srs.json` — SRS 심화: 자원/세트 구조, usage, 트리거 방식, 캐리어 스위칭, TDD 심볼 제약 (16 노드 / 24 엣지)
- [ ] `data/domain-endc2.json` — EN-DC 심화: 동적 전력 공유, SUO/UL 공유, PSCell 추가/변경, EPS 폴백, IMD 백오프 (19 노드 / 29 엣지)
- [ ] `data/domain-qc.json` — 퀄컴 모뎀 RF SW(벤더 레이어): MIPI RFFE, ASDIV, RF 캘리브레이션, FBRx 폐루프, ET/APT, RFC 설정, QXDM/FTM/QMI (18 노드 / 28 엣지)
- [ ] `data/domain-ho2.json` — 핸드오버 심화: RLM(N310/N311, Qout/Qin), BFD/BFR, 측정 갭/SMTC, DAPS, too-early/too-late HO (18 노드 / 29 엣지)
- [ ] `data/domain-cs.json` — 셀 선택/재선택 심화: S-criteria, q-RxLevMin/Pcompensation, 우선순위 기반 재선택, R-criteria, RNAU (18 노드 / 26 엣지)

병합 절차 참고(이전에 쓴 방식):
1. PowerShell로 7개 파일 + 기존 seed 파일의 `nodes`/`edges`를 한 배열로 합침
2. id 중복, `from`/`to`가 존재하지 않는 노드를 가리키는 엣지(dangling edge) 검사
3. `seed-nodes.json`/`seed-edges.json`으로 재분리 저장 (UTF-8, **BOM 없이**)
4. `worker/graph-seed.json`으로 재병합 → KV 업로드 → `wrangler deploy`
5. 배포 후 `/api/graph`로 노드/엣지 수 확인, 그래프 화면에서 새 이슈 키워드 칩이 뜨는지 확인

### 2. 데이터 검증
- [ ] 모든 노드가 `verified: false` 상태 — LLM이 작성한 1차 초안이므로 **specRef의 TS 조항 번호는 실제 스펙과 대조 검증 필요**
- [ ] `qc-*` (퀄컴 벤더 레이어) 노드는 공개적으로 알려진 개념 수준으로만 작성됨 — 내부 비공개 정보 포함 여부 재확인

### 3. 정리
- [ ] 관리자 큐레이션 UI는 제거했지만 백엔드 엔드포인트(`/api/curate`, `/api/nodes`, `/api/edges`, `ADMIN_TOKEN`)는 아직 살아있음 — 계속 쓸지, 완전히 제거할지 결정
- [ ] 루트의 `graph-backup.json`, `index.html`(초기 Hello World 데모)이 여전히 필요한지 확인 후 정리
- [ ] `worker/graph-seed.json`은 빌드 산출물이므로 `.gitignore`에 추가할지 검토

### 4. 향후 확장 (`docs/roadmap.md` 참고)
- [ ] 디바이스 인스턴스 레이어: 칩셋/벤더별 실제 UE Capability 값 매핑 (3GPP 표준 스키마 위에 얹는 별도 레이어)
- [ ] 검색을 키워드 매칭 → 임베딩 기반 유사도 검색(Vectorize)으로 고도화
- [ ] 그래프 규모가 커지면 KV 단일 blob → D1(SQL) 전환 검토
