# 로드맵 (향후 확장)

## 디바이스 인스턴스 레이어

UE Capability(`UE-NR-Capability` 등)의 **스키마 자체는 3GPP 표준(공통)**이지만, 그 안에 실제로 채워지는 값(지원 밴드 조합, feature set, MIMO 레이어 수, 전력 클래스 등)은 **칩셋/디바이스 제조사마다 다르다**.

이번 구현 범위에서는 다루지 않으며, 향후 다음과 같은 형태로 확장할 수 있다:

- 새 노드 타입 `DeviceInstance` 추가 (예: `id: qualcomm-x75`, `vendor`, `chipset`, `supportedBands`, `caCombinations` 등)
- `DeviceInstance --supports--> Parameter/Procedure` 형태의 엣지로, 표준 스키마(base 레이어) 위에 실제 지원 여부를 매핑
- 데이터 출처: 3GPP 문서만으로는 알 수 없으므로 GCF/PTCRB 인증 정보, 칩벤더 데이터시트, 실측 UE Capability 덤프 등 별도 소스 필요
- 그래프 저장 구조상 `graph:v1` blob에 세 번째 레이어(`layer: "device"`)로 추가하거나, 규모가 커지면 별도 KV 키/네임스페이스로 분리 검토

## 기타 확장 후보

- 전력제어/RACH 외 도메인 확장: CA/EN-DC 밴드 조합, RRM 측정/핸드오버, NAS 절차 등
- 검색 정확도 향상: 키워드 매칭 대신 임베딩 기반 유사도 검색(Vectorize) 도입
- 데이터 규모 증가 시 KV 단일 blob → D1(SQL) 또는 KV 개별 키 구조로 전환
