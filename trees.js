// 광고 운영 · 성과분석 트리
// t: 이름, en: 영문 보조, note: 설명, c: 하위 항목
// kind: act(개선 행동), via(거쳐 가는 단계, 숫자 입력 없음), drop(이탈), 없으면 숫자를 입력하는 단계

const N = (t, c, o = {}) => ({ t, c, ...o });
const act = t => ({ t, kind: "act" });
const acts = (...ts) => ts.map(act);

export const PROMO = N("촉진", [
  N("광고", [
    N("오프라인", [
      N("페이드", [N("매스미디어"), N("OOH"), N("인쇄물")], { en: "Paid" })
    ]),
    N("온라인", [
      N("페이드", [
        N("검색광고 SA", [N("네이버"), N("구글"), N("커머스 플랫폼")], { en: "Search Ads" }),
        N("이미지광고 DA", [N("네이버"), N("페이스북"), N("인스타그램"), N("유튜브"), N("커머스 플랫폼")], { en: "Display Ads" })
      ], { en: "Paid" }),
      N("오가닉", [
        N("검색노출", [
          N("SEO", [N("네이버"), N("구글"), N("인스타그램"), N("커머스 플랫폼")])
        ], { en: "Search Impression" }),
        N("이미지노출", [
          N("인기도 순", [N("페이스북"), N("인스타그램"), N("네이버")])
        ], { en: "Display Impression" })
      ], { en: "Organic" })
    ])
  ], { en: "Advertising" }),
  N("홍보", [N("오가닉", undefined, { en: "Organic" })], { en: "Public Relations" }),
  N("판매촉진", [
    N("가격 수단", [N("쿠폰"), N("적립금"), N("샘플"), N("세일")]),
    N("비가격 수단", [N("디스플레이")])
  ], { en: "Sales Promotion" }),
  N("인적판매", undefined, { en: "Personal Selling" })
], { en: "Promotion", note: "상품에 대한 인지/전환을 위한 커뮤니케이션활동" });

// 클릭 이후 공통 가지
const buy = () => N("구매", [
  N("재구매"),
  N("재구매 안 함", acts("제품 퀄리티 보완", "CRM 마케팅 개선"), { kind: "drop" })
]);
const cart = (a, b) => N("장바구니", [a, b]);
const cartLeave = () => N("이탈", [act("리타겟팅 재노출(AI학습)")], { kind: "drop" });

export const DIRECT = N("광고노출", [
  N("클릭 함", [
    buy(),
    N("이탈", acts("상세페이지 개선", "리뷰 개선", "가격전략 개선", "페이지 로딩속도 개선", "결제 편의성 개선"), { kind: "drop" }),
    N("장바구니", [cartLeave(), N("추후 구매")], { en: "고려" })
  ]),
  N("클릭 안 함", [
    N("타겟 제외(AI 학습)", [act("해당 타겟에게 광고를 보여주지 않음")], { kind: "act" }),
    act("광고소재 개선")
  ], { kind: "drop" })
], { en: "직접전환" });

const afterDetail = () => [
  buy(),
  N("이탈", acts("리뷰 개선", "상세페이지 개선", "가격전략 개선", "페이지 로딩속도 개선", "결제 편의성 개선"), { kind: "drop" }),
  cart(cartLeave(), N("추후에 구매"))
];

export const INDIRECT = N("광고노출", [
  N("저장/좋아요/댓글/공유", [
    N("리타겟팅(AI학습)", [
      N("클릭(상세페이지 도착)", afterDetail()),
      N("클릭 안 함", [
        N("타겟 제외", [act("해당 타겟에게 광고를 보여주지 않음")], { kind: "act" }),
        act("광고소재 개선")
      ], { kind: "drop" })
    ], { kind: "via" })
  ]),
  N("인스타 피드에 방문", [
    N("외부링크 클릭", [
      N("상세페이지 도착", afterDetail(), { kind: "via" })
    ]),
    N("팔로우", [
      N("추후에 구매"),
      N("구매 안 함(고민 상태)", [act("브랜딩/소구점 설득력 개선")], { kind: "drop" })
    ]),
    N("팔로우 안 함(이탈)", [act("브랜딩/소구점 설득력 개선")], { kind: "drop" })
  ]),
  N("브랜드/제품명 검색", [
    N("검색결과에 제품 노출", [
      buy(),
      N("이탈", acts("SEO 개선", "경쟁사 분석", "키워드 검색광고 집행"), { kind: "drop" }),
      cart(N("추후에 구매"), cartLeave())
    ]),
    N("검색결과에 제품 노출 안 됨", [
      N("이탈", acts("SEO 기초 세팅", "경쟁사 분석", "키워드 검색광고 집행"), { kind: "via" })
    ], { kind: "drop" })
  ])
], { en: "간접전환" });

// 경로 기반 id 부여 (저장 키로 사용)
function assign(node, id, depth, parent) {
  node.id = id; node.depth = depth; node.parent = parent;
  (node.c || []).forEach((ch, i) => assign(ch, `${id}_${i}`, depth + 1, node));
  return node;
}
[PROMO, DIRECT, INDIRECT].forEach(tr => assign(tr, "n", 0, null));

export const walk = (node, fn) => { fn(node); (node.c || []).forEach(ch => walk(ch, fn)); };
export const isCount = n => !n.kind || n.kind === "drop";
