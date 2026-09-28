# online-marketing-2026

온라인마케팅실전 수강생 학습 포트폴리오

## 과정 흐름

내 제품 정의 > 마케팅 전략 기획 > 바이브코딩 > 광고 운영 > 성과분석

## 화면 구성

- **로그인 전**: 과정 흐름과 로그인 안내. 단계와 과제 페이지는 로그인 없이 볼 수 있습니다.
- **대시보드** (로그인 후 첫 화면): 학과, 학번과 단계별 진행률, 저장한 과제 결과(3C, SWOT, 고객여정, 경쟁사 비교, 포지셔닝 맵, 목표, 한 문장 요약)를 한눈에 정리합니다.
- **단계 페이지** `#/stage/<단계>`: 상단 설명, 핵심 3줄, 과제 목록.
- **내정보** `#/profile`: 이름, 학과, 학번 수정과 로그아웃. 처음 로그인하면 이 화면으로 옵니다.
- **과제 페이지** `#/stage/<단계>/<번호>`: 상단 설명, 핵심 3줄, 따라하기, 프롬프트(복사, 내 정보 자동 채움), 결과 저장.
- **전체보기**: 이름, 학과, 학번과 과제 완료율 목록. 이름을 누르면 해당 학생의 대시보드를 열람합니다.

학생은 구글 계정으로 로그인합니다. 로그인한 사람만 결과를 볼 수 있고, 수정은 본인만 할 수 있습니다.

## 강의 내용 추가

`guide.js`의 `STAGES`에서 단계마다 `tasks` 배열에 과제를 추가합니다. 과제는 설명(`desc`), 핵심 3줄(`points`), 따라하기(`steps`), 프롬프트(`prompt`), 입력 항목(`fields`)으로 구성됩니다. 강의 자료 본문은 별도 배포하고 이 페이지에는 과제 수행에 필요한 내용만 둡니다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `index.html` | 화면 틀과 스타일 |
| `app.js` | 화면 동작 |
| `guide.js` | 단계와 과제, 강의 내용 |
| `firebase-config.js` | Firebase 프로젝트 설정값 |
| `firestore.rules` | 데이터베이스 보안 규칙 (열람은 로그인 사용자, 수정은 본인만) |

## Firebase 설정 (최초 1회)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다.
2. **Authentication** > 시작하기 > 로그인 방법(Sign-in method)에서 **Google**을 사용 설정합니다.
3. **Firestore Database** > 데이터베이스 만들기에서 위치를 `asia-northeast3 (서울)`로 선택하고 프로덕션 모드로 만듭니다.
4. Firestore의 **규칙(Rules)** 탭에 `firestore.rules` 내용을 붙여 넣고 게시합니다.
5. 프로젝트 설정 > 일반 > 내 앱에서 웹 앱(`</>`)을 추가하고, 나오는 `firebaseConfig` 값을 `firebase-config.js`에 붙여 넣습니다.
6. Authentication > 설정 > **승인된 도메인**에 페이지 주소의 도메인(예: `jjerrykim.github.io`)을 추가합니다.

## 배포 (GitHub Pages)

저장소 Settings > Pages에서 배포할 브랜치와 `/ (root)` 폴더를 선택하면 `https://jjerrykim.github.io/online-marketing-2026/` 주소로 열립니다.

## 참고

- 카카오톡 등 앱 안의 브라우저에서는 구글 로그인이 막힐 수 있습니다. Chrome이나 Safari로 열도록 안내해 주세요.
- 학생 자료를 교수자가 직접 고치거나 지우려면 Firebase 콘솔의 Firestore 데이터 화면에서 `students` 컬렉션을 수정합니다.
- `firebase-config.js`의 값은 브라우저에 공개되는 식별 정보이며 비밀번호가 아닙니다. 데이터 보호는 `firestore.rules`가 담당합니다.
