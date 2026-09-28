// 과정 구성
// 단계(STAGES) > 과제(tasks). 과제마다 한 줄 설명(desc), 핵심(points), 따라하기(steps), 프롬프트(prompt), 입력 항목(fields)
// 입력 항목 종류: text, textarea, url, select, number, grid(표 입력), group(반복 묶음)

const JOURNEY = ["인지", "비교탐색", "경험", "구매", "공유", "사후관리"];
const AI_STEP = "프롬프트를 복사해 ChatGPT · Claude · Gemini 중 하나에 붙여 넣습니다.";

export const STAGES = [
  {
    id: "product",
    name: "내 제품 정의",
    chapter: "3장",
    desc: "내 사업을 일곱 가지 질문으로 정리합니다.",
    produce: ["내 비즈니스 정리 7항목"],
    points: [],
    tasks: [
      {
        id: "business",
        title: "내 비즈니스 정리",
        desc: "일곱 질문에 한 줄씩 답합니다. 이 내용은 이후 프롬프트에 자동으로 들어갑니다.",
        points: [
          "①~④는 비즈니스 모델 캔버스, ⑤~⑦은 린 캔버스",
          "숫자와 고유명사(지역, 채널명, 가격)로 구체적으로",
          "⑦ 경쟁우위는 가설로 적고 전략 기획 끝에 다시 수정"
        ],
        steps: [
          "입력칸의 회색 예시를 참고해 질문마다 한 줄로 답합니다.",
          "⑦은 지금 시점의 가설로 적습니다.",
          "저장합니다."
        ],
        fields: [
          { k: "q1", label: "① 무엇을 제공하는가", type: "text", ph: "조용한 1인 좌석 중심의 카페" },
          { k: "q2", label: "② 누가 쓰고 누가 내는가", type: "text", ph: "수성구에서 일하는 30~40대 직장인, 본인 결제" },
          { k: "q3", label: "③ 어떤 경로로 만나는가", type: "text", ph: "20석 매장, 네이버 플레이스 예약" },
          { k: "q4", label: "④ 어떻게 돈을 버는가", type: "text", ph: "단품 판매, 객단가 7,000원" },
          { k: "q5", label: "⑤ 규모는 어느 정도인가", type: "text", ph: "월 매출 1,800만원, 직원 2명" },
          { k: "q6", label: "⑥ 지금 가장 큰 문제는", type: "text", ph: "평일 오후 2~5시 공석률 높음" },
          { k: "q7", label: "⑦ 왜 경쟁사가 아니라 나인가", type: "text", ph: "옆자리 소음 없는 2시간 체류 (가설)" }
        ]
      }
    ]
  },

  {
    id: "strategy",
    name: "마케팅 전략 기획",
    chapter: "3장",
    desc: "프롬프트 카드 7종을 순서대로 실행해 디지털 마케팅 전략 기획서를 완성합니다.",
    produce: ["3C · PEST", "SWOT 교차전략", "고객 여정", "경쟁사 비교", "STP", "실행안과 목표"],
    points: [
      "세 도구 모두 같은 프롬프트, 결과는 표로 받기",
      "숫자 · 상호 · 규정은 직접 확인한 것만 반영",
      "카드 ①~③, ⑥~⑦은 같은 대화창에서 이어서 진행"
    ],
    tasks: [
      {
        id: "c3pest",
        card: "①",
        title: "3C · PEST 분석",
        desc: "고객 · 자사 · 경쟁사를 정리하고, 내 업종에 영향을 준 거시환경만 골라냅니다.",
        points: [
          "3C는 질문: 누가 사는가, 우리는 무엇을 가졌는가, 누가 먼저 가져갔는가",
          "PEST는 다 채우지 말고 실제 영향을 준 항목만",
          "출처 없는 숫자는 \"확인 필요\"로 표기"
        ],
        steps: [
          AI_STEP,
          "숫자와 경쟁사 정보는 직접 검색해 확인합니다.",
          "확인한 내용만 아래에 옮겨 저장합니다. 대화창은 닫지 않습니다."
        ],
        prompt: {
          body: "너는 10년 차 디지털 마케팅 컨설턴트다.\n내 사업은 다음과 같다.\n{{business}}\n\n위 사업에 대해 아래 두 가지를 표로 작성하라.\n1) 3C 분석 : Customer, Company, Competitor 각 4줄 이내\n2) PEST 분석 : 정치 · 경제 · 사회 · 기술 중 실제 영향이 큰 항목만 골라 이유를 한 줄씩\n\n조건\n· 추정한 내용에는 \"추정\"이라고 표시하라.\n· 수치를 제시할 경우 출처와 기준 시점, URL을 함께 적어라.\n· 확인되지 않으면 \"확인 불가\"라고 쓰고 지어내지 마라.",
          fallback: "[업종 / 지역 / 규모 / 주 고객 / 월 매출 / 판매 채널을 한 줄씩 적는다]"
        },
        fields: [
          { k: "customer", label: "Customer 고객", type: "textarea", ph: "누가 사는가 (4줄 이내)" },
          { k: "company", label: "Company 자사", type: "textarea", ph: "우리는 무엇을 가졌는가 (4줄 이내)" },
          { k: "competitor", label: "Competitor 경쟁", type: "textarea", ph: "누가 먼저 가져갔는가 (4줄 이내)" },
          { k: "pest", label: "PEST 선별 항목", type: "textarea", ph: "경제: 원두 시세 하락으로 원가 부담 완화" }
        ]
      },
      {
        id: "swot",
        card: "②",
        title: "SWOT 교차전략",
        desc: "SWOT을 교차해 이번 학기에 혼자 실행할 수 있는 전략 4개를 만듭니다.",
        points: [
          "내가 통제할 수 있으면 S · W, 없으면 O · T",
          "목적은 네 칸 채우기가 아니라 교차전략 4개",
          "AI가 지목한 근거 약한 항목 2개는 직접 확인"
        ],
        steps: [
          "카드 ①과 같은 대화창에 프롬프트를 붙여 넣습니다.",
          "틀린 칸은 내 사업 사정에 맞게 직접 고칩니다.",
          "저장합니다. 실습 ① 파일(학번_이름_실습1)은 링크로 함께 등록합니다."
        ],
        prompt: {
          body: "앞에서 작성한 3C와 PEST 결과만 근거로 삼아 아래를 수행하라.\n\n1) SWOT을 작성하라. 각 항목 4개 이내, 한 줄 20자 내외.\n2) SO, ST, WO, WT 교차전략을 각각 1개씩 도출하라.\n   단, 이번 학기에 내가 혼자 실행할 수 있는 수준으로 쓰라.\n3) 네가 작성한 SWOT 중 근거가 가장 약한 항목 2개를 지목하고\n   왜 약한지 설명하라.\n\n조건\n· 강점과 기회를 혼동하지 마라. 내가 통제할 수 있으면 S 또는 W다.\n· 모든 항목 앞에 근거가 된 3C · PEST 항목 번호를 표시하라."
        },
        fields: [
          { k: "s", label: "S 강점", type: "textarea" },
          { k: "w", label: "W 약점", type: "textarea" },
          { k: "o", label: "O 기회", type: "textarea" },
          { k: "t", label: "T 위협", type: "textarea" },
          { k: "so", label: "SO 전략", type: "text" },
          { k: "st", label: "ST 전략", type: "text" },
          { k: "wo", label: "WO 전략", type: "text" },
          { k: "wt", label: "WT 전략", type: "text" },
          { k: "file", label: "실습 ① 파일 링크 (선택)", type: "url", ph: "https://" }
        ]
      },
      {
        id: "journey",
        card: "③",
        title: "고객 구매 여정",
        desc: "인지부터 사후관리까지 고객의 행동, 채널, 불안, 필요한 정보를 정리하고 홈페이지가 맡을 단계를 고릅니다.",
        points: [
          "고객은 좋은 점이 아니라 불안이 풀릴 때 결제",
          "채널은 실제 서비스명으로 (네이버 플레이스, 인스타그램 릴스)",
          "홈페이지가 담당할 단계 하나를 고르는 것이 목적"
        ],
        steps: [
          "같은 대화창에 프롬프트를 붙여 넣습니다.",
          "내 지역 · 업종에 없는 채널은 지우고 빠진 채널은 추가합니다.",
          "홈페이지 담당 단계를 고르고 저장합니다. 실습 ② 파일(학번_이름_실습2)은 링크로 등록합니다."
        ],
        prompt: {
          body: "앞에서 작성한 3C와 SWOT을 근거로, 내 고객의 구매 여정을 6단계로 작성하라.\n\n단계 : 인지 - 비교탐색 - 경험 - 구매 - 공유 - 사후관리\n\n각 단계마다 아래 네 가지를 표의 열로 채워라.\n① 고객이 하는 행동   ② 그 행동이 일어나는 채널\n③ 고객이 느끼는 불안   ④ 내가 줘야 할 정보나 혜택\n\n조건\n· 채널은 \"소셜미디어\"처럼 뭉뚱그리지 말고 네이버 플레이스,\n  인스타그램 릴스처럼 실제 서비스명으로 적어라.\n· 마지막 줄에 \"홈페이지가 담당해야 할 단계\"를 하나 고르고 이유를 쓰라."
        },
        fields: [
          {
            k: "rows", label: "6단계 여정표", type: "grid", rows: JOURNEY,
            cols: [
              { k: "act", label: "행동" },
              { k: "ch", label: "채널" },
              { k: "worry", label: "불안" },
              { k: "give", label: "줄 정보 · 혜택" }
            ]
          },
          { k: "home", label: "홈페이지가 담당할 단계", type: "select", options: JOURNEY },
          { k: "homeWhy", label: "고른 이유", type: "text" },
          { k: "file", label: "실습 ② 파일 링크 (선택)", type: "url", ph: "https://" }
        ]
      },
      {
        id: "rivals",
        card: "④",
        title: "경쟁사 3곳 비교",
        desc: "실제 경쟁사 3곳의 가격, 강점, 약점을 비교하고 다르게 할 지점을 찾습니다.",
        points: [
          "경쟁사 가격은 AI 오답 1순위",
          "모르면 네이버 지도에서 반경 1km, 리뷰 상위 3곳",
          "가격 · 영업 여부 · SNS · 폐업 여부는 직접 확인"
        ],
        steps: [
          "새 대화창에 프롬프트를 붙여 넣습니다. 경쟁사 이름을 알면 직접 적습니다.",
          "가격과 운영 여부를 직접 확인합니다.",
          "확인한 내용만 저장합니다."
        ],
        prompt: {
          body: "너는 시장조사 담당자다.\n내 사업은 다음과 같다.\n{{business}}\n\n내 사업과 실제로 경쟁하는 업체 3곳을 선정하고,\n아래 항목을 표로 비교하라.\n\n상호 / 위치 또는 주요 판매 채널 / 가격대 / 주 타깃 /\n강점 / 약점 / 운영 중인 온라인 채널\n\n조건\n· 실존하지 않는 업체를 만들어내지 마라.\n· 확인이 어려운 항목은 \"확인 필요\"라고 표시하라.\n· 표 아래에 세 곳 모두와 다르게 할 수 있는 지점 2개를 제안하라.",
          fallback: "[업종 / 지역 / 규모 / 주 고객 / 가격대를 한 줄씩 적는다]"
        },
        fields: [
          {
            k: "list", label: "경쟁사", type: "group", count: 3,
            fields: [
              { k: "name", label: "상호", type: "text" },
              { k: "price", label: "가격대", type: "text" },
              { k: "plus", label: "강점", type: "text" },
              { k: "minus", label: "약점", type: "text" }
            ]
          },
          { k: "diff", label: "세 곳과 다르게 할 지점", type: "textarea" }
        ]
      },
      {
        id: "bench",
        card: "⑤",
        title: "경쟁사 홈페이지 벤치마킹",
        desc: "경쟁사 홈페이지 3곳을 보고 내 홈페이지에 꼭 들어갈 페이지를 정합니다.",
        points: [
          "공통 구조 → 내 사이트 메뉴 초안",
          "첫 화면 문구 → 내 카피의 비교 기준",
          "신뢰 요소 → 내가 넣어야 할 후기와 인증"
        ],
        steps: [
          "아래에 경쟁사 홈페이지 주소 3개를 먼저 저장하면 프롬프트에 자동으로 들어갑니다.",
          "새 대화창에 프롬프트를 붙여 넣습니다. AI가 페이지를 못 열면 직접 보고 적습니다.",
          "결과를 정리해 저장합니다."
        ],
        prompt: {
          body: "아래 세 곳의 홈페이지를 각각 분석하라.\n{{urls}}\n\n분석 항목\n① 첫 화면 문구 한 줄   ② 메뉴 구성\n③ 주요 버튼(CTA) 문구와 위치\n④ 신뢰 요소 (후기, 수상, 인증, 사진, 숫자)\n⑤ 연락 또는 예약 방법\n\n마지막으로 세 곳의 공통 구조를 표로 정리하고,\n내 홈페이지에 반드시 들어가야 할 페이지 목록을 제안하라.\n\n조건 : 페이지를 열 수 없으면 추측하지 말고 \"접근 불가\"라고 적어라.",
          fallback: "[URL 1 / URL 2 / URL 3]"
        },
        fields: [
          {
            k: "list", label: "홈페이지", type: "group", count: 3,
            fields: [
              { k: "url", label: "주소", type: "url", ph: "https://" },
              { k: "hero", label: "첫 화면 문구", type: "text" },
              { k: "trust", label: "신뢰 요소", type: "text" }
            ]
          },
          { k: "pages", label: "내 홈페이지에 꼭 들어갈 페이지", type: "textarea", ph: "소개 / 메뉴 / 예약 / 후기 / 오시는 길" }
        ]
      },
      {
        id: "stp",
        card: "⑥",
        title: "STP와 포지셔닝",
        desc: "시장을 4개로 나누고 1순위 타깃을 고른 뒤, 나의 위치를 한 문장과 맵으로 정합니다.",
        points: [
          "4개로 나누고 1개를 고르는 것이 타깃 결정",
          "\"모두\" · \"누구나\"가 타깃이면 문구를 쓸 수 없음",
          "포지셔닝 문장에는 경쟁사와 다른 점이 있어야 함"
        ],
        steps: [
          "앞의 분석이 남아 있는 대화창에 프롬프트를 붙여 넣습니다.",
          "세그먼트가 겹치지 않는지, 1순위 근거가 앞 분석에서 나왔는지 확인합니다.",
          "맵 좌표(-5~5)까지 입력해 저장하면 대시보드에 포지셔닝 맵이 그려집니다."
        ],
        prompt: {
          body: "지금까지 작성한 3C, PEST, SWOT, 고객여정, 경쟁사 비교표를\n모두 근거로 삼아 STP를 도출하라.\n\n1) Segmentation : 내 시장을 4개 세그먼트로 나누고\n   각 세그먼트의 규모, 특징, 구매 이유를 표로 정리하라.\n2) Targeting : 4개 중 1순위와 2순위를 고르고 그 순서의 근거를\n   앞의 분석 항목을 인용해 설명하라.\n3) Positioning : 1순위 타깃에게 내가 무엇으로 기억되어야 하는지\n   한 문장으로 쓰고, 경쟁사 3곳과 나를 2축 포지셔닝 맵의\n   좌표로 표현하라. 축 이름도 네가 정하고 이유를 밝혀라.\n\n조건 : \"모두\", \"전 연령\", \"누구나\" 같은 표현을 쓰지 마라."
        },
        fields: [
          {
            k: "segs", label: "세그먼트", type: "group", count: 4,
            fields: [{ k: "name", label: "이름", type: "text" }, { k: "desc", label: "특징 · 구매 이유", type: "text" }]
          },
          { k: "first", label: "1순위 타깃", type: "select", options: ["세그먼트 1", "세그먼트 2", "세그먼트 3", "세그먼트 4"] },
          { k: "second", label: "2순위 타깃", type: "select", options: ["세그먼트 1", "세그먼트 2", "세그먼트 3", "세그먼트 4"] },
          { k: "position", label: "포지셔닝 한 문장", type: "text", ph: "혼자 두 시간을 눈치 없이 앉을 수 있는 자리" },
          { k: "axisX", label: "가로축 (왼쪽 ↔ 오른쪽)", type: "text", ph: "저가 ↔ 고가" },
          { k: "axisY", label: "세로축 (아래 ↔ 위)", type: "text", ph: "빠른 회전 ↔ 오래 머무름" },
          {
            k: "map", label: "맵 좌표", type: "group", count: 4, names: ["나", "경쟁사 1", "경쟁사 2", "경쟁사 3"],
            fields: [
              { k: "name", label: "이름", type: "text" },
              { k: "x", label: "가로", type: "number", min: -5, max: 5 },
              { k: "y", label: "세로", type: "number", min: -5, max: 5 }
            ]
          }
        ]
      },
      {
        id: "plan",
        card: "⑦",
        title: "실행안과 3개월 목표",
        desc: "고객 여정의 약한 단계를 고칠 실행안과 3개월 숫자 목표를 정합니다.",
        points: [
          "4P는 내가 할 일, 4C는 고객이 느끼는 것",
          "약한 단계마다 0원 안부터, 이번 주에 바로 착수",
          "목표는 [채널]에서 [지표]를 [현재값]에서 [목표값]으로"
        ],
        steps: [
          "같은 대화창에 프롬프트를 붙여 넣습니다.",
          "약한 단계 2개의 실행안과 목표 3개를 옮겨 적습니다. 현재값을 모르면 \"측정 필요\"로 씁니다.",
          "저장합니다."
        ],
        prompt: {
          body: "앞에서 고른 STP 1순위 타깃을 기준으로 실행안과 목표를 만들어라.\n\n1) 4P와 4C를 한 표에 나란히 정리하라.\n   Product, Price, Place, Promotion과 그것의 고객 관점 번역.\n2) 고객여정 6단계 중 지금 가장 약한 단계 2개를 고르고,\n   그 단계를 개선할 온라인 실행안을 각 2개씩 제안하라.\n   예산 0원 안과 월 30만원 안으로 구분하라.\n3) 3개월 목표를 숫자로 쓰라.\n   형식 : [채널]에서 [지표]를 [현재값]에서 [목표값]으로.\n   현재값을 모르면 \"측정 필요\"로 쓰고 측정 방법을 한 줄 적어라.\n\n조건 : 실행안은 내가 혼자 실행할 수 있는 수준으로 쓰라."
        },
        fields: [
          {
            k: "weak", label: "약한 단계와 실행안", type: "group", count: 2,
            fields: [
              { k: "stage", label: "약한 단계", type: "select", options: JOURNEY },
              { k: "free", label: "0원 안", type: "text" },
              { k: "paid", label: "월 30만원 안", type: "text" }
            ]
          },
          {
            k: "goals", label: "3개월 목표", type: "group", count: 3,
            fields: [
              { k: "channel", label: "채널", type: "text", ph: "네이버 플레이스" },
              { k: "metric", label: "지표", type: "text", ph: "월 유입" },
              { k: "now", label: "현재값", type: "text", ph: "측정 필요" },
              { k: "target", label: "목표값", type: "text", ph: "400명" }
            ]
          }
        ]
      },
      {
        id: "summary",
        card: "",
        title: "한 문장 요약",
        desc: "전략 기획서 전체를 한 문장으로 압축합니다. 앞으로 만드는 홈페이지와 광고 문구의 기준이 됩니다.",
        points: [
          "나는 [타깃]에게 [경쟁사와 다른 가치]를 [채널]로 전달해 [여정 단계]를 공략한다",
          "STP 1순위와 포지셔닝 문장, 고객 여정에서 가져오기",
          "1단계 ⑦ 경쟁우위도 이 문장에 맞게 다시 수정"
        ],
        steps: [
          "네 칸을 채우고 저장합니다.",
          "대시보드 점검표에서 빈 과제를 확인해 마저 채웁니다."
        ],
        fields: [
          { k: "target", label: "타깃", type: "text", ph: "수성구에서 일하는 30~40대 직장인" },
          { k: "value", label: "경쟁사와 다른 가치", type: "text", ph: "혼자 두 시간을 눈치 없이 앉을 수 있는 자리" },
          { k: "channel", label: "채널", type: "text", ph: "네이버 플레이스와 인스타그램 릴스" },
          { k: "stage", label: "여정 단계", type: "select", options: JOURNEY },
          { k: "file", label: "통합 기획서 파일 링크 (선택)", type: "url", ph: "https://" }
        ]
      }
    ]
  },

  { id: "vibecoding", name: "바이브코딩", chapter: "", desc: "전략 기획서를 근거로 AI와 함께 홈페이지를 만듭니다.", produce: [], points: [], tasks: [] },
  { id: "execution", name: "광고 운영", chapter: "", desc: "만든 페이지에 광고와 분석 도구를 연결해 운영합니다.", produce: [], points: [], tasks: [] },
  { id: "analysis", name: "성과분석", chapter: "", desc: "3개월 목표와 비교해 성과를 평가합니다.", produce: [], points: [], tasks: [] }
];

export const TYPES = ["슬라이드", "문서", "실습", "영상", "웹페이지", "기타"];
