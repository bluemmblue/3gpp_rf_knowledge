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
| **배포됨** (`data/seed-nodes.json` + `seed-edges.json`, KV와 동기화 확인됨) | 232 | 347 |

배포된 도메인: RACH(2-Step 포함), 전력제어(open/closed-loop, PHR, MPR), TA, RLF, 셀 선택/재선택 심화,
CA/EN-DC(심화 포함: BWP, CSI, 동적 전력 공유, PSCell, EPS 폴백), 핸드오버/RRM(RLM, BFD/BFR, DAPS 포함),
RRC 상태/DRX/페이징, PUCCH/SRS 전력제어 및 SRS 심화, 안테나/MIMO(1T4R·2T4R, 빔 관리, 풀파워 전송),
퀄컴 모뎀 RF SW 벤더 레이어(MIPI RFFE, ASDIV, FBRx 폐루프, ET/APT, QXDM/FTM/QMI).

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

### 3. 정리
- [ ] 관리자 큐레이션 UI는 제거했지만 백엔드 엔드포인트(`/api/curate`, `/api/nodes`, `/api/edges`, `ADMIN_TOKEN`)는 아직 살아있음 — 계속 쓸지, 완전히 제거할지 결정
- [ ] 루트의 `graph-backup.json`, `index.html`(초기 Hello World 데모)이 여전히 필요한지 확인 후 정리
- [ ] `worker/graph-seed.json`은 빌드 산출물이므로 `.gitignore`에 추가할지 검토

### 4. 향후 확장 (`docs/roadmap.md` 참고)
- [ ] 디바이스 인스턴스 레이어: 칩셋/벤더별 실제 UE Capability 값 매핑 (3GPP 표준 스키마 위에 얹는 별도 레이어)
- [ ] 검색을 키워드 매칭 → 임베딩 기반 유사도 검색(Vectorize)으로 고도화
- [ ] 그래프 규모가 커지면 KV 단일 blob → D1(SQL) 전환 검토
