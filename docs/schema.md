# 그래프 스키마

## 노드 타입 (`type`)

| 타입 | 설명 | 레이어 |
|---|---|---|
| `Procedure` | 3GPP 절차 (예: RACH, Power Control) | base |
| `Message` | RRC/MAC 메시지 (예: RAR, MAC CE) | base |
| `Parameter` | IE/파라미터 (예: RSRP, P0, alpha) | base |
| `Formula` | 파라미터 간 계산식 | base |
| `Symptom` | 실무 디버깅 키워드/증상 (예: 약전계) | application |
| `Implementation` | 3GPP 비표준 벤더/칩셋 구현 기능 (예: 퀄컴 ASDIV, FBRx 폐루프 보정) | vendor |

## 노드 공통 필드

```json
{
  "id": "string (kebab-case, 고유)",
  "type": "Procedure | Message | Parameter | Formula | Symptom | Implementation",
  "layer": "base | application | vendor",
  "name_ko": "string",
  "name_en": "string",
  "description": "string",
  "specRef": "string, 예: 'TS 38.213 §7.1.1' (base 레이어 필수). vendor 레이어는 '3GPP 비표준 — ...' 형태로 비표준임을 명시하고, 관련 있는 표준 조항이 있으면 함께 적는다.",
  "verified": "boolean, 기본값 false — 사용자가 조항/공식을 직접 검증하면 true로 변경",
  "flow": "string, optional — Procedure 노드 전용. 메시지/단계 순서를 화살표로 나타낸 한 줄 흐름도. 예: 'UE → (Msg1: Preamble) → gNB → (Msg2: RAR, TA) → UE → (Msg3) → gNB → (Msg4) → UE'"
}
```

## 엣지 관계 타입 (`relation`)

| 관계 | 의미 | 방향 예시 |
|---|---|---|
| `contains` | 절차가 메시지/파라미터를 포함 | Procedure → Message |
| `triggers` | 메시지가 다음 절차/동작을 유발 | Message → Procedure |
| `uses_parameter` | 절차/공식이 파라미터를 사용 | Procedure/Formula → Parameter |
| `computed_by` | 파라미터가 공식으로 계산됨 | Parameter → Formula |
| `affects` | 한 base 파라미터가 다른 파라미터/절차의 값·동작에 영향 | Parameter → Parameter/Procedure |
| `causes` / `explained_by` | 응용 레이어 증상이 기반/벤더 레이어 메커니즘으로 설명됨, 또는 증상 간 인과 | Symptom → (Parameter/Formula/Procedure/Symptom/Implementation) |
| `mitigated_by` | 증상이 특정 메커니즘으로 완화됨 | Symptom → (Procedure/Parameter/Implementation) |

## 엣지 공통 필드

```json
{
  "id": "string (고유)",
  "from": "노드 id",
  "to": "노드 id",
  "relation": "contains | triggers | uses_parameter | computed_by | causes | explained_by | mitigated_by",
  "note": "string, optional — 관계에 대한 짧은 설명"
}
```

## 저장 형식

`data/seed-nodes.json`, `data/seed-edges.json` 각각 `{ "nodes": [...] }`, `{ "edges": [...] }` 형태의 배열. 배포 시 이 두 파일을 병합해 KV 키 `graph:v1`에 `{ "nodes": [...], "edges": [...] }` 형태의 단일 JSON blob으로 저장한다.
