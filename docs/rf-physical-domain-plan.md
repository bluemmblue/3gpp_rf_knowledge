# RF Frontend Physical 지식 도메인 수집 계획

3GPP 표준(base)·실무 증상(application)·퀄컴 모뎀 SW 구현(vendor)까지는 갖춰졌지만, 그 아래에 있는
**RF 회로/소자 자체의 물리 이론**(임피던스 매칭, S-파라미터, PA/LNA/믹서 같은 소자, 왜곡·선형성 지표 등)은
아직 그래프에 없다. `qc-*` 벤더 노드들이 "PA가 압축 영역에 들어간다", "ACLR이 커진다" 같은 현상을 설명은 하지만,
그 밑바탕이 되는 RF 회로 이론 자체는 다루지 않는다. 이 문서는 그 공백을 채우는 **네 번째 지식 레이어**를
어떻게 설계하고 수집할지 정리한 계획서다.

> **구현 완료** — 아래 계획대로 33개 노드(전송선/임피던스 8, S-파라미터 5, RF 소자 10, 왜곡·선형성 지표 6,
> 변조·신호 기초 4)와 브릿지 엣지 15개를 포함한 총 51개 엣지를 `data/seed-nodes.json`/`seed-edges.json`에
> 반영하고 배포까지 마쳤다 (`data/domain-phy.json` 초안을 작성 → 병합 → 연결성 검증 → 프론트엔드 반영 →
> KV 업로드 → `wrangler deploy` 순서로 진행, 계획했던 1~3단계를 한 번에 수행). 아래 내용은 설계 근거로 남겨둔다.

참고 자료: [rfdh.com RF 기초](https://rfdh.com/bas_rf.htm), [rfdh.com 입문 가이드](https://rfdh.com/bas_rf/beginer.htm)
— **목차/주제 범위만 참고**하고, 노드 설명은 각 개념에 대한 일반적인 공학 지식을 바탕으로 직접 서술한다
(원문 문장을 그대로 옮기지 않음 — 저작권 있는 웹사이트 콘텐츠이므로 목차 구조·용어만 레퍼런스로 삼는다).

## 1. 왜 새 레이어가 필요한가

기존 3개 레이어와의 성격 차이:

| 레이어 | 질문의 성격 | 예 |
|---|---|---|
| base (3GPP) | "표준이 뭐라고 정의하는가" | RACH는 어떤 절차인가, P0/alpha는 어떻게 정의되는가 |
| vendor (퀄컴 구현) | "실제 모뎀 SW가 어떻게 동작/판단하는가" | ASDIV가 언제 안테나를 전환하는가 |
| **physical (신규)** | **"RF 회로가 물리적으로 왜 그렇게 동작하는가"** | **PA가 왜 P1dB 근처에서 찌그러지는가, 임피던스가 안 맞으면 왜 반사가 생기는가** |
| application (증상) | "실무에서 뭐가 문제인가" | 약전계, TX Power 과다 |

physical 레이어는 **3GPP와 무관한 범용 RF 공학 지식**이라는 점에서 vendor 레이어와 다르다 (vendor는 "3GPP 비표준
이지만 특정 벤더의 구현"이고, physical은 "3GPP도 벤더도 아닌, RF 회로 자체의 보편 물리/공학 원리"). 이 레이어가
들어오면 그래프가 **"표준 → 벤더 구현 → 물리적 원인"**까지 한 번에 인과 체인으로 연결된다. 예:

```
증상(symptom-fbrx-power-error)
  ← explained_by ← qc-fbrx-closed-loop (벤더 구현)
    ← uses_parameter ← phy-param-p1db (물리 지표, 신규)
      ← explained_by ← phy-component-pa (PA 소자 자체, 신규)
```

## 2. 스키마 확장안

`docs/schema.md`에 아래를 추가한다 (기존 필드는 그대로 재사용, 파괴적 변경 없음).

| 항목 | 값 | 비고 |
|---|---|---|
| 신규 `layer` | `physical` | 기존 `base`/`application`/`vendor`에 추가 |
| 신규 `type` | `Component` | RF 회로 소자/블록 (PA, LNA, Mixer, Filter, Duplexer, Coupler, Isolator, VCO/PLL, Antenna 등) |
| 재사용 `type` | `Parameter`, `Formula`, `Procedure` | physical 레이어에서도 그대로 사용 — 예: P1dB/IP3/NF/VSWR은 `Parameter`, 임피던스 매칭 절차는 `Procedure`, VSWR 계산식은 `Formula` |
| `specRef` 필드 | `"일반 RF 회로 이론 — 3GPP 비표준"` 형태 | vendor 레이어의 `"3GPP 비표준 — ..."` 패턴을 그대로 따름. 특정 표준 조항이 없는 범용 공학 지식이므로 항상 비표준으로 명시 |
| 엣지 `relation` | 신규 타입 추가 없음 | 기존 `uses_parameter`/`affects`/`explained_by`/`computed_by`/`contains`로 충분히 표현 가능 (아래 4절 참고) |

`GraphNode`/`GraphEdge` 타입(`worker/src/lib/graphStore.ts`)의 `type`/`layer` 유니온에 `'Component'` / `'physical'`을
추가하는 것이 유일한 코드 변경이며, 이는 앞서 `Implementation`/`vendor`를 추가했을 때와 동일한 패턴이라 리스크가 낮다.

## 3. 프론트엔드 라벨링 계획

기존 5색 팔레트(Procedure 파랑, Message 초록, Parameter 보라, Formula 황토, Symptom 주황, Implementation 올리브)와
구분되는 새 색을 배정한다.

| 항목 | 값 |
|---|---|
| `TYPE_COLOR.Component` | `#6B7A94` (차분한 슬레이트블루 — 기존 팔레트의 파스텔 톤 유지, Procedure의 `#7C9BB5`와는 채도/톤으로 구분) |
| 노드 테두리 (`layer: physical`) | 실선, vendor(`#5C6650`)와 다른 색 `#4A5568` — vendor는 "벤더 고유 구현", physical은 "범용 이론"이라는 차이를 테두리 색으로도 구분 |
| 범례 버튼 | `<button class="lg" data-type="Component">...RF 소자</button>` 1개 추가 (기존 6번째 Implementation 다음, 7번째) |
| 배지(`showNodeDetail`) | `node.layer === 'physical' ? 'badge physical' : ...` 분기 추가, `.node-detail .badge.physical { background: #6B7A94; }` |

기존 `Parameter`/`Formula`/`Procedure` 타입을 physical 레이어에서도 재사용하므로, **타입 기준 범례 필터는 레이어와
무관하게 섞여서 표시된다** (예: "파라미터" 필터를 켜면 3GPP RSRP와 physical P1dB가 함께 보임). 이는 기존
Symptom(application)/Implementation(vendor)이 각각 전용 타입을 가진 것과 달리, physical은 기존 타입을 공유하기
때문에 생기는 특성이다. 레이어 단위로도 구분하고 싶다면 향후 "레이어 필터"를 타입 필터와 별도로 추가하는 것을
고려할 수 있음(이번 계획 범위 밖 — 필요성이 확인되면 별도 TODO로).

## 4. 수집 대상 키워드 (rfdh.com 목차 기반, 카테고리별)

id 접두사는 `phy-`로 통일. 아래는 예상 노드 목록과 대략적인 규모(실제 작성 시 조정 가능).

### 4-A. 전송선/임피던스 기초 (`phy-tl-*`) — Procedure/Parameter/Formula, 약 8노드
- `phy-tl-impedance` (특성 임피던스, 50Ω인 이유) · `phy-tl-transmission-line` (전송선 개념) · `phy-tl-reflection` (반사/정재파)
- `phy-tl-vswr` (VSWR, Formula) · `phy-tl-return-loss` (Return Loss, Formula) · `phy-tl-impedance-matching` (매칭 절차, Procedure)
- `phy-tl-microstrip` (마이크로스트립 라인) · `phy-tl-smith-chart` (Smith 차트 활용, Procedure)

### 4-B. S-파라미터/네트워크 이론 (`phy-sparam-*`) — Parameter, 약 5노드
- `phy-sparam-concept` (S11/S21/S12/S22 개념) · `phy-sparam-insertion-loss` (삽입 손실) · `phy-sparam-isolation` (격리도)
- `phy-sparam-gain` (이득) · `phy-sparam-network-analyzer` (측정 장비 개념, Procedure)

### 4-C. RF 소자 (`phy-component-*`) — **신규 타입 `Component`**, 약 10노드
- `phy-component-pa` (Power Amplifier) · `phy-component-lna` (Low Noise Amplifier) · `phy-component-mixer` (믹서/주파수 변환)
- `phy-component-vco-pll` (VCO/PLL, 국부발진기) · `phy-component-filter` (필터: LPF/HPF/BPF) · `phy-component-duplexer` (듀플렉서/디플렉서)
- `phy-component-coupler-divider` (커플러/디바이더) · `phy-component-isolator-circulator` (아이솔레이터/써큘레이터)
- `phy-component-antenna` (안테나 물리 원리 — 기존 `ant-*` 3GPP/구현 노드와 구분되는 "안테나 자체의 RF 이론"만)
- `phy-component-switch` (RF 스위치, 물리적 삽입손실/격리도 관점 — `qc-rffe-control`의 물리적 기반)

### 4-D. 왜곡/선형성 지표 (`phy-param-*`) — Parameter, 약 6노드 (이 프로젝트에서 가장 중요도 높은 그룹)
- `phy-param-p1db` (1dB 압축점) · `phy-param-ip3` (3차 상호변조 IP3) · `phy-param-imd` (Intermodulation Distortion)
- `phy-param-harmonic` (고조파) · `phy-param-nf` (Noise Figure) · `phy-param-linearity` (선형성 개념 총괄)

### 4-E. 변조/신호 기초 (`phy-mod-*`) — Parameter/Procedure, 약 4노드 (RF 프론트엔드가 왜곡에 민감한 이유와 직결)
- `phy-mod-iq` (I/Q 개념) · `phy-mod-evm` (EVM) · `phy-mod-papr` (PAPR, ET/APT와 직접 연결됨) · `phy-mod-constellation` (변조 방식별 왜곡 민감도)

총 예상 규모: **약 33개 노드**, 엣지는 카테고리 내부 연결 + 4절 하단의 브릿지 엣지 포함 약 45~55개.

## 5. 기존 그래프와의 연결 계획 (브릿지 엣지)

새 physical 노드가 고립되지 않도록, 기존 base/vendor 노드와 명시적으로 연결한다. 우선순위 높은 연결 지점:

| 기존 노드 | 관계 | 신규 physical 노드 | 의미 |
|---|---|---|---|
| `qc-fbrx-closed-loop` | `uses_parameter` | `phy-param-p1db` | FBRx가 보정하려는 게 결국 PA의 압축/선형성 |
| `qc-et-apt-tracking` | `uses_parameter` | `phy-mod-papr`, `phy-component-pa` | ET/APT가 대응하는 게 신호의 PAPR과 PA 특성 |
| `param-mpr`, `pc2-param-p-mpr`, `pc2-formula-pcmax` | `explained_by` | `phy-param-linearity`, `phy-param-imd` | 3GPP MPR/P-MPR 규정의 물리적 배경 |
| `endc2-formula-imd-frequency` | `explained_by` | `phy-param-imd`, `phy-param-harmonic` | 이미 있는 EN-DC IMD 계산식의 회로적 원인 |
| `qc-rffe-control` | `contains` | `phy-component-switch` | RFFE가 제어하는 물리적 대상 |
| `ant-power-split-loss-formula`, `ant-rf-requirements-vs-implementation` | `explained_by` | `phy-sparam-insertion-loss`, `phy-tl-impedance-matching` | 안테나 전력 분배 손실의 회로 이론적 근거 |
| `qc-symptom-et-tracking-distortion` (Symptom) | `explained_by` | `phy-param-p1db`, `phy-mod-papr` | 증상 → 벤더 구현 → 물리 원리까지 체인 완성 |
| `param-rsrp`, `param-bler` | (선택) `affects`(역방향 아님, physical→base는 신중히) | `phy-component-lna`(NF 관점) | LNA의 Noise Figure가 실제 감도에 영향 — 우선순위 낮음, 2차 확장 |

## 6. 데이터 수집/작성 원칙

- **원문 비복제**: rfdh.com 등 참고 사이트의 문장을 그대로 옮기지 않고, 개념을 이해한 뒤 이 프로젝트의 다른 노드들과
  같은 톤(실무 RF 엔지니어가 바로 이해할 수 있는 설명 + "왜 중요한가" 문장)으로 새로 서술한다.
- **specRef 표기**: `"일반 RF 회로 이론 — 3GPP 비표준"`을 기본으로 하되, 특정 소자가 3GPP RF 요구사항(예: TS 38.101-1의
  ACLR/스퓨리어스 마스크)과 직접 연결되는 경우 `qc-*` 노드처럼 관련 표준 조항을 참고로 덧붙인다.
- **verified**: 다른 레이어와 동일하게 초안은 `false`로 시작 — 검증은 TODO 후속 단계.
- **중복 방지**: 이미 있는 `ant-*`(안테나 RF 구현), `pc2-*`(전력제어 심화), `endc2-formula-imd-frequency`(IMD 계산식) 등과
  개념이 겹치는 지점은 새로 만들지 않고 브릿지 엣지로 연결한다(5절 참고).

## 7. 실행 계획 (완료)

- [x] **1단계 — 핵심 왜곡/선형성 지표** (`phy-param-*`, 4-D 카테고리): P1dB/IP3/IMD/고조파/NF/선형성 작성,
      `qc-fbrx-closed-loop`/`qc-et-apt-tracking`/`param-mpr`/`pc2-param-p-mpr`/`pc2-formula-pcmax`/
      `endc2-formula-imd-frequency`/`qc-symptom-*`와 연결해 "증상 → 벤더 구현 → 물리 원리" 체인 완성.
- [x] **2단계 — 소자/전송선/S-파라미터 기초** (4-A, 4-B, 4-C): 임피던스/VSWR/Smith 차트/S-파라미터와
      PA/LNA/믹서/VCO·PLL/필터/듀플렉서/커플러/아이솔레이터/안테나/스위치(신규 `Component` 타입) 작성.
- [x] **3단계 — 변조/신호 기초** (4-E): I/Q, EVM, PAPR, 성상도 작성 및 P1dB/EVM과 연결.
- [x] 병합 후 그래프 연결성(BFS) 265/265 재검증, `Component` 타입/`physical` 레이어 프론트엔드 반영(2절/3절), 배포.
- [x] README 데이터 현황 표·특징 섹션에 4번째 레이어로 추가.
