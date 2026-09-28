import { firebaseConfig } from "./firebase-config.js";
import { STAGES, TYPES } from "./guide.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1";
const MAX_ITEMS = 50;

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
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  left: "M19 12H5M12 5l-7 7 7 7",
  right: "M5 12h14M12 5l7 7-7 7",
  ur: "M7 17L17 7M8 7h9v9",
  check: "M5 12.5l4.5 4.5L19 7.5",
  copy: "M9 9h10v10H9zM5 15V5h10"
};
const icon = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;

/* 데이터 접근 */
const taskKey = (stage, task) => `${stage.id}_${task.id}`;
const resultOf = (s, stage, task) => s?.results?.[taskKey(stage, task)] || null;
const taskDone = (s, stage, task) => hasValue(resultOf(s, stage, task));
const itemsOf = (s, stageId) => Array.isArray(s?.materials?.[stageId]) ? s.materials[stageId] : [];
const stageOf = id => STAGES.find(s => s.id === id);
const allTasks = () => STAGES.flatMap(st => st.tasks.map(t => ({ stage: st, task: t })));
function stageProgress(s, st) {
  const done = st.tasks.filter(t => taskDone(s, st, t)).length;
  return { done, total: st.tasks.length, links: itemsOf(s, st.id).length };
}
const activity = (s, st) => { const p = stageProgress(s, st); return p.done + p.links; };
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
  return { name: "home" };
}
function routeKey(r) {
  if (!configured) return "setup";
  if (!app.authReady) return "wait";
  if (r.name === "stage") return "stage:" + r.stage.id;
  if (r.name === "task") return `task:${r.stage.id}:${r.index}`;
  if (!app.user) return "gate";
  if (r.name === "student") return r.uid === app.user.uid ? "dash:" + r.uid : "dash:" + r.uid;
  if (r.name === "class") return "class";
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
    $("nav").innerHTML = app.authReady ? `<button class="link mono" type="button" data-act="login">로그인</button>` : "";
    return;
  }
  const dash = r.name === "home" || (r.name === "student" && r.uid === app.user.uid);
  $("nav").innerHTML = `
    <a class="link" href="#/" ${dash ? 'aria-current="page"' : ""}>내 대시보드</a>
    <a class="link" href="#/class" ${r.name === "class" || (r.name === "student" && !dash) ? 'aria-current="page"' : ""}>수강생</a>
    <button class="link mono hide-sm" type="button" data-act="logout">로그아웃</button>`;
}
document.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  const a = act.dataset.act;
  if (a === "login") login();
  else if (a === "logout") logout();
  else if (a === "copy") copyPrompt(act);
  else if (a === "del") onDeleteMaterial(act);
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

/* 개념 블록 */
function blocksHtml(blocks) {
  return blocks.map(b => {
    if (b.t === "h") return `<h3 class="bh">${esc(b.text)}${b.sub ? `<span>${esc(b.sub)}</span>` : ""}</h3>`;
    if (b.t === "p") return `<p class="bp">${esc(b.text)}</p>`;
    if (b.t === "key") return `<p class="bkey">${esc(b.text)}</p>`;
    if (b.t === "src") return `<p class="bsrc">출처 · ${esc(b.text)}</p>`;
    if (b.t === "table") return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    if (b.t === "cards") return `<div class="bcards c${b.cols}">${b.items.map(c => `
      <div class="bcard">${c.label ? `<span class="mono muted">${esc(c.label)}</span>` : ""}${c.title ? `<strong>${esc(c.title)}</strong>` : ""}${c.lines.length ? `<ul>${c.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>`;
    if (b.t === "steps") return `<ol class="bsteps">${b.items.map(s => `<li><strong>${esc(s.title)}</strong>${s.lines.length ? `<ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>`;
    return "";
  }).join("");
}

/* 대시보드 */
function mountDashboard(uid) {
  const mine = uid === app.user.uid;
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
      <div>${mine ? "" : backLink("#/class", "수강생 전체")}<h1 id="headline"></h1></div>
      ${side}
    </header>
    <nav aria-label="과정 흐름"><ol class="flow" id="flow"></ol></nav>
    <div class="stats" id="stats"></div>
    <main id="board"></main>`;
  if (mine) {
    const f = $("profile");
    f.addEventListener("input", () => { f.dataset.dirty = "1"; });
    f.addEventListener("submit", onProfileSubmit);
  }
}
function paintDashboard(uid) {
  const mine = uid === app.user.uid;
  const s = app.students.get(uid);
  if (!s && !mine) { $("headline").innerHTML = app.loaded ? "학생을 찾을 수 없습니다" : "불러오는 중"; return; }
  const data = s || {};
  $("headline").innerHTML = `${esc(data.name || "이름")}<span class="sub">학습 대시보드</span>`;
  document.title = data.name ? `${data.name} | 온라인마케팅실전` : "온라인마케팅실전 학습 포트폴리오";

  $("facts").innerHTML = [["학과", data.dept], ["학번", data.sid]].map(([k, v]) => `<dt class="mono">${k}</dt><dd>${esc(v || "-")}</dd>`).join("");
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
    const label = st.tasks.length ? `${p.done} / ${p.total}` : (p.links ? `링크 ${p.links}` : "준비 중");
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
    <div><b>${STAGES.reduce((a, st) => a + itemsOf(data, st.id).length, 0)}</b><span class="mono">제출 링크</span></div>
    <div>${nextHtml}<span class="mono">${next ? "다음 할 일" : "전체 과제"}</span></div>`;

  $("board").innerHTML = STAGES.map((st, i) => `
    <section class="dash-stage" id="dash-${st.id}">
      <div class="dash-head">
        <span class="stage-num">${pad(i + 1)}</span>
        <div><h2>${esc(st.name)}</h2><p>${esc(st.desc)}</p></div>
        ${mine ? `<a class="more mono" href="#/stage/${st.id}">단계 열기 ${icon("right")}</a>` : ""}
      </div>
      ${st.tasks.length ? st.tasks.map((t, j) => dashTask(data, st, t, j, mine)).join("") : ""}
      ${linksHtml(data, st)}
    </section>`).join("");
}
function linksHtml(data, st) {
  const items = itemsOf(data, st.id);
  if (!items.length && st.tasks.length) return "";
  if (!items.length) return `<p class="empty mono">등록된 자료 없음</p>`;
  return `<div class="dcard"><div class="dcard-head"><h3>제출 링크</h3></div><ul class="dlinks">${items.map(m => {
    const url = safeUrl(m.url);
    return `<li><span class="mono muted">${esc(m.type)}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m.title)} ${icon("ur")}</a>` : esc(m.title)}${m.date ? `<span class="mono muted">${esc(m.date)}</span>` : ""}</li>`;
  }).join("")}</ul></div>`;
}
function dashTask(data, st, t, j, mine) {
  const r = resultOf(data, st, t);
  const head = `<div class="dcard-head"><h3>${t.card ? `<span class="mono muted">${esc(t.card)}</span>` : ""}${esc(t.title)}</h3>${mine ? `<a class="more mono" href="#/stage/${st.id}/${j + 1}">${hasValue(r) ? "수정" : "작성하기"} ${icon("right")}</a>` : ""}</div>`;
  if (!hasValue(r)) return `<div class="dcard is-empty">${head}<p class="empty-line mono">아직 작성하지 않았습니다</p></div>`;
  return `<div class="dcard">${head}${renderResult(data, st, t, r)}</div>`;
}
const lines = v => esc(v || "").split("\n").filter(Boolean).map(l => `<li>${l}</li>`).join("");
const cell = v => v ? nl(v) : `<span class="muted">-</span>`;
const fileLink = r => { const u = safeUrl(r.file); return u ? `<a class="dfile mono" href="${esc(u)}" target="_blank" rel="noopener noreferrer">제출 파일 ${icon("ur")}</a>` : ""; };
function renderResult(data, st, t, r) {
  switch (t.id) {
    case "business":
      return `<dl class="dl7">${t.fields.map(f => `<div><dt>${esc(f.label)}</dt><dd>${cell(r[f.k])}</dd></div>`).join("")}</dl>`;
    case "c3pest":
      return `<div class="grid3">${[["Customer 고객", r.customer], ["Company 자사", r.company], ["Competitor 경쟁", r.competitor]].map(([k, v]) => `<div class="pane"><span class="mono muted">${k}</span><ul>${lines(v) || "<li class='muted'>-</li>"}</ul></div>`).join("")}</div>
        ${r.pest ? `<div class="pane wide"><span class="mono muted">PEST 선별 항목</span><ul>${lines(r.pest)}</ul></div>` : ""}`;
    case "swot":
      return `<div class="swot">${[["S 강점", r.s], ["W 약점", r.w], ["O 기회", r.o], ["T 위협", r.t]].map(([k, v]) => `<div class="pane"><span class="mono muted">${k}</span><ul>${lines(v) || "<li class='muted'>-</li>"}</ul></div>`).join("")}</div>
        <div class="grid4">${[["SO", r.so], ["ST", r.st], ["WO", r.wo], ["WT", r.wt]].map(([k, v]) => `<div class="pane"><span class="mono muted">${k} 전략</span><p>${cell(v)}</p></div>`).join("")}</div>
        ${r.weak ? `<p class="dnote"><span class="mono muted">근거가 약한 항목</span>${nl(r.weak)}</p>` : ""}${fileLink(r)}`;
    case "journey": {
      const f = t.fields[0];
      return `<div class="tbl-wrap"><table class="tbl dtbl"><thead><tr><th>단계</th>${f.cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${f.rows.map((row, i) => {
        const v = (r.rows || [])[i] || {};
        return `<tr class="${r.home === row ? "hl" : ""}"><th scope="row">${esc(row)}${r.home === row ? `<span class="tag mono">홈페이지</span>` : ""}</th>${f.cols.map(c => `<td>${cell(v[c.k])}</td>`).join("")}</tr>`;
      }).join("")}</tbody></table></div>
        ${r.home ? `<p class="dnote"><span class="mono muted">홈페이지가 담당할 단계 · ${esc(r.home)}</span>${cell(r.homeWhy)}</p>` : ""}${fileLink(r)}`;
    }
    case "rivals": {
      const list = (r.list || []).filter(hasValue);
      const f = t.fields[0].fields;
      return `<div class="tbl-wrap"><table class="tbl dtbl"><thead><tr><th></th>${list.map((c, i) => `<th>${esc(c.name || `경쟁사 ${i + 1}`)}</th>`).join("")}</tr></thead><tbody>${f.slice(1).map(x => `<tr><th scope="row">${esc(x.label)}</th>${list.map(c => `<td>${cell(c[x.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${r.diff ? `<p class="dnote"><span class="mono muted">다르게 할 수 있는 지점</span>${nl(r.diff)}</p>` : ""}`;
    }
    case "bench": {
      const list = (r.list || []).filter(hasValue);
      const f = t.fields[0].fields;
      return `<div class="tbl-wrap"><table class="tbl dtbl"><thead><tr><th></th>${list.map((c, i) => { const u = safeUrl(c.url); return `<th>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">홈페이지 ${i + 1} ${icon("ur")}</a>` : `홈페이지 ${i + 1}`}</th>`; }).join("")}</tr></thead><tbody>${f.slice(1).map(x => `<tr><th scope="row">${esc(x.label)}</th>${list.map(c => `<td>${cell(c[x.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="grid2">${r.common ? `<p class="dnote"><span class="mono muted">공통 구조</span>${nl(r.common)}</p>` : ""}${r.pages ? `<p class="dnote"><span class="mono muted">내 홈페이지 페이지 목록</span>${nl(r.pages)}</p>` : ""}</div>`;
    }
    case "stp": {
      const segs = r.segs || [];
      const rank = i => r.first === `세그먼트 ${i + 1}` ? "1순위" : r.second === `세그먼트 ${i + 1}` ? "2순위" : "";
      return `<div class="stp">
        <div>
          ${r.position ? `<p class="quote">${esc(r.position)}</p>` : ""}
          <ol class="segs">${segs.map((sg, i) => hasValue(sg) ? `<li class="${rank(i) === "1순위" ? "on" : ""}"><span class="mono muted">${pad(i + 1)}</span><div><strong>${esc(sg.name || "-")}</strong>${rank(i) ? `<span class="tag mono">${rank(i)}</span>` : ""}<p>${esc(sg.desc || "")}</p></div></li>` : "").join("")}</ol>
          ${r.why ? `<p class="dnote"><span class="mono muted">순서의 근거</span>${nl(r.why)}</p>` : ""}
        </div>
        ${mapSvg(r)}
      </div>`;
    }
    case "plan": {
      const f = t.fields[0];
      const goals = (r.goals || []).filter(hasValue);
      const weak = (r.weak || []).filter(hasValue);
      return `${goals.length ? `<ol class="goals">${goals.map(g => `<li><span class="mono muted">${esc(g.channel || "채널")}</span><strong>${esc(g.metric || "지표")}</strong><span class="gv">${esc(g.now || "측정 필요")} ${icon("right")} <b>${esc(g.target || "-")}</b></span></li>`).join("")}</ol>` : ""}
        <div class="tbl-wrap"><table class="tbl dtbl"><thead><tr><th></th>${f.cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${f.rows.map((row, i) => { const v = (r.mix || [])[i] || {}; return `<tr><th scope="row">${esc(row)}</th>${f.cols.map(c => `<td>${cell(v[c.k])}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>
        ${weak.length ? `<div class="grid2">${weak.map(w => `<div class="pane"><span class="mono muted">약한 단계 · ${esc(w.stage || "-")}</span><p><b>0원 안</b> ${cell(w.free)}</p><p><b>월 30만원 안</b> ${cell(w.paid)}</p></div>`).join("")}</div>` : ""}`;
    }
    case "summary":
      return `<p class="quote big">나는 <b>${esc(r.target || "[ 타깃 ]")}</b>에게 <b>${esc(r.value || "[ 경쟁사와 다른 가치 ]")}</b>를 <b>${esc(r.channel || "[ 채널 ]")}</b>로 전달해 <b>${esc(r.stage || "[ 구매 여정의 단계 ]")}</b> 단계를 공략한다</p>${checklistHtml(data)}${fileLink(r)}`;
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
  return `<ul class="checks">${items.map(([label, ids]) => {
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
      <line x1="${P / 2}" y1="${C}" x2="${S - P / 2}" y2="${C}" class="pm-axis"/>
      <line x1="${C}" y1="${P / 2}" x2="${C}" y2="${S - P / 2}" class="pm-axis"/>
      <text x="8" y="${C - 8}" class="pm-lab">${esc(xl || "")}</text>
      <text x="${S - 8}" y="${C - 8}" class="pm-lab" text-anchor="end">${esc(xr || "")}</text>
      <text x="${C + 8}" y="18" class="pm-lab">${esc(yt || "")}</text>
      <text x="${C + 8}" y="${S - 10}" class="pm-lab">${esc(yb || "")}</text>
      ${pts.map(p => `<g class="${p.me ? "pm-me" : "pm-pt"}"><circle cx="${pos(p.x)}" cy="${pos(-p.y)}" r="${p.me ? 7 : 5}"/><text x="${pos(p.x) + 10}" y="${pos(-p.y) + 4}">${esc(p.name)}</text></g>`).join("")}
    </svg>
    ${pts.length ? "" : `<figcaption class="mono muted">좌표를 입력하면 맵이 그려집니다</figcaption>`}
  </figure>`;
}

/* 단계 페이지 */
function mountStage(st) {
  const i = STAGES.indexOf(st);
  const mine = Boolean(app.user);
  $("view").innerHTML = `
    <header class="intro stage-intro">
      <div>${backLink(app.user ? "#/" : "#/", app.user ? "내 대시보드" : "처음으로")}
        <h1><span class="num">${pad(i + 1)}</span>${esc(st.name)}${st.chapter ? `<span class="sub">${esc(st.chapter)} 학습</span>` : ""}</h1>
      </div>
      <p class="lead">${esc(st.desc)}</p>
    </header>
    ${stageTabs(st)}
    <main class="stage-page">
      ${st.tasks.length ? `
        <section class="sec">
          <h2 class="sec-h">과제 순서<span>번호 순서대로 한 페이지씩 따라 하고 결과를 저장하세요</span></h2>
          <ol class="tasklist" id="tasklist"></ol>
        </section>` : `<section class="notice"><h2>학습자료 준비 중</h2><p>이 단계의 강의 내용은 수업 진행에 맞춰 추가됩니다. 그동안 결과물 링크는 아래에 등록할 수 있습니다.</p></section>`}
      ${st.overview.length ? `<section class="sec"><h2 class="sec-h">시작하기 전에<span>이 단계 전체에 적용되는 개념과 원칙</span></h2><div class="blocks">${blocksHtml(st.overview)}</div></section>` : ""}
      <section class="sec">
        <h2 class="sec-h">제출 링크<span>실습 파일, 결과물 페이지 등 외부 링크</span></h2>
        <div id="links"></div>
        ${mine ? addFormHtml(st) : ""}
      </section>
    </main>`;
  if (mine) $("view").querySelector("form.add")?.addEventListener("submit", onAddMaterial);
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
      <span class="tb"><strong>${t.card ? `<span class="mono muted">프롬프트 카드 ${esc(t.card)}</span>` : ""}${esc(t.title)}</strong><span>${esc(t.desc)}</span></span>
      <span class="ts mono">${ok ? `${icon("check")} 저장됨` : "미작성"}</span>
    </a></li>`;
  }).join("");
  $("links").innerHTML = materialListHtml(st, itemsOf(data, st.id), Boolean(app.user));
}

/* 과제 페이지 */
function mountTask(st, index) {
  const t = st.tasks[index];
  const si = STAGES.indexOf(st);
  const prev = st.tasks[index - 1], next = st.tasks[index + 1];
  $("view").innerHTML = `
    <header class="intro task-intro">
      <div>${backLink(`#/stage/${st.id}`, `${pad(si + 1)} ${st.name}`)}
        <p class="eyebrow mono">과제 ${index + 1} / ${st.tasks.length}${t.card ? ` · 프롬프트 카드 ${esc(t.card)}` : ""}</p>
        <h1>${esc(t.title)}</h1>
      </div>
      <p class="lead">${esc(t.desc)}</p>
    </header>
    <nav class="tabs" id="task-tabs" aria-label="과제"></nav>
    <main class="task-page">
      ${t.concept?.length ? `<section class="sec"><details class="concept" open><summary><h2 class="sec-h">개념 정리<span>강의 내용 요약</span></h2></summary><div class="blocks">${blocksHtml(t.concept)}</div></details></section>` : ""}
      <section class="sec">
        <h2 class="sec-h">따라하기<span>순서대로 진행하세요</span></h2>
        <ol class="follow">${t.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      </section>
      ${t.prompt ? `<section class="sec">
        <h2 class="sec-h">프롬프트 카드 ${esc(t.card)}<span>${esc(t.prompt.where)}</span></h2>
        <div class="prompt">
          <div class="prompt-main">
            <div class="prompt-bar"><span class="mono muted" id="prompt-hint"></span><button class="btn ghost" type="button" data-act="copy">${icon("copy")}복사하기</button></div>
            <pre id="prompt-body"></pre>
          </div>
          <div class="prompt-side">${t.prompt.side.map(b => `<div><strong>${esc(b.title)}</strong><ul>${b.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("")}</div>
        </div>
        ${t.prompt.foot ? `<p class="bkey">${esc(t.prompt.foot)}</p>` : ""}
      </section>` : ""}
      ${t.lab ? `<section class="sec">
        <h2 class="sec-h">실습 ${esc(t.lab.no)} 제출 기준<span>${esc(t.lab.title)}</span></h2>
        <div class="lab">
          <div><strong>${esc(t.lab.what)}</strong><ul>${t.lab.items.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>
          <dl><dt class="mono">파일명</dt><dd>${esc(t.lab.file)}</dd><dt class="mono">형식</dt><dd>${esc(t.lab.format)}</dd><dt class="mono">주의</dt><dd>${esc(t.lab.note)}</dd></dl>
        </div>
      </section>` : ""}
      ${t.check ? `<section class="sec"><h2 class="sec-h">기획서 점검표<span>저장한 과제를 기준으로 자동 확인</span></h2><div id="checklist"></div></section>` : ""}
      <section class="sec result">
        <h2 class="sec-h">결과 저장<span>검증한 내용만 옮겨 적고 저장하면 대시보드에 반영됩니다</span></h2>
        ${app.user ? `<form class="rform" id="rform" autocomplete="off">
          ${t.fields.map(f => fieldHtml(f)).join("")}
          <div class="actions"><button class="btn" type="submit">저장하기</button><p class="note mono" id="rnote" role="status"></p></div>
        </form>` : `<div class="notice"><p>결과를 저장하려면 로그인하세요.</p><button class="btn" type="button" data-act="login">구글 계정으로 로그인</button></div>`}
      </section>
      <nav class="pager">
        ${prev ? `<a href="#/stage/${st.id}/${index}">${icon("left")}<span><span class="mono muted">이전 과제</span>${esc(prev.title)}</span></a>` : `<a href="#/stage/${st.id}">${icon("left")}<span><span class="mono muted">단계 목록</span>${esc(st.name)}</span></a>`}
        ${next ? `<a class="nx" href="#/stage/${st.id}/${index + 2}"><span><span class="mono muted">다음 과제</span>${esc(next.title)}</span>${icon("right")}</a>` : `<a class="nx" href="#/"><span><span class="mono muted">완료</span>내 대시보드</span>${icon("right")}</a>`}
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
      hint = b ? "내 비즈니스 정리가 자동으로 채워졌습니다" : "1단계 내 비즈니스 정리를 저장하면 대괄호 자리가 자동으로 채워집니다";
    }
    if (body.includes("{{urls}}")) {
      const r = resultOf(data, stageOf("strategy"), stageOf("strategy").tasks.find(x => x.id === "bench"));
      const urls = (r?.list || []).map(x => safeUrl(x?.url)).filter(Boolean);
      body = body.replace("{{urls}}", urls.length ? urls.join("\n") : t.prompt.fallback);
      hint = urls.length ? "저장한 홈페이지 주소가 채워졌습니다" : "아래 결과 칸에 주소를 저장하면 자동으로 채워집니다";
    }
    $("prompt-body").textContent = body;
    $("prompt-hint").textContent = hint;
  }
  if (t.check) $("checklist").innerHTML = checklistHtml(data);
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

/* 제출 링크 */
function addFormHtml(st) {
  return `
    <form class="add" data-stage="${st.id}" autocomplete="off">
      <label class="field"><span class="mono">종류</span><select name="type">${TYPES.map(t => `<option>${t}</option>`).join("")}</select></label>
      <label class="field f-title"><span class="mono">제목</span><input name="title" maxlength="80" placeholder="자료 제목" required></label>
      <label class="field"><span class="mono">날짜</span><input name="date" type="date" value="${today()}"></label>
      <label class="field wide"><span class="mono">링크</span><input name="url" type="text" inputmode="url" placeholder="https://" maxlength="500"></label>
      <label class="field wide"><span class="mono">설명</span><input name="desc" maxlength="120" placeholder="한 줄 설명 (선택)"></label>
      <div class="actions"><button class="btn" type="submit">등록하기</button><p class="note mono" role="status"></p></div>
    </form>`;
}
function materialListHtml(st, items, mine) {
  if (!items.length) return `<p class="empty mono">등록된 링크 없음</p>`;
  return `<ol class="list">${items.map((m, j) => {
    const url = safeUrl(m.url);
    const title = url ? `<a class="title" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m.title)} <span class="go">${icon("ur")}</span></a>` : `<span class="title">${esc(m.title)}</span>`;
    return `<li class="row"><span class="n mono">${pad(j + 1)}</span><span class="type mono">${esc(m.type)}</span>
      <span class="body">${title}${m.desc ? `<span class="desc">${esc(m.desc)}</span>` : ""}</span>
      <span class="end">${m.date ? `<span class="date mono">${esc(m.date)}</span>` : ""}${mine ? `<button class="del mono" type="button" data-act="del" data-stage="${st.id}" data-index="${j}">삭제</button>` : ""}</span></li>`;
  }).join("")}</ol>`;
}
function onAddMaterial(e) {
  e.preventDefault();
  const f = e.target;
  const note = f.querySelector(".note");
  const stageId = f.dataset.stage;
  if (!me()?.name) { flash(note, false, `먼저 <a href="#/">내 대시보드</a>에서 이름을 저장하세요`); return; }
  const title = f.elements.title.value.trim();
  if (!title) { flash(note, false, "제목을 입력하세요"); return; }
  const rawUrl = f.elements.url.value.trim();
  const url = safeUrl(rawUrl);
  if (rawUrl && !url) { flash(note, false, "링크 주소를 확인하세요"); return; }
  const items = itemsOf(me(), stageId);
  if (items.length >= MAX_ITEMS) { flash(note, false, `한 단계에 ${MAX_ITEMS}개까지 등록할 수 있습니다`); return; }
  const item = { type: f.elements.type.value, title, url, date: f.elements.date.value, desc: f.elements.desc.value.trim() };
  withBusy(f, async () => {
    try {
      await saveMine({ materials: { [stageId]: [...items, item] } });
      f.elements.title.value = ""; f.elements.url.value = ""; f.elements.desc.value = "";
      flash(note, true, "등록되었습니다");
    } catch { flash(note, false, "저장하지 못했습니다"); }
  });
}
async function onDeleteMaterial(b) {
  const items = itemsOf(me(), b.dataset.stage);
  const idx = +b.dataset.index;
  if (!items[idx] || !confirm(`"${items[idx].title}" 링크를 삭제할까요?`)) return;
  try { await saveMine({ materials: { [b.dataset.stage]: items.filter((_, i) => i !== idx) } }); }
  catch { alert("삭제하지 못했습니다"); }
}

/* 수강생 전체 */
function mountClass() {
  $("view").innerHTML = `
    ${introHtml("온라인마케팅실전", "수강생 전체", `<p class="lead">단계별 진행률과 수강생별 진행 상황입니다. 이름을 누르면 해당 학생의 대시보드를 볼 수 있습니다.</p>`)}
    <nav aria-label="과정 흐름"><ol class="flow" id="flow"></ol></nav>
    <div class="stats" id="stats"></div>
    <main>
      <div class="roster-head">
        <h2>수강생</h2>
        <label class="field"><span class="mono">검색</span><input id="q" type="search" placeholder="이름, 학과, 학번"></label>
      </div>
      <ol class="roster" id="roster"></ol>
    </main>`;
  $("q").addEventListener("input", paintRoster);
}
function sortedStudents() {
  return [...app.students.entries()].filter(([, s]) => s.name)
    .sort(([, a], [, b]) => String(a.sid || "").localeCompare(String(b.sid || "")) || String(a.name).localeCompare(String(b.name), "ko"));
}
function paintClass() {
  const list = sortedStudents();
  const n = list.length;
  $("flow").innerHTML = STAGES.map((s, i) => {
    const done = list.filter(([, st]) => activity(st, s)).length;
    const pct = n ? Math.round(done / n * 100) : 0;
    return `<li><a class="cell" href="#/stage/${s.id}">
      <span class="idx mono"><span>${pad(i + 1)}</span><span class="arrow">${icon("right")}</span></span>
      <span class="name">${esc(s.name)}</span>
      <span class="rate"><span class="track"><span style="width:${pct}%"></span></span><span class="label mono"><span>${done} / ${n}명</span><span>${pct}%</span></span></span>
    </a></li>`;
  }).join("");
  const tasks = allTasks();
  const doneAll = list.reduce((a, [, s]) => a + tasks.filter(x => taskDone(s, x.stage, x.task)).length, 0);
  $("stats").innerHTML = `
    <div><b>${n}</b><span class="mono">참여 학생</span></div>
    <div><b>${doneAll}</b><span class="mono">저장된 과제</span></div>
    <div><b>${n && tasks.length ? Math.round(doneAll / (n * tasks.length) * 100) : 0}<span class="mono">%</span></b><span class="mono">평균 과제 완료율</span></div>`;
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
  const head = `<li class="r th mono" aria-hidden="true"><span>No.</span><span>이름</span><span class="dp-col">학과</span><span>학번</span>
    <span class="strip">${STAGES.map((_, i) => `<span class="sq">${pad(i + 1)}</span>`).join("")}</span><span class="sum">완료</span></li>`;
  if (!list.length) { el.innerHTML = head + `<li class="empty mono">${q ? "검색 결과 없음" : "아직 등록한 학생이 없습니다"}</li>`; return; }
  el.innerHTML = head + list.map(([uid, s], i) => {
    const c = STAGES.map(st => activity(s, st));
    const d = tasks.filter(x => taskDone(s, x.stage, x.task)).length;
    return `<li><a class="r" href="#/s/${encodeURIComponent(uid)}">
      <span class="n mono">${pad(i + 1)}</span>
      <span class="nm${uid === app.user.uid ? " me" : ""}">${esc(s.name)}</span>
      <span class="dp dp-col">${esc(s.dept || "")}</span>
      <span class="sid mono">${esc(s.sid || "")}</span>
      <span class="strip" aria-label="단계별 진행 ${c.join(", ")}">${c.map(v => `<span class="sq${v ? "" : " none"}">${v || ""}</span>`).join("")}</span>
      <span class="sum mono">${d}/${tasks.length}</span>
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
