# online-marketing-2026

온라인마케팅실전 학습자료 페이지

## 과정 흐름

내 제품 정의 > 마케팅 전략 기획 > 바이브코딩 > 마케팅 연동 및 실행 > 성과분석

## 학습자료 올리는 방법

1. `index.html` 상단 `PROFILE`에 이름, 학과, 학번을 입력합니다.
2. 파일을 `materials/` 아래 단계별 폴더에 넣습니다.
   - `01-product` 내 제품 정의
   - `02-strategy` 마케팅 전략 기획
   - `03-vibecoding` 바이브코딩
   - `04-execution` 마케팅 연동 및 실행
   - `05-analysis` 성과분석
3. `index.html`의 `STAGES`에서 해당 단계 `materials` 배열에 한 줄을 추가합니다.

```js
{ title: "자료 제목", type: "슬라이드", date: "2026-09-01", url: "materials/01-product/파일.pdf", desc: "한 줄 설명" }
```

외부 링크(구글 슬라이드, 유튜브 등)는 `url`에 전체 주소를 적으면 됩니다.
