import { firebaseConfig } from "./firebase-config.js";
import { STAGES } from "./guide.js";
import { CASE } from "./case.js";
import { PROMO, DIRECT, INDIRECT, walk, isCount } from "./trees.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1";

/* 공통 함수 */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = s => esc(s).replace(/\n/g, "<br>");
// 받침에 따라 조사 선택 (을/를, 으로/로). 으로는 ㄹ 받침이면 로
function josa(word, withFinal, noFinal) {
  const m = String(word).match(/[가-힣a-zA-Z0-9](?=[^가-힣a-zA-Z0-9]*$)/);
  if (!m) return noFinal;
  const ch = m[0];
  let fin = 0, rieul = false;
  if (/[가-힣]/.test(ch)) { fin = (ch.charCodeAt(0) - 0xac00) % 28; rieul = fin === 8; }
  else if (/[0-9]/.test(ch)) { fin = "013678".includes(ch) ? 1 : 0; rieul = "178".includes(ch); }
  else { const c = ch.toLowerCase(); fin = "lmnr".includes(c) ? 1 : 0; rieul = c === "l" || c === "r"; }
  if (!fin) return noFinal;
  return withFinal === "으로" && rieul ? noFinal : withFinal;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function safeUrl(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}
function hasValue(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.some(hasValue);
  if (typeof v === "object") return Object.values(v).some(hasValue);
  return false;
}
function flash(el, ok, msg) {
  if (!el) return;
  el.innerHTML = msg;
  el.className = "note mono" + (ok ? " ok" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ""; }, 5000);
}
const ICON = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  ur: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  copy: "M9 9h10v10H9zM5 15V5h10"
};
const icon = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;

/* 데이터 접근 */
const taskKey = (stage, task) => `${stage.id}_${task.id}`;
const resultOf = (s, stage, task) => s?.results?.[taskKey(stage, task)] || null;
const taskDone = (s, stage, task) => hasValue(resultOf(s, stage, task));
const stageOf = id => STAGES.find(s => s.id === id);
const allTasks = () => STAGES.flatMap(st => st.tasks.map(t => ({ stage: st, task: t })));
function stageProgress(s, st) {
  const done = st.tasks.filter(t => taskDone(s, st, t)).length;
  return { done, total: st.tasks.length };
}
function businessText(s) {
  const r = resultOf(s, STAGES[0], STAGES[0].tasks[0]);
  if (!hasValue(r)) return "";
  return STAGES[0].tasks[0].fields.filter(f => r[f.k]).map(f => `${f.label.slice(2)} : ${r[f.k]}`).join("\n");
}

/* 상태 */
const app = { fb: null, user: null, authReady: false, students: new Map(), loaded: false, error: "" };
const configured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && !/^YOUR/i.test(firebaseConfig.apiKey));
const me = () => (app.user ? app.students.get(app.user.uid) : null);

/* Firebase */
let unsubscribe = null;
async function initFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`)
  ]);
  const fbApp = appMod.initializeApp(firebaseConfig);
  app.fb = { auth: authMod.getAuth(fbApp), db: fsMod.getFirestore(fbApp), authMod, fsMod };
  authMod.onAuthStateChanged(app.fb.auth, user => {
    app.user = user;
    app.authReady = true;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    app.students.clear();
    app.loaded = false;
    if (user) listen();
    mounted = "";
    route();
  });
}
function listen() {
  const { db, fsMod } = app.fb;
  unsubscribe = fsMod.onSnapshot(fsMod.collection(db, "students"), snap => {
    app.students.clear();
    snap.forEach(d => app.students.set(d.id, d.data()));
    app.loaded = true;
    app.error = "";
    paint();
  }, err => {
    app.error = err.code === "permission-denied" ? "열람 권한이 없습니다." : "자료를 불러오지 못했습니다.";
    app.loaded = true;
    paint();
  });
}
async function login() {
  if (!app.fb) return;
  const { auth, authMod } = app.fb;
  try {
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await authMod.signInWithRedirect(auth, new authMod.GoogleAuthProvider());
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      alert("로그인하지 못했습니다. 카카오톡 등 앱 안의 브라우저라면 Chrome이나 Safari로 열어 주세요.");
    }
  }
}
const logout = () => app.fb.authMod.signOut(app.fb.auth);
async function saveMine(patch) {
  const { db, fsMod } = app.fb;
  await fsMod.setDoc(fsMod.doc(db, "students", app.user.uid), { ...patch, updatedAt: fsMod.serverTimestamp() }, { merge: true });
}

/* 라우팅 */
let mounted = "";
function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (parts[0] === "stage" && stageOf(parts[1])) {
    const st = stageOf(parts[1]);
    const n = parseInt(parts[2], 10);
    if (n >= 1 && n <= st.tasks.length) return { name: "task", stage: st, index: n - 1 };
    return { name: "stage", stage: st };
  }
  if (parts[0] === "s" && parts[1]) return { name: "student", uid: parts[1] };
  if (parts[0] === "class") return { name: "class" };
  if (parts[0] === "profile") return { name: "profile" };
  if (parts[0] === "import") return { name: "import" };
  if (parts[0] === "case") return { name: "case" };
  if (parts[0] === "file" && parts[1] && parts[2]) return { name: "file", uid: parts[1], fid: parts[2] };
  return { name: "home" };
}
function routeKey(r) {
  if (!configured) return "setup";
  if (!app.authReady) return "wait";
  if (r.name === "stage") return "stage:" + r.stage.id;
  if (r.name === "task") return `task:${r.stage.id}:${r.index}`;
  if (r.name === "case") return "dash:case";
  if (!app.user) return "gate";
  if (r.name === "student") return r.uid === app.user.uid ? "dash:" + r.uid : "dash:" + r.uid;
  if (r.name === "class") return "class";
  if (r.name === "profile") return "profile";
  if (r.name === "import") return "import";
  if (r.name === "file") return `file:${r.uid}:${r.fid}`;
  return "dash:" + app.user.uid;
}
function route() {
  const r = currentRoute();
  renderNav(r);
  const key = routeKey(r);
  if (key !== mounted) {
    mounted = key;
    $("view").classList.remove("anim");
    dashObserver?.disconnect();
    if (key === "setup") mountSetup();
    else if (key === "wait") $("view").innerHTML = `<p class="empty mono">불러오는 중</p>`;
    else if (key === "gate") mountGate();
    else if (key === "class") mountClass();
    else if (key === "profile") mountProfile();
    else if (key.startsWith("file:")) { const [, u, f] = key.split(":"); mountFile(u, f); }
    else if (key === "import") mountImport();
    else if (key.startsWith("dash:")) mountDashboard(key.slice(5));
    else if (key.startsWith("stage:")) mountStage(r.stage);
    else if (key.startsWith("task:")) mountTask(r.stage, r.index);
    window.scrollTo({ top: 0 });
  }
  paint();
}
function paint() {
  if (mounted === "class") paintClass();
  else if (mounted === "profile") paintProfile();
  else if (mounted.startsWith("file:")) { const [, u, f] = mounted.split(":"); paintFile(u, f); }
  else if (mounted.startsWith("dash:")) paintDashboard(mounted.slice(5));
  else if (mounted.startsWith("stage:")) paintStage(stageOf(mounted.slice(6)));
  else if (mounted.startsWith("task:")) { const [, sid, i] = mounted.split(":"); paintTask(stageOf(sid), +i); }
}
window.addEventListener("hashchange", route);

/* 상단 메뉴 */
function renderNav(r) {
  if (!configured) { $("nav").innerHTML = ""; return; }
  const caseLink = `<a class="link" href="#/case" ${r.name === "case" ? 'aria-current="page"' : ""}>케이스예시</a>`;
  if (!app.user) {
    $("nav").innerHTML = app.authReady ? `${caseLink}<button class="link mono" type="button" data-act="login">로그인</button>` : "";
    return;
  }
  const dash = r.name === "home" || (r.name === "student" && r.uid === app.user.uid);
  $("nav").innerHTML = `
    <a class="link" href="#/" ${dash ? 'aria-current="page"' : ""}>대시보드</a>
    <a class="link" href="#/class" ${r.name === "class" || (r.name === "student" && !dash) ? 'aria-current="page"' : ""}>전체보기</a>
    <a class="link" href="#/profile" ${r.name === "profile" ? 'aria-current="page"' : ""}>내정보</a>
    ${caseLink}
    <button class="link mono hide-sm" type="button" data-act="logout">로그아웃</button>`;
}
document.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  const a = act.dataset.act;
  if (a === "login") login();
  else if (a === "logout") logout();
  else if (a === "copy") copyPrompt(act);
});

/* 공통 조각 */
function introHtml(title, sub, side = "", back = "") {
  return `<header class="intro"><div>${back}<h1>${title}<span class="sub">${sub}</span></h1></div>${side}</header>`;
}
function flowLinks(render) {
  return `<nav aria-label="과정 흐름"><ol class="flow">${STAGES.map((s, i) => `
    <li><a class="cell" href="#/stage/${s.id}">
      <span class="idx mono"><span>${pad(i + 1)}</span><span class="arrow">${icon("right")}</span></span>
      <span class="name">${esc(s.name)}</span>
      ${render ? render(s, i) : `<span class="mono muted">${s.tasks.length ? `과제 ${s.tasks.length}개` : "준비 중"}</span>`}
    </a></li>`).join("")}</ol></nav>`;
}
function bar(done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<span class="rate"><span class="track"><span style="width:${pct}%"></span></span></span>`;
}
const backLink = (href, text) => `<a class="back mono" href="${href}">${icon("left")}${esc(text)}</a>`;

/* 설정 전, 로그인 전 */
function mountSetup() {
  $("view").innerHTML = `
    ${introHtml("온라인마케팅실전", "학습 포트폴리오")}
    ${flowLinks()}
    <section class="notice"><h2>Firebase 설정이 필요합니다</h2><p>firebase-config.js 파일에 Firebase 프로젝트 설정값을 입력하세요.</p></section>`;
}
function mountGate() {
  $("view").innerHTML = `
    ${introHtml("온라인마케팅실전", "학습 포트폴리오", `<p class="lead">다섯 단계의 과정을 순서대로 따라 하며 결과물을 저장하면, 내 대시보드에 전략 기획서가 정리됩니다.</p>`)}
    ${flowLinks()}
    <section class="notice">
      <h2>로그인하고 시작하세요</h2>
      <div class="lines">
        <p>구글 계정으로 로그인하면 과제 결과를 저장하고 다른 수강생의 대시보드를 볼 수 있습니다.</p>
        <p>카카오톡 등 앱 안의 브라우저에서는 로그인이 막힐 수 있으니 Chrome이나 Safari로 열어 주세요.</p>
      </div>
      <button class="btn" type="button" data-act="login">구글 계정으로 로그인</button>
    </section>`;
}

/* 핵심 */
function pointsHtml(points) {
  if (!points?.length) return "";
  return `<ol class="points">${points.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`;
}

/* 대시보드 */
let dashAnim = false, dashObserver = null;
const dashTab = {};
function mountDashboard(uid) {
  dashAnim = true;
  const mine = uid === app.user?.uid;
  const side = `<div class="side"><dl class="facts" id="facts"></dl></div>`;
  $("view").innerHTML = `
    <header class="intro">
      <div>${mine || uid === "case" ? "" : backLink("#/class", "전체보기")}<h1 id="headline"></h1></div>
      ${side}
    </header>
    <div class="stats" id="stats"></div>
    <div id="oneline"></div>
    <nav class="dash-tabs" aria-label="과정 단계"><ol class="flow" id="flow" role="tablist"></ol></nav>
    <main id="board"></main>`;
}
function paintDashboard(uid) {
  const mine = uid === app.user?.uid;
  const s = uid === "case" ? CASE : app.students.get(uid);
  if (!s && !mine) { $("headline").innerHTML = app.loaded ? "학생을 찾을 수 없습니다" : "불러오는 중"; return; }
  const data = s || {};
  $("headline").innerHTML = `${esc(data.name || "이름")}<span class="sub">${uid === "case" ? "케이스 예시" : "학습 대시보드"}</span>`;
  document.title = data.name ? `${data.name} | 온라인마케팅실전` : "온라인마케팅실전 학습 포트폴리오";

  $("facts").innerHTML = (data.facts || [["학과", data.dept], ["학번", data.sid]]).map(([k, v]) => `<dt class="mono">${k}</dt><dd>${esc(v || "-")}</dd>`).join("");
  if (mine && app.loaded && !data.name) { location.replace("#/profile"); return; }

  const tasks = allTasks();
  const next = tasks.find(x => !taskDone(data, x.stage, x.task));
  if (!stageOf(dashTab[uid])) dashTab[uid] = STAGES[0].id;
  $("flow").innerHTML = STAGES.map((st, i) => {
    const p = stageProgress(data, st);
    const label = st.tasks.length ? `${p.done} / ${p.total}` : "준비 중";
    const on = dashTab[uid] === st.id;
    return `<li><button type="button" class="cell" role="tab" aria-selected="${on}" aria-controls="board" data-tab="${st.id}">
      <span class="idx mono"><span>${pad(i + 1)}</span></span>
      <span class="name">${esc(st.name)}</span>
      <span class="rate">${bar(p.done, p.total)}<span class="label mono"><span>${label}</span><span>${st.tasks.length ? Math.round(p.done / p.total * 100) + "%" : ""}</span></span></span>
    </button></li>`;
  }).join("");
  $("flow").querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    dashTab[uid] = b.dataset.tab;
    $("flow").querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    paintBoard(uid, data, mine);
    if ($("view").classList.contains("anim")) revealBoard();
    else if (!reduceMotion()) $("board").firstElementChild?.classList.add("tabin");
  }));

  const done = tasks.filter(x => taskDone(data, x.stage, x.task)).length;
  const nextHtml = next
    ? (mine ? `<a class="next" href="#/stage/${next.stage.id}/${next.stage.tasks.indexOf(next.task) + 1}">${esc(next.task.title)} ${icon("right")}</a>` : `<b class="next">${esc(next.task.title)}</b>`)
    : `<b>완료</b>`;
  $("stats").innerHTML = `
    <div><b>${done}<span class="mono"> / ${tasks.length}</span></b><span class="mono">완료한 과제</span></div>
    <div>${nextHtml}<span class="mono">${next ? "다음 할 일" : "전체 과제"}</span></div>`;

  const sm = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "summary"));
  $("oneline").innerHTML = hasValue(sm) ? `<section class="oneline"><span class="ol-label mono">한 문장 전략</span><p>${uid === "case" ? esc(data.name) + josa(data.name, "은", "는") : "나는"} <b>${esc(sm.target || "[타깃]")}</b>에게 <b>${esc(sm.value || "[가치]")}</b>${josa(sm.value || "가치", "을", "를")} <b>${esc(sm.channel || "[채널]")}</b>${josa(sm.channel || "채널", "으로", "로")} 전달해 <b class="st">${esc(sm.stage || "[단계]")}</b> 단계를 공략한다</p></section>` : "";
  paintBoard(uid, data, mine);
  animateDashboard(Boolean(s));
}

function paintBoard(uid, data, mine) {
  const i = STAGES.findIndex(x => x.id === dashTab[uid]);
  const st = STAGES[i];
  $("board").innerHTML = `
    <section class="dash-stage" id="dash-${st.id}" role="tabpanel">
      <div class="dash-head">
        <span class="stage-num">${pad(i + 1)}</span>
        <div><h2>${esc(st.name)}</h2><p>${esc(st.desc)}</p></div>
        ${mine ? `<a class="more mono" href="#/stage/${st.id}">열기 ${icon("right")}</a>` : ""}
      </div>
      ${st.tasks.filter(t => taskDone(data, st, t) || hasFiles(data, st, t)).map(t => dashTask(data, st, t, st.tasks.indexOf(t), mine)).join("")}
      ${todoHtml(data, st, mine)}
      ${st.tasks.length ? "" : `<p class="empty mono">준비 중</p>`}
    </section>` + sourcesHtml(data);
  foldTrees($("board"));
}
function sourcesHtml(data) {
  if (!data.sources?.length) return "";
  return `<section class="sources"><p>${esc(data.note || "")}</p><ul>${data.sources.map(([k, u]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(k)} ${icon("ur")}</a></li>`).join("")}</ul></section>`;
}

/* 대시보드 애니메이션: 데이터가 들어온 첫 화면에서만 재생 */
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function animateDashboard(hasData) {
  const view = $("view");
  if (!dashAnim || !hasData || reduceMotion()) { view.classList.remove("anim"); dashObserver?.disconnect(); return; }
  dashAnim = false;
  view.classList.add("anim");
  view.querySelectorAll("#stats b").forEach(b => countUp(b));
  revealBoard();
}
function revealBoard() {
  const view = $("view");
  if (!view.classList.contains("anim")) return;
  const items = view.querySelectorAll(".dash-stage:not(.in), .dcard:not(.in), .todo:not(.in), .oneline:not(.in)");
  dashObserver?.disconnect();
  if (!("IntersectionObserver" in window)) { items.forEach(el => el.classList.add("in")); return; }
  dashObserver = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add("in"); dashObserver.unobserve(en.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  items.forEach(el => dashObserver.observe(el));
}
function countUp(el) {
  const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
  if (!node) return;
  const to = parseInt(node.textContent, 10);
  if (!(to > 0)) return;
  node.textContent = "0";
  setTimeout(() => {
    const t0 = performance.now(), dur = 1000;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 2))));
      if (k < 1 && node.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, 550);
}
function todoHtml(data, st, mine) {
  const left = st.tasks.filter(t => !taskDone(data, st, t) && !hasFiles(data, st, t));
  if (!left.length) return "";
  return `<div class="todo"><span class="mono muted">${left.length === st.tasks.length ? "아직 작성한 과제 없음" : "남은 과제"}</span>${left.map(t => mine
    ? `<a href="#/stage/${st.id}/${st.tasks.indexOf(t) + 1}">${esc(t.title)}${icon("right")}</a>`
    : `<span>${esc(t.title)}</span>`).join("")}</div>`;
}
function dashTask(data, st, t, j, mine) {
  const r = resultOf(data, st, t);
  const head = `<div class="dcard-head"><h3><span class="tnum">${pad(j + 1)}</span>${esc(t.id === "summary" ? "기획서 점검" : t.title)}</h3>${mine ? `<a class="more mono" href="#/stage/${st.id}/${j + 1}">${hasValue(r) ? "수정" : "작성하기"} ${icon("right")}</a>` : ""}</div>`;
  const fl = t.files ? filesHtml(uidOf(data), data, taskKey(st, t), false) : "";
  const files = fl ? `<div class="dfiles"><span class="mono muted">연습 파일</span>${fl}</div>` : "";
  if (!hasValue(r)) return `<div class="dcard${files ? "" : " is-empty"}">${head}${files || `<p class="empty-line mono">아직 작성하지 않았습니다</p>`}</div>`;
  return `<div class="dcard">${head}${renderResult(data, st, t, r)}${files}</div>`;
}
const lines = v => esc(v || "").split("\n").filter(Boolean).map(l => `<li>${l}</li>`).join("");
const cell = v => v ? nl(v) : `<span class="muted">-</span>`;
function renderResult(data, st, t, r) {
  const items = v => String(v || "").split("\n").map(x => x.trim()).filter(Boolean);
  const ul = v => { const a = items(v); return a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">-</p>`; };
  switch (t.id) {
    case "business":
      return `<div class="canvas">${t.fields.map((f, i) => `
        <div class="ctile${i < 4 ? "" : " lean"}">
          <span class="clabel"><b>${esc(f.label.slice(0, 1))}</b>${esc(f.label.slice(2))}</span>
          <p>${cell(r[f.k])}</p>
        </div>`).join("")}
        <span class="ctag mono">비즈니스 모델 캔버스</span><span class="ctag mono lean">린 캔버스</span>
      </div>`;
    case "c3pest":
      return `<div class="c3">${[["Customer", "고객", r.customer], ["Company", "자사", r.company], ["Competitor", "경쟁사", r.competitor]].map(([en, ko, v]) => `
        <div class="c3col"><h4>${en}<span>${ko}</span></h4>${ul(v)}</div>`).join("")}</div>
        ${r.pest ? `<div class="pest"><span class="mono muted">PEST 선별</span>${items(r.pest).map(x => { const [k, ...rest] = x.split(":"); return rest.length ? `<p><b>${esc(k.trim())}</b>${esc(rest.join(":").trim())}</p>` : `<p>${esc(x)}</p>`; }).join("")}</div>` : ""}`;
    case "swot":
      return `<div class="swot-m">
          <span class="ax top1 mono">긍정</span><span class="ax top2 mono">부정</span>
          <span class="ax side1 mono">내부</span><span class="ax side2 mono">외부</span>
          ${[["S", "강점", r.s, "pos"], ["W", "약점", r.w, "neg"], ["O", "기회", r.o, "pos"], ["T", "위협", r.t, "neg"]].map(([k, ko, v, c]) => `
          <div class="q ${c} q${k}"><span class="qk">${k}</span><h4>${ko}</h4>${ul(v)}</div>`).join("")}
        </div>
        <div class="cross">${[["SO", "강점 × 기회", r.so], ["ST", "강점 × 위협", r.st], ["WO", "약점 × 기회", r.wo], ["WT", "약점 × 위협", r.wt]].map(([k, sub, v]) => `
          <div class="xcard"><span class="xk">${k}</span><span class="mono muted">${sub}</span><p>${cell(v)}</p></div>`).join("")}</div>`;
    case "journey": {
      const f = t.fields[0];
      return `<ol class="journey">${f.rows.map((row, i) => {
        const v = (r.rows || [])[i] || {};
        const on = r.home === row;
        return `<li class="${on ? "on" : ""}">
          <span class="jn mono">${pad(i + 1)}</span>
          <h4>${esc(row)}${on ? `<span class="tag mono">홈페이지</span>` : ""}</h4>
          <p class="jact">${cell(v.act)}</p>
          ${v.ch ? `<div class="chips">${String(v.ch).split(",").map(c => c.trim()).filter(Boolean).map(c => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
          ${v.worry ? `<p class="jworry">"${esc(v.worry)}"</p>` : ""}
          ${v.give ? `<p class="jgive">${esc(v.give)}</p>` : ""}
        </li>`;
      }).join("")}</ol>
        ${r.home ? `<p class="dnote"><span class="mono muted">홈페이지가 담당할 단계 · ${esc(r.home)}</span>${cell(r.homeWhy)}</p>` : ""}`;
    }
    case "rivals": {
      const list = (r.list || []).filter(hasValue);
      return `<div class="rivals">${list.map((c, i) => `
        <div class="rcard"><span class="mono muted">경쟁사 ${i + 1}</span><h4>${esc(c.name || "-")}</h4>
          <p class="rprice${/\d/.test(c.price || "") ? "" : " txt"}">${esc(c.price || "-")}</p>
          <p class="rp"><b>+</b>${cell(c.plus)}</p><p class="rm"><b>−</b>${cell(c.minus)}</p></div>`).join("")}</div>
        ${r.diff ? `<div class="diff"><span class="mono">우리가 다르게 할 지점</span>${ul(r.diff)}</div>` : ""}`;
    }
    case "bench": {
      const list = (r.list || []).filter(hasValue);
      return `<div class="rivals">${list.map((c, i) => { const u = safeUrl(c.url); return `
        <div class="rcard"><span class="mono muted">홈페이지 ${i + 1}</span>
          ${u ? `<a class="more mono" href="${esc(u)}" target="_blank" rel="noopener noreferrer">열기 ${icon("ur")}</a>` : ""}
          <p class="hero-q">${cell(c.hero)}</p>
          <p class="rp"><b>신뢰</b>${cell(c.trust)}</p></div>`; }).join("")}</div>
        ${r.pages ? `<div class="pages"><span class="mono muted">내 홈페이지에 꼭 들어갈 페이지</span><div class="chips big">${String(r.pages).split("/").map(x => x.trim()).filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div></div>` : ""}`;
    }
    case "stp": {
      const segs = r.segs || [];
      const rank = i => r.first === `세그먼트 ${i + 1}` ? 1 : r.second === `세그먼트 ${i + 1}` ? 2 : 0;
      return `${r.position ? `<p class="position">${esc(r.position)}</p>` : ""}
        <div class="stp">
          <div class="segs2">${segs.map((sg, i) => hasValue(sg) ? `<div class="seg r${rank(i)}"><span class="mono">${rank(i) ? `${rank(i)}순위` : `세그먼트 ${i + 1}`}</span><h4>${esc(sg.name || "-")}</h4><p>${esc(sg.desc || "")}</p></div>` : "").join("")}</div>
          ${mapSvg(r)}
        </div>`;
    }
    case "plan": {
      const goals = (r.goals || []).filter(hasValue);
      const weak = (r.weak || []).filter(hasValue);
      return `${goals.length ? `<div class="kpis">${goals.map(g => `
          <div class="kpi"><span class="mono muted">${esc(g.channel || "채널")}</span><h4>${esc(g.metric || "지표")}</h4>
            <div class="kv"><span class="now">${esc(g.now || "측정 필요")}</span>${icon("right")}<b class="${/\d/.test(g.target || "") ? "" : "txt"}">${esc(g.target || "-")}</b></div></div>`).join("")}</div>` : ""}
        ${weak.length ? `<div class="grid2 weak">${weak.map(w => `<div class="pane"><span class="mono muted">약한 단계</span><h4>${esc(w.stage || "-")}</h4><p><span class="pill">0원</span>${cell(w.free)}</p><p><span class="pill paid">30만원</span>${cell(w.paid)}</p></div>`).join("")}</div>` : ""}`;
    }
    case "summary":
      return checklistHtml(data);
    case "stack": {
      const rows = [["프론트엔드", "Frontend", r.front], ["백엔드 · DB", "Backend", r.db], ["예약 · 결제", "Booking", r.booking], ["배포", "Deploy", r.deploy], ["도메인", "Domain", r.domain]];
      return `<div class="stack">${rows.map(([k, en, v]) => `
        <div class="layer"><span class="mono muted">${en}</span><h4>${k}</h4><p>${cell(v)}</p></div>`).join("")}</div>
        ${r.backend || r.why ? `<div class="grid2">${r.backend ? `<p class="dnote"><span class="mono muted">홈페이지 기능</span>${cell(r.backend)}</p>` : ""}${r.why ? `<p class="dnote"><span class="mono muted">고른 이유</span>${cell(r.why)}</p>` : ""}</div>` : ""}`;
    }
    case "landing": {
      const it = resultOf(data, st, st.tasks.find(x => x.id === "iterate")) || {};
      const hex = v => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || "").trim()) ? String(v).trim() : "";
      const color = hex(it.color) || hex(r.color) || "var(--signal)";
      const plan = (r.plan || []).filter(hasValue);
      const secs = plan.length ? plan.map(x => x.sec || "섹션") : String(r.sections || "").split("/").map(x => x.trim()).filter(Boolean);
      const link = safeUrl(r.ctaLink);
      return `<div class="land">
        <div class="wire" style="--brand:${esc(color)}">
          <div class="wbar"><span class="wlogo"></span><span class="wmenu"><i></i><i></i><i></i></span></div>
          <div class="whero"><h4>${cell(r.hero)}</h4>${r.sub ? `<p>${esc(r.sub)}</p>` : ""}${r.cta ? `<span class="wcta">${esc(r.cta)}</span>` : ""}</div>
          ${secs.length ? `<div class="wsecs">${secs.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="land-meta">
          ${r.stage ? `<p class="dnote"><span class="mono muted">담당 고객여정 단계</span>${esc(r.stage)}</p>` : ""}
          ${r.cta ? `<p class="dnote"><span class="mono muted">주 CTA</span>${esc(r.cta)}${link ? ` <a class="more mono" href="${esc(link)}" target="_blank" rel="noopener noreferrer">연결 확인 ${icon("ur")}</a>` : ""}</p>` : ""}
        </div>
      </div>
      ${plan.length ? `<div class="tbl-wrap"><table class="tbl ptbl"><thead><tr><th>순서</th><th>섹션</th><th>해소하는 불안</th><th>근거</th></tr></thead><tbody>${plan.map((x, i) => `<tr><td class="mono">${pad(i + 1)}</td><th>${esc(x.sec || "-")}</th><td>${esc(x.worry || "-")}</td><td class="${x.basis ? "" : "muted"}">${esc(x.basis || "근거 없음")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    }
    case "iterate": {
      const log = (r.log || []).filter(hasValue);
      const u = safeUrl(r.preview);
      const hex = v => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || "").trim()) ? String(v).trim() : "";
      const sw = [["주 색상", r.color], ["강조색", r.accent]].filter(([, v]) => v);
      return `${sw.length || r.mood || r.font ? `<div class="design">
          ${sw.map(([k, v]) => `<div class="sw"><i style="background:${esc(hex(v) || "transparent")}"></i><span class="mono muted">${k}</span><b>${esc(v)}</b></div>`).join("")}
          ${r.mood ? `<div class="sw"><span class="mono muted">분위기</span><b>${esc(r.mood)}</b></div>` : ""}
          ${r.font ? `<div class="sw"><span class="mono muted">글꼴</span><b>${esc(r.font)}</b></div>` : ""}
        </div>` : ""}
        ${log.length ? `<ol class="iter">${log.map((l, i) => `<li><span class="tnum">${i + 1}</span><div><p class="ask">${cell(l.ask)}</p>${l.result ? `<p class="res">${esc(l.result)}</p>` : ""}</div></li>`).join("")}</ol>` : ""}
        ${u ? `<a class="more mono" href="${esc(u)}" target="_blank" rel="noopener noreferrer">공유 링크 열기 ${icon("ur")}</a>` : ""}`;
    }
    case "inquiry": {
      const f = t.fields.find(x => x.k === "done");
      return `<ol class="flowline">${[["내 홈페이지", "문의폼 입력"], ["publishable 키", "공개용 키만"], ["Supabase API", "RLS 규칙 확인"], ["inquiries 표", "한 줄 저장"], ["대시보드", "Table Editor"]].map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join("")}</ol>
        ${checksHtml(f.options, r.done)}
        ${r.error ? `<p class="dnote"><span class="mono muted">막힌 오류와 해결</span>${cell(r.error)}</p>` : ""}`;
    }
    case "review": {
      const f = t.fields.find(x => x.k === "safe");
      const pos = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "stp"))?.position;
      return `${checksHtml(f.options, r.safe)}
        ${r.five ? `<div class="grid2"><p class="dnote"><span class="mono muted">5초 한 문장 (AI가 본 첫 화면)</span>${cell(r.five)}</p><p class="dnote"><span class="mono muted">내 포지셔닝 문장</span>${cell(pos)}</p></div>` : ""}
        ${r.hesitate ? `<div class="diff light"><span class="mono">망설이는 지점</span>${ul(r.hesitate)}</div>` : ""}
        ${r.only ? `<p class="dnote"><span class="mono muted">이 페이지에서만 볼 수 있는 내용</span>${cell(r.only)}</p>` : ""}`;
    }
    case "deploy": {
      const u = safeUrl(r.url);
      return `<div class="live">${u ? `<a class="liveurl" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, "").replace(/\/$/, ""))} ${icon("ur")}</a>` : `<p class="muted">공개 주소 없음</p>`}
        <div class="livemeta">${r.platform ? `<span class="pill">${esc(r.platform)}</span>` : ""}${r.mobile ? `<span class="pill${r.mobile === "확인함" ? " paid" : ""}">스마트폰 ${esc(r.mobile)}</span>` : ""}</div>
        ${r.next ? `<p class="dnote"><span class="mono muted">다음에 고칠 것</span>${cell(r.next)}</p>` : ""}</div>`;
    }
    case "channels": {
      const picks = r.picks || [];
      const names = [];
      walk(PROMO, n => { if (picks.includes(n.id)) { const path = []; for (let p = n.parent; p && p.depth > 0; p = p.parent) path.unshift(p.t); names.push({ path: path.join(" > "), t: n.t }); } });
      return `${names.length ? `<div class="picked">${names.map(x => `<span><small>${esc(x.path)}</small>${esc(x.t)}</span>`).join("")}</div>` : ""}
        ${treeHtml(PROMO, { mode: "view", picks })}
        ${r.why ? `<p class="dnote"><span class="mono muted">고른 이유</span>${cell(r.why)}</p>` : ""}`;
    }
    case "direct":
    case "indirect": {
      const root = TREES[t.id];
      const d = diagnose(root, r.counts);
      const acts = d ? actionsOf(d.node) : [];
      const path = d ? (() => { const a = []; for (let p = d.node; p && p.depth > 0; p = p.parent) if (p.kind !== "via") a.unshift(p.t); return a.join(" > "); })() : "";
      return `${d ? `<div class="diag">
          <div class="dg-main"><span class="mono muted">이탈이 가장 큰 가지</span><h4>${esc(path)}</h4><b class="dg-rate">${(d.rate * 100).toFixed(1)}%</b></div>
          ${acts.length ? `<div class="dg-acts"><span class="mono muted">개선 행동</span><ul>${acts.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
        </div>` : `<p class="dnote"><span class="mono muted">진단</span>갈림길 숫자를 두 단계 이상 입력하면 이탈이 가장 큰 가지가 표시됩니다</p>`}
        ${treeHtml(root, { mode: "view", counts: r.counts, hot: d?.node })}
        ${r.period || r.next ? `<div class="grid2">${r.period ? `<p class="dnote"><span class="mono muted">기간</span>${cell(r.period)}</p>` : ""}${r.next ? `<p class="dnote"><span class="mono muted">다음 달에 할 일</span>${cell(r.next)}</p>` : ""}</div>` : ""}`;
    }
    default:
      return `<dl class="dl7">${t.fields.map(f => `<div><dt>${esc(f.label)}</dt><dd>${cell(typeof r[f.k] === "string" ? r[f.k] : "")}</dd></div>`).join("")}</dl>`;
  }
}
function checksHtml(options, done) {
  const on = new Set(done || []);
  const n = options.filter(o => on.has(o)).length;
  return `<div class="checkbar"><span class="mono">${n} / ${options.length} 확인</span>${bar(n, options.length)}</div><ul class="checks">${options.map(o => `<li class="${on.has(o) ? "ok" : ""}"><span class="box">${on.has(o) ? icon("check") : ""}</span>${esc(o)}</li>`).join("")}</ul>`;
}
function checklistHtml(data) {
  const st = stageOf("strategy");
  const items = [
    ["3C · PEST 분석", ["c3pest"]],
    ["SWOT과 교차전략 4개", ["swot"]],
    ["고객여정 6단계 표", ["journey"]],
    ["경쟁사 비교표와 홈페이지 벤치마킹", ["rivals", "bench"]],
    ["STP와 포지셔닝 문장", ["stp"]],
    ["4P · 4C 실행안과 3개월 숫자 목표", ["plan"]]
  ];
  const okN = items.filter(([, ids]) => ids.every(id => taskDone(data, st, st.tasks.find(t => t.id === id)))).length;
  return `<div class="checkbar"><span class="mono">${okN} / ${items.length} 완료</span>${bar(okN, items.length)}</div><ul class="checks">${items.map(([label, ids]) => {
    const ok = ids.every(id => taskDone(data, st, st.tasks.find(t => t.id === id)));
    return `<li class="${ok ? "ok" : ""}"><span class="box">${ok ? icon("check") : ""}</span>${esc(label)}</li>`;
  }).join("")}</ul>`;
}
function mapSvg(r) {
  const pts = (r.map || []).map((p, i) => ({ name: p?.name || ["나", "경쟁사 1", "경쟁사 2", "경쟁사 3"][i], x: Number(p?.x), y: Number(p?.y), me: i === 0 }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.x !== 0 || p.y !== 0 || p.me));
  const [xl, xr] = String(r.axisX || "").split("↔").map(s => s.trim());
  const [yb, yt] = String(r.axisY || "").split("↔").map(s => s.trim());
  const S = 320, P = 28, C = S / 2;
  const pos = v => C + Math.max(-5, Math.min(5, v)) / 5 * (C - P);
  return `<figure class="pmap">
    <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="포지셔닝 맵">
      <rect x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" class="pm-frame"/>
      <rect x="${C}" y="${P / 2}" width="${C - P / 2}" height="${C - P / 2}" class="pm-best"/>
      <line x1="${P / 2}" y1="${C}" x2="${S - P / 2}" y2="${C}" class="pm-axis"/>
      <line x1="${C}" y1="${P / 2}" x2="${C}" y2="${S - P / 2}" class="pm-axis"/>
      <text x="8" y="${C - 8}" class="pm-lab">${esc(xl || "")}</text>
      <text x="${S - 8}" y="${C - 8}" class="pm-lab" text-anchor="end">${esc(xr || "")}</text>
      <text x="${C + 8}" y="18" class="pm-lab">${esc(yt || "")}</text>
      <text x="${C + 8}" y="${S - 10}" class="pm-lab">${esc(yb || "")}</text>
      ${pts.map(p => { const right = p.x > 1; return `<g class="${p.me ? "pm-me" : "pm-pt"}"><circle cx="${pos(p.x)}" cy="${pos(-p.y)}" r="${p.me ? 7 : 5}"/><text x="${pos(p.x) + (right ? -12 : 12)}" y="${pos(-p.y) + 4}" text-anchor="${right ? "end" : "start"}">${esc(p.name)}</text></g>`; }).join("")}
    </svg>
    ${pts.length ? "" : `<figcaption class="mono muted">좌표를 입력하면 맵이 그려집니다</figcaption>`}
  </figure>`;
}

/* 단계 페이지 */
function mountStage(st) {
  const i = STAGES.indexOf(st);
  $("view").innerHTML = `
    <header class="intro stage-intro">
      <div>${backLink("#/", app.user ? "대시보드" : "처음으로")}
        <p class="eyebrow mono">${pad(i + 1)}${st.chapter ? ` · ${esc(st.chapter)}` : ""}</p>
        <h1>${esc(st.name)}</h1>
      </div>
      <p class="lead">${esc(st.desc)}</p>
    </header>
    ${stageTabs(st)}
    <main class="stage-page">
      ${st.points.length ? `<section class="sec">${pointsHtml(st.points)}</section>` : ""}
      ${(st.overview || []).length ? `<section class="sec"><h2 class="sec-h">한눈에 보기</h2>${st.overview.map(id => `<div class="tree-block"><h3>${esc(TREES[id].t)}${TREES[id].en ? ` (${esc(TREES[id].en)})` : ""}</h3>${treeHtml(TREES[id], { mode: "view" })}</div>`).join("")}</section>` : ""}
      ${st.tasks.length ? `
        <section class="sec">
          <h2 class="sec-h">과제<span>순서대로 진행하세요</span></h2>
          <ol class="tasklist" id="tasklist"></ol>
        </section>` : `
        <section class="notice"><h2>준비 중</h2><p>이 단계의 과제는 수업 진행에 맞춰 열립니다.</p></section>`}
    </main>`;
  foldTrees($("view"));
}
function stageTabs(st) {
  return `<nav class="tabs" aria-label="단계">${STAGES.map((s, i) => `<a href="#/stage/${s.id}" ${s === st ? 'aria-current="page"' : ""}><span class="mono">${pad(i + 1)}</span>${esc(s.name)}</a>`).join("")}</nav>`;
}
function paintStage(st) {
  const data = me() || {};
  const tl = $("tasklist");
  if (tl) tl.innerHTML = st.tasks.map((t, j) => {
    const ok = taskDone(data, st, t);
    return `<li><a href="#/stage/${st.id}/${j + 1}" class="${ok ? "ok" : ""}">
      <span class="tn mono">${pad(j + 1)}</span>
      <span class="tb"><strong>${esc(t.title)}${t.card ? `<span class="mono muted">카드 ${esc(t.card)}</span>` : ""}</strong><span>${esc(t.desc)}</span></span>
      <span class="ts mono">${ok ? `${icon("check")} 저장됨` : "미작성"}</span>
    </a></li>`;
  }).join("");
}

/* 트리 (촉진 지도, 전환 경로) */
const TREES = { promo: PROMO, direct: DIRECT, indirect: INDIRECT };
const fmt = n => Number(n).toLocaleString("ko-KR");
const numOf = (counts, n) => { const v = counts?.[n.id]; return v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v); };
function baseOf(counts, n) {
  for (let p = n.parent; p; p = p.parent) { if (isCount(p)) { const v = numOf(counts, p); if (v) return v; } }
  return null;
}
// 이탈 비율이 가장 큰 가지
function diagnose(root, counts) {
  let best = null;
  walk(root, n => {
    if (n.kind !== "drop") return;
    const v = numOf(counts, n), b = baseOf(counts, n);
    if (v == null || !b) return;
    const rate = v / b;
    if (!best || rate > best.rate) best = { node: n, rate };
  });
  return best;
}
function actionsOf(n) {
  const out = [];
  walk(n, x => { if (x.kind === "act" && x !== n) out.push(x.kind === "act" && x.parent?.kind === "act" ? `${x.parent.t} · ${x.t}` : x.t); });
  return out.filter((a, i, arr) => !arr.some((b, j) => j !== i && b.startsWith(a + " · ")));
}
function treeHtml(root, o = {}) {
  const on = new Set(), hot = new Set();
  if (o.picks) { const ids = new Set(o.picks); walk(root, n => { if (ids.has(n.id)) for (let p = n; p; p = p.parent) on.add(p.id); }); }
  if (o.hot) { for (let p = o.hot; p; p = p.parent) hot.add(p.id); walk(o.hot, n => hot.add(n.id)); }
  const label = n => `<span class="tl">${esc(n.t)}${n.en ? `<small>(${esc(n.en)})</small>` : ""}</span>`;
  const node = n => {
    const kids = n.c || [];
    let box;
    if (o.mode === "pick" && !kids.length && n.depth > 0) box = `<label class="tn pick"><input type="checkbox" name="${o.k}" value="${n.id}">${label(n)}</label>`;
    else if (o.mode === "count" && isCount(n)) box = `<label class="tn cnt">${label(n)}<input type="number" name="${o.k}.${n.id}" min="0" step="1" inputmode="numeric" placeholder="숫자" aria-label="${esc(n.t)} 수"></label>`;
    else if (o.mode === "view" && o.counts && isCount(n) && numOf(o.counts, n) != null) {
      const v = numOf(o.counts, n), b = baseOf(o.counts, n);
      box = `<span class="tn">${label(n)}<b class="tv">${fmt(v)}${b ? `<em>${(v / b * 100).toFixed(1)}%</em>` : ""}</b></span>`;
    } else box = `<span class="tn">${label(n)}</span>`;
    const cls = [`d${Math.min(n.depth, 2)}`, n.kind ? `k-${n.kind}` : "", on.has(n.id) ? "on" : "", hot.has(n.id) ? "hot" : "", kids.length ? "has" : ""].filter(Boolean).join(" ");
    const tg = kids.length && n.depth > 0 ? `<button type="button" class="tg" aria-label="하위 항목 펼치기"></button>` : "";
    return `<li class="${cls}"><div class="tnw">${box}${tg}${n.depth === 0 && n.note ? `<p class="tnote">${esc(n.note)}</p>` : ""}</div>${kids.length ? `<ul>${kids.map(node).join("")}</ul>` : ""}</li>`;
  };
  const dim = o.picks ? " dim" : "";
  return `<div class="tree-wrap"><ul class="tree${dim}${o.mode === "pick" || o.mode === "count" ? " form" : ""}">${node(root)}</ul></div>`;
}
// 모바일: 1단계 아래는 접어 두고 눌러 펼침 (선택 · 강조된 가지는 펼침)
function foldTrees(scope) {
  scope.querySelectorAll(".tree li.has:not(.d0)").forEach(li => {
    if (!li.classList.contains("on") && !li.classList.contains("hot")) li.classList.add("shut");
    li.querySelector(":scope > .tnw > .tg")?.setAttribute("aria-expanded", String(!li.classList.contains("shut")));
  });
}
document.addEventListener("click", e => {
  const tg = e.target.closest(".tree .tg");
  if (!tg) return;
  const li = tg.closest("li");
  li.classList.toggle("shut");
  tg.setAttribute("aria-expanded", String(!li.classList.contains("shut")));
});

/* 과제 페이지 */
function mountTask(st, index) {
  const t = st.tasks[index];
  const si = STAGES.indexOf(st);
  const prev = st.tasks[index - 1], next = st.tasks[index + 1];
  $("view").innerHTML = `
    <header class="intro task-intro">
      <div>${backLink(`#/stage/${st.id}`, st.name)}
        <p class="eyebrow mono">${pad(si + 1)} · 과제 ${index + 1} / ${st.tasks.length}${t.card ? ` · 프롬프트 카드 ${esc(t.card)}` : ""}</p>
        <h1>${esc(t.title)}</h1>
      </div>
      <p class="lead">${esc(t.desc)}</p>
    </header>
    <nav class="tabs" id="task-tabs" aria-label="과제"></nav>
    <main class="task-page">
      <section class="sec"><h2 class="sec-h">핵심</h2>${pointsHtml(t.points)}</section>
      <section class="sec">
        <h2 class="sec-h">따라하기</h2>
        <ol class="follow">${t.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      </section>
      ${t.prompt ? `<section class="sec">
        <h2 class="sec-h">프롬프트<span id="prompt-hint"></span></h2>
        <div class="prompt">
          <button class="btn ghost sm copy" type="button" data-act="copy">${icon("copy")}복사하기</button>
          <pre id="prompt-body"></pre>
        </div>
      </section>` : ""}
      ${t.files ? `<section class="sec">
        <h2 class="sec-h">연습 파일<span>만든 index.html 등을 올리면 대시보드에서 누구나 열어 볼 수 있습니다</span></h2>
        ${app.user ? `<div class="files" id="files"></div>
        <form class="upform" id="upform">
          <label class="upbox"><input type="file" name="up" multiple accept=".html,.htm,.css,.js,.txt,.md,.json,text/html,text/css,text/javascript,text/plain"><span><b>파일 선택</b>HTML · CSS · JS · TXT, 파일당 700KB 이하</span></label>
          <p class="note mono" id="upnote" role="status"></p>
        </form>` : `<p class="muted">파일을 올리려면 로그인하세요.</p>`}
      </section>` : ""}
      <section class="sec result">
        <h2 class="sec-h">결과 저장<span>확인한 내용만 적으면 대시보드에 반영됩니다</span></h2>
        ${app.user ? `<form class="rform" id="rform" autocomplete="off">
          ${t.fields.map(f => fieldHtml(f)).join("")}
          <div class="actions"><button class="btn" type="submit">저장하기</button><p class="note mono" id="rnote" role="status"></p></div>
        </form>` : `<div class="notice"><p>결과를 저장하려면 로그인하세요.</p><button class="btn" type="button" data-act="login">구글 계정으로 로그인</button></div>`}
      </section>
      <nav class="pager">
        ${prev ? `<a href="#/stage/${st.id}/${index}">${icon("left")}<span><span class="mono muted">이전</span>${esc(prev.title)}</span></a>` : `<a href="#/stage/${st.id}">${icon("left")}<span><span class="mono muted">과제 목록</span>${esc(st.name)}</span></a>`}
        ${next ? `<a class="nx" href="#/stage/${st.id}/${index + 2}"><span><span class="mono muted">다음</span>${esc(next.title)}</span>${icon("right")}</a>` : `<a class="nx" href="#/"><span><span class="mono muted">완료</span>대시보드</span>${icon("right")}</a>`}
      </nav>
    </main>`;
  foldTrees($("view"));
  $("upform")?.addEventListener("change", e => onUpload(e, st, t));
  $("files")?.addEventListener("click", e => { const b = e.target.closest("[data-del]"); if (b) onDeleteFile(b.dataset.del); });
  const f = $("rform");
  if (f) {
    f.addEventListener("input", () => { f.dataset.dirty = "1"; });
    f.addEventListener("submit", e => onResultSubmit(e, st, t));
  }
}
function paintTask(st, index) {
  const t = st.tasks[index];
  const data = me() || {};
  $("task-tabs").innerHTML = st.tasks.map((x, j) => `<a href="#/stage/${st.id}/${j + 1}" ${j === index ? 'aria-current="page"' : ""} class="${taskDone(data, st, x) ? "ok" : ""}"><span class="mono">${pad(j + 1)}</span>${esc(x.title)}${taskDone(data, st, x) ? icon("check") : ""}</a>`).join("");
  if (t.prompt) {
    let body = t.prompt.body;
    let hint = "";
    if (body.includes("{{business}}")) {
      const b = businessText(data);
      body = body.replace("{{business}}", b || t.prompt.fallback);
      hint = b ? "내 비즈니스 정리가 자동으로 들어갔습니다" : "1단계를 저장하면 [ ] 자리가 자동으로 채워집니다";
    }
    const strat = stageOf("strategy");
    const res = id => resultOf(data, strat, strat.tasks.find(x => x.id === id)) || {};
    const fills = {
      summary: (() => { const m = res("summary"); return hasValue(m) ? `나는 ${m.target}에게 ${m.value}${josa(m.value || "", "을", "를")} ${m.channel}${josa(m.channel || "", "으로", "로")} 전달해 ${m.stage} 단계를 공략한다` : ""; })(),
      position: res("stp").position || "",
      target: (() => { const p = res("stp"); const i = parseInt(String(p.first || "").replace(/\D/g, ""), 10) - 1; return p.segs?.[i]?.name || ""; })(),
      home: (() => { const j = res("journey"); return j.home ? `${j.home}${j.homeWhy ? ` (${j.homeWhy})` : ""}` : ""; })(),
      pages: res("bench").pages || "",
      journey: (() => { const j = res("journey"); const rows = stageOf("strategy").tasks.find(x => x.id === "journey").fields[0].rows; return (j.rows || []).some(hasValue) ? rows.map((n, i) => { const v = j.rows[i] || {}; return `${n} : ${[v.act, v.ch, v.worry, v.give].map(x => x || "-").join(" / ")}`; }).join("\n") : ""; })(),
      rivals: (() => { const r = res("rivals"); const l = (r.list || []).filter(hasValue); return l.length ? l.map(c => `${c.name || "-"} / ${c.price || "-"} / 강점 ${c.plus || "-"} / 약점 ${c.minus || "-"}`).join("\n") + (r.diff ? `\n다르게 할 지점 : ${String(r.diff).replace(/\n/g, ", ")}` : "") : ""; })(),
      rivalnames: (() => { const n = (res("rivals").list || []).map(c => c?.name).filter(Boolean); return n.length ? n.join(" · ") : ""; })(),
      ctalink: safeUrl(resultOf(data, stageOf("vibecoding"), stageOf("vibecoding").tasks.find(x => x.id === "landing"))?.ctaLink) || ""
    };
    const FILL = /\{\{(summary|position|target|home|pages|journey|rivals|rivalnames|ctalink)\}\}/g;
    const blank = { ctalink: "[실제 링크]", target: "[1순위 타깃]", rivalnames: "[경쟁사 상호 3곳]" };
    let missing = 0;
    const used = FILL.test(t.prompt.body);
    body = body.replace(FILL, (_, k) => fills[k] || (missing++, blank[k] || `[2단계에서 작성]`));
    if (used) hint = missing ? `앞 과제 결과 중 ${missing}곳이 비어 있습니다. 해당 과제를 먼저 저장하거나 직접 채우세요` : "앞 과제 결과가 자동으로 들어갔습니다";
    if (body.includes("{{urls}}")) {
      const r = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "bench"));
      const urls = (r?.list || []).map(x => safeUrl(x?.url)).filter(Boolean);
      body = body.replace("{{urls}}", urls.length ? urls.join("\n") : t.prompt.fallback);
      hint = urls.length ? "저장한 주소가 들어갔습니다" : "아래에 주소를 저장하면 자동으로 채워집니다";
    }
    $("prompt-body").textContent = body;
    $("prompt-hint").textContent = hint;
  }
  if ($("files")) $("files").innerHTML = filesHtml(app.user.uid, data, taskKey(st, t), true) || `<p class="empty-line mono">아직 올린 파일이 없습니다</p>`;
  const f = $("rform");
  if (f && !f.dataset.dirty && !f.contains(document.activeElement)) fillForm(f, t, resultOf(data, st, t) || {});
}
async function copyPrompt(btn) {
  const text = $("prompt-body").textContent;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  const old = btn.innerHTML;
  btn.innerHTML = `${icon("check")}복사됨`;
  setTimeout(() => { btn.innerHTML = old; }, 1800);
}

/* 결과 입력 폼 */
function inputHtml(f, name) {
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : "";
  if (f.type === "textarea") return `<textarea name="${name}" rows="4"${ph} maxlength="1500"></textarea>`;
  if (f.type === "select") return `<select name="${name}"><option value="">선택</option>${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "number") return `<input name="${name}" type="number" inputmode="decimal" step="0.5" min="${f.min}" max="${f.max}"${ph}>`;
  if (f.type === "url") return `<input name="${name}" type="text" inputmode="url" maxlength="500"${ph}>`;
  return `<input name="${name}" type="text" maxlength="300"${ph}>`;
}
function fieldHtml(f) {
  if (f.type === "checks") {
    return `<fieldset class="fchecks"><legend class="mono">${esc(f.label)}</legend><div class="chkl">${f.options.map(o => `<label class="chk"><input type="checkbox" name="${f.k}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("")}</div></fieldset>`;
  }
  if (f.type === "tree-pick" || f.type === "tree-count") {
    return `<fieldset class="ftree"><legend class="mono">${esc(f.label)}</legend>${treeHtml(TREES[f.tree], { mode: f.type === "tree-pick" ? "pick" : "count", k: f.k })}</fieldset>`;
  }
  if (f.type === "grid") {
    return `<fieldset class="fgrid"><legend class="mono">${esc(f.label)}</legend>
      <div class="gtable" style="--cols:${f.cols.length}">
        <div class="ghead"><span></span>${f.cols.map(c => `<span class="mono">${esc(c.label)}</span>`).join("")}</div>
        ${f.rows.map((row, i) => `<div class="grow"><span class="grow-h">${esc(row)}</span>${f.cols.map(c => `<label><span class="mono">${esc(c.label)}</span><textarea name="${f.k}.${i}.${c.k}" rows="2" maxlength="300"></textarea></label>`).join("")}</div>`).join("")}
      </div></fieldset>`;
  }
  if (f.type === "group") {
    return `<fieldset class="fgroup"><legend class="mono">${esc(f.label)}</legend>
      <div class="gcards n${f.count}">${Array.from({ length: f.count }, (_, i) => `<div class="gcard"><span class="gtitle mono">${esc(f.names?.[i] || `${f.label} ${i + 1}`)}</span>${f.fields.map(x => `<label class="field"><span class="mono">${esc(x.label)}</span>${inputHtml(x, `${f.k}.${i}.${x.k}`)}</label>`).join("")}</div>`).join("")}</div>
    </fieldset>`;
  }
  return `<label class="field ${f.type === "textarea" ? "wide" : ""}"><span class="mono">${esc(f.label)}</span>${inputHtml(f, f.k)}</label>`;
}
function collectForm(form, t) {
  const el = name => form.elements.namedItem(name);
  const val = (name, type) => {
    const v = (el(name)?.value ?? "").trim();
    if (type === "number") return v === "" ? "" : Math.max(-5, Math.min(5, Number(v)));
    return v;
  };
  const out = {};
  for (const f of t.fields) {
    if (f.type === "checks") out[f.k] = [...form.querySelectorAll(`input[name="${f.k}"]:checked`)].map(x => x.value);
    else if (f.type === "tree-pick") out[f.k] = [...form.querySelectorAll(`input[name="${f.k}"]:checked`)].map(x => x.value);
    else if (f.type === "tree-count") { out[f.k] = {}; walk(TREES[f.tree], n => { if (!isCount(n)) return; const v = val(`${f.k}.${n.id}`); out[f.k][n.id] = v === "" ? "" : Math.max(0, Math.round(Number(v)) || 0); }); }
    else if (f.type === "grid") out[f.k] = f.rows.map((_, i) => Object.fromEntries(f.cols.map(c => [c.k, val(`${f.k}.${i}.${c.k}`)])));
    else if (f.type === "group") out[f.k] = Array.from({ length: f.count }, (_, i) => Object.fromEntries(f.fields.map(x => [x.k, val(`${f.k}.${i}.${x.k}`, x.type)])));
    else out[f.k] = val(f.k, f.type);
  }
  return out;
}
function fillForm(form, t, r) {
  const set = (name, v) => { const e = form.elements.namedItem(name); if (e) e.value = v ?? ""; };
  for (const f of t.fields) {
    if (f.type === "checks") { const on = new Set(r[f.k] || []); form.querySelectorAll(`input[name="${f.k}"]`).forEach(x => { x.checked = on.has(x.value); }); }
    else if (f.type === "tree-pick") { const ids = new Set(r[f.k] || []); form.querySelectorAll(`input[name="${f.k}"]`).forEach(x => { x.checked = ids.has(x.value); }); }
    else if (f.type === "tree-count") walk(TREES[f.tree], n => { if (isCount(n)) set(`${f.k}.${n.id}`, r[f.k]?.[n.id]); });
    else if (f.type === "grid") f.rows.forEach((_, i) => f.cols.forEach(c => set(`${f.k}.${i}.${c.k}`, r[f.k]?.[i]?.[c.k])));
    else if (f.type === "group") Array.from({ length: f.count }).forEach((_, i) => f.fields.forEach(x => set(`${f.k}.${i}.${x.k}`, r[f.k]?.[i]?.[x.k] ?? (x.k === "name" && f.names ? (i === 0 ? (me()?.name || "나") : defaultRival(i)) : ""))));
    else set(f.k, r[f.k]);
  }
}
function defaultRival(i) {
  const st = stageOf("strategy");
  const r = resultOf(me(), st, st.tasks.find(x => x.id === "rivals"));
  return r?.list?.[i - 1]?.name || "";
}
function urlFieldsInvalid(form, t) {
  const names = [];
  for (const f of t.fields) {
    if (f.type === "url") names.push(f.k);
    if (f.type === "group") f.fields.filter(x => x.type === "url").forEach(x => { for (let i = 0; i < f.count; i++) names.push(`${f.k}.${i}.${x.k}`); });
  }
  return names.find(n => { const v = form.elements.namedItem(n)?.value.trim(); return v && !safeUrl(v); });
}
async function withBusy(form, fn) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}
function onResultSubmit(e, st, t) {
  e.preventDefault();
  const f = e.target;
  const note = $("rnote");
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/profile">내정보</a>에서 이름을 저장하세요`); return; }
  const bad = urlFieldsInvalid(f, t);
  if (bad) { flash(note, false, "링크 주소를 확인하세요"); f.elements.namedItem(bad).focus(); return; }
  const data = collectForm(f, t);
  for (const fl of t.fields) {
    if (fl.type === "url") data[fl.k] = safeUrl(data[fl.k]);
    if (fl.type === "group") fl.fields.filter(x => x.type === "url").forEach(x => data[fl.k].forEach(g => { g[x.k] = safeUrl(g[x.k]); }));
  }
  withBusy(f, async () => {
    try {
      await saveMine({ results: { [taskKey(st, t)]: data } });
      delete f.dataset.dirty;
      flash(note, true, `저장되었습니다 · <a href="#/">대시보드에서 보기</a>`);
    } catch (err) {
      flash(note, false, err?.code === "permission-denied" ? "저장 권한이 없습니다. 교수자에게 문의하세요" : "저장하지 못했습니다");
    }
  });
}

/* 내정보 */
function mountProfile() {
  $("view").innerHTML = `
    <header class="class-head"><div><h1>내정보</h1><p class="mono muted">대시보드와 전체보기에 표시되는 정보입니다.</p></div></header>
    <main class="task-page"><section class="sec">
      <form class="rform" id="profile" autocomplete="off">
        <label class="field"><span class="mono">이름</span><input name="name" maxlength="20" placeholder="이름" required></label>
        <label class="field"><span class="mono">학과</span><input name="dept" maxlength="40" placeholder="학과"></label>
        <label class="field"><span class="mono">학번</span><input name="sid" maxlength="20" inputmode="numeric" placeholder="학번"></label>
        <label class="field"><span class="mono">로그인 계정</span><input value="${esc(app.user?.email || "")}" disabled></label>
        <div class="actions"><button class="btn" type="submit">저장하기</button><p class="note mono" id="profile-note" role="status"></p><button class="btn ghost logout" type="button" data-act="logout">로그아웃</button></div>
      </form>
    </section></main>`;
  const f = $("profile");
  f.addEventListener("input", () => { f.dataset.dirty = "1"; });
  f.addEventListener("submit", onProfileSubmit);
}
function paintProfile() {
  const f = $("profile");
  const data = me() || {};
  if (!f || f.dataset.dirty || f.contains(document.activeElement)) return;
  f.elements.name.value = data.name || "";
  f.elements.dept.value = data.dept || "";
  f.elements.sid.value = data.sid || "";
  if (app.loaded && !data.name) flash($("profile-note"), false, "처음 오셨네요. 이름을 입력하고 저장하세요");
}
function onProfileSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const note = $("profile-note");
  const patch = { name: f.elements.name.value.trim(), dept: f.elements.dept.value.trim(), sid: f.elements.sid.value.trim() };
  if (!patch.name) { flash(note, false, "이름을 입력하세요"); return; }
  withBusy(f, async () => {
    try {
      await saveMine(patch);
      delete f.dataset.dirty;
      flash(note, true, `저장되었습니다 · <a href="#/">대시보드로 이동</a>`);
    } catch { flash(note, false, "저장하지 못했습니다"); }
  });
}

/* 결과 불러오기 */
function mountImport() {
  $("view").innerHTML = `
    <header class="class-head"><div><h1>결과 불러오기</h1><p class="mono muted">JSON 파일을 선택하거나 내용을 붙여 넣으면 내 대시보드에 저장합니다. 같은 과제는 덮어씁니다.</p></div></header>
    <main class="task-page"><section class="sec">
      <form class="rform" id="iform">
        <label class="field wide"><span class="mono">파일 선택</span><input name="file" type="file" accept=".json,application/json"></label>
        <label class="field wide"><span class="mono">또는 붙여 넣기</span><textarea name="json" rows="10" placeholder='{ "results": { ... } }'></textarea></label>
        <p class="note mono wide" id="icheck"></p>
        <div class="actions"><button class="btn" type="submit">저장하기</button><p class="note mono" id="inote" role="status"></p></div>
      </form>
    </section></main>`;
  const f = $("iform");
  f.addEventListener("submit", onImport);
  f.elements.json.addEventListener("input", checkImport);
  f.elements.file.addEventListener("change", async () => {
    const file = f.elements.file.files[0];
    if (!file) return;
    f.elements.json.value = await file.text();
    checkImport();
  });
}
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: "JSON 형식이 올바르지 않습니다. 내용이 끝까지 들어갔는지 확인하세요" }; }
  const keys = new Set(allTasks().map(x => taskKey(x.stage, x.task)));
  const src = data?.results;
  if (!src || typeof src !== "object") return { error: "results 항목이 없습니다" };
  const results = Object.fromEntries(Object.entries(src).filter(([k, v]) => keys.has(k) && v && typeof v === "object"));
  const n = Object.keys(results).length;
  return n ? { results, n } : { error: "불러올 과제가 없습니다" };
}
function checkImport() {
  const f = $("iform"), el = $("icheck");
  const text = f.elements.json.value.trim();
  if (!text) { el.textContent = ""; return; }
  const r = parseImport(text);
  el.className = "note mono wide" + (r.error ? "" : " ok");
  el.textContent = r.error ? `${text.length.toLocaleString()}자 · ${r.error}` : `${text.length.toLocaleString()}자 · 과제 ${r.n}개 인식됨`;
}
function onImport(e) {
  e.preventDefault();
  const f = e.target, note = $("inote");
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/profile">내정보</a>에서 이름을 저장하세요`); return; }
  const r = parseImport(f.elements.json.value.trim());
  if (r.error) { flash(note, false, r.error); return; }
  withBusy(f, async () => {
    try { await saveMine({ results: r.results }); flash(note, true, `과제 ${r.n}개를 저장했습니다 · <a href="#/">대시보드에서 보기</a>`); }
    catch { flash(note, false, "저장하지 못했습니다"); }
  });
}

/* 수강생 전체 */
function mountClass() {
  $("view").innerHTML = `
    <header class="class-head">
      <div><h1>전체보기</h1><p class="mono muted" id="class-sum"></p></div>
      <label class="field"><span class="mono">검색</span><input id="q" type="search" placeholder="이름, 학과, 학번"></label>
    </header>
    <main><ol class="roster" id="roster"></ol></main>`;
  $("q").addEventListener("input", paintRoster);
}
function sortedStudents() {
  return [...app.students.entries()].filter(([, s]) => s.name)
    .sort(([, a], [, b]) => String(a.sid || "").localeCompare(String(b.sid || "")) || String(a.name).localeCompare(String(b.name), "ko"));
}
function paintClass() {
  const list = sortedStudents();
  const tasks = allTasks();
  const done = list.reduce((a, [, s]) => a + tasks.filter(x => taskDone(s, x.stage, x.task)).length, 0);
  const pct = list.length && tasks.length ? Math.round(done / (list.length * tasks.length) * 100) : 0;
  $("class-sum").textContent = `${list.length}명 · 평균 완료율 ${pct}%`;
  paintRoster();
}
function paintRoster() {
  const el = $("roster");
  if (!el) return;
  if (!app.loaded) { el.innerHTML = `<li class="empty mono">불러오는 중</li>`; return; }
  if (app.error) { el.innerHTML = `<li class="empty mono">${esc(app.error)}</li>`; return; }
  const q = $("q").value.trim().toLowerCase();
  const tasks = allTasks();
  const list = sortedStudents().filter(([, s]) => !q || [s.name, s.dept, s.sid].some(v => String(v || "").toLowerCase().includes(q)));
  if (!list.length) { el.innerHTML = `<li class="empty mono">${q ? "검색 결과 없음" : "아직 등록한 학생이 없습니다"}</li>`; return; }
  el.innerHTML = list.map(([uid, s]) => {
    const d = tasks.filter(x => taskDone(s, x.stage, x.task)).length;
    return `<li><a class="r" href="#/s/${encodeURIComponent(uid)}">
      <span class="who"><span class="nm${uid === app.user.uid ? " me" : ""}">${esc(s.name)}</span><span class="meta">${esc([s.dept, s.sid].filter(Boolean).join(" · "))}</span></span>
      ${bar(d, tasks.length)}
      <span class="cnt mono">${d} / ${tasks.length}</span>
      <span class="go">${icon("right")}</span>
    </a></li>`;
  }).join("");
}

/* 시작 */
route();
if (configured) {
  initFirebase().catch(() => {
    $("view").innerHTML = `<section class="notice"><h2>연결하지 못했습니다</h2><p>네트워크 상태나 firebase-config.js 설정값을 확인하세요.</p></section>`;
    mounted = "error";
  });
}

/* 연습 파일: 목록은 students/{uid}.files, 내용은 students/{uid}/files/{fid} */
const FILE_MAX = 700 * 1024;
const uidOf = data => [...app.students].find(([, v]) => v === data)?.[0] || "";
const filesOf = (data, key) => Object.entries(data?.files || {}).filter(([, f]) => f && f.task === key).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
const hasFiles = (data, st, t) => Boolean(t.files) && filesOf(data, taskKey(st, t)).length > 0;
const kb = n => n >= 1024 ? `${Math.round(n / 1024)}KB` : `${n}B`;
function filesHtml(uid, data, key, own) {
  const list = filesOf(data, key);
  if (!list.length || !uid) return "";
  return `<ul class="flist">${list.map(([id, f]) => `<li>
    <a href="#/file/${encodeURIComponent(uid)}/${encodeURIComponent(id)}"><b>${esc(f.name)}</b><span class="mono muted">${kb(f.size || 0)}</span>${icon("right")}</a>
    ${own ? `<button type="button" class="btn ghost sm" data-del="${esc(id)}">삭제</button>` : ""}
  </li>`).join("")}</ul>`;
}
function onUpload(e, st, t) {
  const input = e.target.closest("input[type=file]");
  if (!input || !input.files.length) return;
  const note = $("upnote");
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/profile">내정보</a>에서 이름을 저장하세요`); input.value = ""; return; }
  const picked = [...input.files];
  const bad = picked.find(f => f.size > FILE_MAX);
  if (bad) { flash(note, false, `${esc(bad.name)} : 700KB를 넘습니다. 이미지는 파일 안에 넣지 말고 자리만 잡아 주세요`); input.value = ""; return; }
  if (Object.keys(me().files || {}).length + picked.length > 40) { flash(note, false, "파일은 모두 40개까지 올릴 수 있습니다"); input.value = ""; return; }
  const { db, fsMod } = app.fb;
  const uid = app.user.uid;
  flash(note, true, "올리는 중");
  (async () => {
    try {
      for (const file of picked) {
        const text = await file.text();
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const name = file.name.slice(0, 100);
        await fsMod.setDoc(fsMod.doc(db, "students", uid, "files", id), { name, content: text, updatedAt: fsMod.serverTimestamp() });
        await saveMine({ files: { [id]: { name, task: taskKey(st, t), size: file.size, at: Date.now() } } });
      }
      flash(note, true, `${picked.length}개 올렸습니다 · 이름을 누르면 열립니다`);
    } catch (err) {
      flash(note, false, err?.code === "permission-denied" ? "올릴 권한이 없습니다. 교수자에게 보안 규칙 게시를 요청하세요" : "올리지 못했습니다");
    } finally { input.value = ""; }
  })();
}
async function onDeleteFile(id) {
  const f = me()?.files?.[id];
  if (!f || !confirm(`${f.name} 파일을 삭제할까요?`)) return;
  const { db, fsMod } = app.fb;
  try {
    await fsMod.deleteDoc(fsMod.doc(db, "students", app.user.uid, "files", id));
    await saveMine({ files: { [id]: fsMod.deleteField() } });
  } catch { flash($("upnote"), false, "삭제하지 못했습니다"); }
}
const fileCache = new Map();
function mountFile(uid, fid) {
  $("view").innerHTML = `
    <header class="fhead">
      <div><a class="back mono" id="fback" href="#/">${icon("left")}대시보드</a><h1 id="fname">불러오는 중</h1><p class="muted" id="fmeta"></p></div>
      <div class="fact">
        <div class="seg2" role="group" aria-label="화면 크기"><button type="button" class="on" data-w="pc">PC</button><button type="button" data-w="m">스마트폰</button></div>
        <button type="button" class="btn ghost sm" id="fdown">내려받기</button>
      </div>
    </header>
    <div class="fstage" id="fstage"></div>`;
  $("view").querySelector(".seg2").addEventListener("click", e => {
    const b = e.target.closest("[data-w]"); if (!b) return;
    $("view").querySelectorAll(".seg2 button").forEach(x => x.classList.toggle("on", x === b));
    $("fstage").classList.toggle("mobile", b.dataset.w === "m");
  });
  $("fdown").addEventListener("click", () => {
    const c = fileCache.get(`${uid}/${fid}`); if (!c) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([c.content], { type: "text/plain;charset=utf-8" }));
    a.download = c.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const key = `${uid}/${fid}`;
  if (fileCache.has(key)) { showFile(key); return; }
  const { db, fsMod } = app.fb;
  fsMod.getDoc(fsMod.doc(db, "students", uid, "files", fid)).then(d => {
    if (!d.exists()) { $("fname").textContent = "파일을 찾을 수 없습니다"; return; }
    fileCache.set(key, d.data());
    if (mounted === `file:${uid}:${fid}`) showFile(key);
  }).catch(() => { $("fname").textContent = "파일을 불러오지 못했습니다"; });
}
function showFile(key) {
  const c = fileCache.get(key);
  $("fname").textContent = c.name;
  const stage = $("fstage");
  if (/\.html?$/i.test(c.name)) {
    const fr = document.createElement("iframe");
    fr.title = c.name;
    fr.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups");
    fr.setAttribute("referrerpolicy", "no-referrer");
    fr.srcdoc = c.content;
    stage.replaceChildren(fr);
  } else {
    const pre = document.createElement("pre");
    pre.className = "fcode"; pre.textContent = c.content;
    stage.replaceChildren(pre);
  }
}
function paintFile(uid, fid) {
  const s = app.students.get(uid);
  const f = s?.files?.[fid];
  const mine = uid === app.user?.uid;
  const back = $("fback");
  if (back) { back.href = mine ? "#/" : `#/s/${encodeURIComponent(uid)}`; back.lastChild.textContent = mine ? "대시보드" : `${s?.name || ""} 대시보드`; }
  if (f && $("fmeta")) {
    const t = allTasks().find(x => taskKey(x.stage, x.task) === f.task);
    $("fmeta").textContent = [s?.name, t?.task.title, kb(f.size || 0)].filter(Boolean).join(" · ");
  }
}
