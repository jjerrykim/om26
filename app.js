import { firebaseConfig } from "./firebase-config.js";
import { STAGES } from "./guide.js";
import { EXAMPLE } from "./example.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1";

/* 공통 함수 */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = s => esc(s).replace(/\n/g, "<br>");
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
  if (parts[0] === "example") return { name: "example" };
  if (parts[0] === "import") return { name: "import" };
  return { name: "home" };
}
function routeKey(r) {
  if (!configured) return "setup";
  if (!app.authReady) return "wait";
  if (r.name === "stage") return "stage:" + r.stage.id;
  if (r.name === "task") return `task:${r.stage.id}:${r.index}`;
  if (r.name === "example") return "dash:example";
  if (!app.user) return "gate";
  if (r.name === "student") return r.uid === app.user.uid ? "dash:" + r.uid : "dash:" + r.uid;
  if (r.name === "class") return "class";
  if (r.name === "import") return "import";
  return "dash:" + app.user.uid;
}
function route() {
  const r = currentRoute();
  renderNav(r);
  const key = routeKey(r);
  if (key !== mounted) {
    mounted = key;
    if (key === "setup") mountSetup();
    else if (key === "wait") $("view").innerHTML = `<p class="empty mono">불러오는 중</p>`;
    else if (key === "gate") mountGate();
    else if (key === "class") mountClass();
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
  else if (mounted.startsWith("dash:")) paintDashboard(mounted.slice(5));
  else if (mounted.startsWith("stage:")) paintStage(stageOf(mounted.slice(6)));
  else if (mounted.startsWith("task:")) { const [, sid, i] = mounted.split(":"); paintTask(stageOf(sid), +i); }
}
window.addEventListener("hashchange", route);

/* 상단 메뉴 */
function renderNav(r) {
  if (!configured) { $("nav").innerHTML = ""; return; }
  if (!app.user) {
    $("nav").innerHTML = app.authReady ? `<a class="link" href="#/example" ${r.name === "example" ? 'aria-current="page"' : ""}>예시</a><button class="link mono" type="button" data-act="login">로그인</button>` : "";
    return;
  }
  const dash = r.name === "home" || (r.name === "student" && r.uid === app.user.uid);
  $("nav").innerHTML = `
    <a class="link" href="#/" ${dash ? 'aria-current="page"' : ""}>내 대시보드</a>
    <a class="link" href="#/class" ${r.name === "class" || (r.name === "student" && !dash) ? 'aria-current="page"' : ""}>수강생</a>
    <a class="link" href="#/example" ${r.name === "example" ? 'aria-current="page"' : ""}>예시</a>
    <button class="link mono hide-sm" type="button" data-act="logout">로그아웃</button>`;
}
document.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  const a = act.dataset.act;
  if (a === "login") login();
  else if (a === "logout") logout();
  else if (a === "copy") copyPrompt(act);
  else if (a === "edit-profile") { $("profile-wrap").hidden = false; $("facts-wrap").hidden = true; }
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
function dashData(uid) { return uid === "example" ? EXAMPLE : app.students.get(uid); }
function mountDashboard(uid) {
  const mine = uid === app.user?.uid;
  const side = mine ? `
    <div class="side">
      <div id="facts-wrap"><dl class="facts" id="facts"></dl><button class="link mono" type="button" data-act="edit-profile">정보 수정</button></div>
      <form class="profile" id="profile" autocomplete="off">
        <div id="profile-wrap" class="profile-fields">
          <label class="field"><span class="mono">이름</span><input name="name" maxlength="20" placeholder="이름" required></label>
          <label class="field"><span class="mono">학과</span><input name="dept" maxlength="40" placeholder="학과"></label>
          <label class="field"><span class="mono">학번</span><input name="sid" maxlength="20" inputmode="numeric" placeholder="학번"></label>
          <button class="btn" type="submit">저장하기</button>
        </div>
        <p class="note mono" id="profile-note" role="status"></p>
      </form>
    </div>` : `<div class="side"><dl class="facts" id="facts"></dl></div>`;
  $("view").innerHTML = `
    <header class="intro">
      <div>${mine || uid === "example" ? "" : backLink("#/class", "수강생")}<h1 id="headline"></h1></div>
      ${side}
    </header>
    <nav aria-label="과정 흐름"><ol class="flow" id="flow"></ol></nav>
    <div class="stats" id="stats"></div>
    <div id="oneline"></div>
    <main id="board"></main>`;
  if (mine) {
    const f = $("profile");
    f.addEventListener("input", () => { f.dataset.dirty = "1"; });
    f.addEventListener("submit", onProfileSubmit);
  }
}
function paintDashboard(uid) {
  const mine = uid === app.user?.uid;
  const s = dashData(uid);
  if (!s && !mine) { $("headline").innerHTML = app.loaded ? "학생을 찾을 수 없습니다" : "불러오는 중"; return; }
  const data = s || {};
  $("headline").innerHTML = `${esc(data.name || "이름")}<span class="sub">${uid === "example" ? "학습 대시보드 예시" : "학습 대시보드"}</span>`;
  document.title = data.name ? `${data.name} | 온라인마케팅실전` : "온라인마케팅실전 학습 포트폴리오";

  $("facts").innerHTML = (data.facts || [["학과", data.dept], ["학번", data.sid]]).map(([k, v]) => `<dt class="mono">${k}</dt><dd>${esc(v || "-")}</dd>`).join("");
  if (mine) {
    const f = $("profile");
    const needName = !data.name;
    if (needName) { $("profile-wrap").hidden = false; $("facts-wrap").hidden = true; }
    else if (!f.dataset.dirty) { $("profile-wrap").hidden = true; $("facts-wrap").hidden = false; }
    if (!f.dataset.dirty && document.activeElement?.form !== f) {
      f.elements.name.value = data.name || "";
      f.elements.dept.value = data.dept || "";
      f.elements.sid.value = data.sid || "";
    }
  }

  $("flow").innerHTML = STAGES.map((st, i) => {
    const p = stageProgress(data, st);
    const label = st.tasks.length ? `${p.done} / ${p.total}` : "준비 중";
    return `<li><a class="cell" href="${mine ? `#/stage/${st.id}` : `#dash-${st.id}`}" ${mine ? "" : `data-scroll="dash-${st.id}"`}>
      <span class="idx mono"><span>${pad(i + 1)}</span><span class="arrow">${icon(mine ? "right" : "down")}</span></span>
      <span class="name">${esc(st.name)}</span>
      <span class="rate">${bar(p.done, p.total)}<span class="label mono"><span>${label}</span><span>${st.tasks.length ? Math.round(p.done / p.total * 100) + "%" : ""}</span></span></span>
    </a></li>`;
  }).join("");
  $("flow").querySelectorAll("[data-scroll]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); $(a.dataset.scroll)?.scrollIntoView({ behavior: "smooth" }); }));

  const tasks = allTasks();
  const done = tasks.filter(x => taskDone(data, x.stage, x.task)).length;
  const next = tasks.find(x => !taskDone(data, x.stage, x.task));
  const nextHtml = next
    ? (mine ? `<a class="next" href="#/stage/${next.stage.id}/${next.stage.tasks.indexOf(next.task) + 1}">${esc(next.task.title)} ${icon("right")}</a>` : `<b class="next">${esc(next.task.title)}</b>`)
    : `<b>완료</b>`;
  $("stats").innerHTML = `
    <div><b>${done}<span class="mono"> / ${tasks.length}</span></b><span class="mono">완료한 과제</span></div>
    <div>${nextHtml}<span class="mono">${next ? "다음 할 일" : "전체 과제"}</span></div>`;

  const sm = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "summary"));
  $("oneline").innerHTML = hasValue(sm) ? `<p class="oneline">나는 <b>${esc(sm.target || "[타깃]")}</b>에게 <b>${esc(sm.value || "[가치]")}</b>를 <b>${esc(sm.channel || "[채널]")}</b>로 전달해 <b>${esc(sm.stage || "[단계]")}</b> 단계를 공략한다</p>` : "";
  $("board").innerHTML = STAGES.map((st, i) => `
    <section class="dash-stage" id="dash-${st.id}">
      <div class="dash-head">
        <span class="stage-num">${pad(i + 1)}</span>
        <div><h2>${esc(st.name)}</h2><p>${esc(st.desc)}</p></div>
        ${mine ? `<a class="more mono" href="#/stage/${st.id}">열기 ${icon("right")}</a>` : ""}
      </div>
      ${st.tasks.filter(t => taskDone(data, st, t)).map(t => dashTask(data, st, t, st.tasks.indexOf(t), mine)).join("")}
      ${todoHtml(data, st, mine)}
      ${st.tasks.length ? "" : `<p class="empty mono">준비 중</p>`}
    </section>`).join("");
}
function todoHtml(data, st, mine) {
  const left = st.tasks.filter(t => !taskDone(data, st, t));
  if (!left.length) return "";
  return `<div class="todo"><span class="mono muted">${left.length === st.tasks.length ? "아직 작성한 과제 없음" : "남은 과제"}</span>${left.map(t => mine
    ? `<a href="#/stage/${st.id}/${st.tasks.indexOf(t) + 1}">${esc(t.title)}${icon("right")}</a>`
    : `<span>${esc(t.title)}</span>`).join("")}</div>`;
}
function dashTask(data, st, t, j, mine) {
  const r = resultOf(data, st, t);
  const head = `<div class="dcard-head"><h3>${t.card ? `<span class="mono muted">${esc(t.card)}</span>` : ""}${esc(t.id === "summary" ? "기획서 점검" : t.title)}</h3>${mine ? `<a class="more mono" href="#/stage/${st.id}/${j + 1}">${hasValue(r) ? "수정" : "작성하기"} ${icon("right")}</a>` : ""}</div>`;
  if (!hasValue(r)) return `<div class="dcard is-empty">${head}<p class="empty-line mono">아직 작성하지 않았습니다</p></div>`;
  return `<div class="dcard">${head}${renderResult(data, st, t, r)}</div>`;
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
    default:
      return `<dl class="dl7">${t.fields.map(f => `<div><dt>${esc(f.label)}</dt><dd>${cell(typeof r[f.k] === "string" ? r[f.k] : "")}</dd></div>`).join("")}</dl>`;
  }
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
      <div>${backLink("#/", app.user ? "내 대시보드" : "처음으로")}
        <p class="eyebrow mono">${pad(i + 1)}${st.chapter ? ` · ${esc(st.chapter)}` : ""}</p>
        <h1>${esc(st.name)}</h1>
      </div>
      <p class="lead">${esc(st.desc)}</p>
    </header>
    ${stageTabs(st)}
    <main class="stage-page">
      ${st.points.length ? `<section class="sec">${pointsHtml(st.points)}</section>` : ""}
      ${st.tasks.length ? `
        <section class="sec">
          <h2 class="sec-h">과제<span>순서대로 진행하세요</span></h2>
          <ol class="tasklist" id="tasklist"></ol>
        </section>` : `
        <section class="notice"><h2>준비 중</h2><p>이 단계의 과제는 수업 진행에 맞춰 열립니다.</p></section>`}
    </main>`;
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
          <button class="btn copy" type="button" data-act="copy">${icon("copy")}복사하기</button>
          <pre id="prompt-body"></pre>
        </div>
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
        ${next ? `<a class="nx" href="#/stage/${st.id}/${index + 2}"><span><span class="mono muted">다음</span>${esc(next.title)}</span>${icon("right")}</a>` : `<a class="nx" href="#/"><span><span class="mono muted">완료</span>내 대시보드</span>${icon("right")}</a>`}
      </nav>
    </main>`;
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
    if (body.includes("{{urls}}")) {
      const r = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "bench"));
      const urls = (r?.list || []).map(x => safeUrl(x?.url)).filter(Boolean);
      body = body.replace("{{urls}}", urls.length ? urls.join("\n") : t.prompt.fallback);
      hint = urls.length ? "저장한 주소가 들어갔습니다" : "아래에 주소를 저장하면 자동으로 채워집니다";
    }
    $("prompt-body").textContent = body;
    $("prompt-hint").textContent = hint;
  }
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
    if (f.type === "grid") out[f.k] = f.rows.map((_, i) => Object.fromEntries(f.cols.map(c => [c.k, val(`${f.k}.${i}.${c.k}`)])));
    else if (f.type === "group") out[f.k] = Array.from({ length: f.count }, (_, i) => Object.fromEntries(f.fields.map(x => [x.k, val(`${f.k}.${i}.${x.k}`, x.type)])));
    else out[f.k] = val(f.k, f.type);
  }
  return out;
}
function fillForm(form, t, r) {
  const set = (name, v) => { const e = form.elements.namedItem(name); if (e) e.value = v ?? ""; };
  for (const f of t.fields) {
    if (f.type === "grid") f.rows.forEach((_, i) => f.cols.forEach(c => set(`${f.k}.${i}.${c.k}`, r[f.k]?.[i]?.[c.k])));
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
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/">내 대시보드</a>에서 이름을 저장하세요`); return; }
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

/* 프로필 */
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
      $("profile-wrap").hidden = true; $("facts-wrap").hidden = false;
      flash(note, true, "저장되었습니다");
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
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/">내 대시보드</a>에서 이름을 저장하세요`); return; }
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
      <div><h1>수강생</h1><p class="mono muted" id="class-sum"></p></div>
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
