// ===================================================================== // store.js — 內建帳號登入與雲端同步完整版 // ===================================================================== 
import { CATS } from "./data.js";

const LS_KEY = "spellAgent.v2"; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbycTj2QwPR510TdctWmT0MCD3CE068Lu6cB_JsNQ_We70wflVsqteGqjW5tVGTTgusG/exec";

// 從 localStorage 讀取目前帳號
let currentUsername = localStorage.getItem("spellAgent_current_username") || "";

// 自動在畫面左上角或適當位置注入一個簡單的「登入/切換帳號」按鈕與顯示區
function injectUserLoginUI() {
  if (document.getElementById("cloud-user-bar")) return;

  const bar = document.createElement("div");
  bar.id = "cloud-user-bar";
  bar.style.cssText = "position:fixed; top:10px; right:10px; background:#fff; padding:6px 12px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:9999; font-size:14px; display:flex; align-items:center; gap:8px;";

  const label = document.createElement("span");
  label.innerHTML = `👤 帳號: <b>${currentUsername || "未登入"}</b>`;

  const btn = document.createElement("button");
  btn.innerText = currentUsername ? "切換帳號" : "登入同步";
  btn.style.cssText = "padding:2px 8px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:4px;";
  
  btn.onclick = async () => {
    const input = prompt("請輸入您的專屬登入帳號（例如學號或英文名字）：", currentUsername);
    if (input && input.trim()) {
      const uname = input.trim();
      localStorage.setItem("spellAgent_current_username", uname);
      currentUsername = uname;
      
      // 顯示讀取中
      btn.innerText = "同步中...";
      await loginAndSync(uname);
      alert(`已成功切換至帳號：${uname}，畫面將重新整理！`);
      location.reload();
    }
  };

  bar.appendChild(label);
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

// 當 DOM 載入完成後自動顯示登入列
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectUserLoginUI);
  } else {
    injectUserLoginUI();
  }
}

// 向 Google 試算表抓取該帳號的遠端紀錄
export async function loginAndSync(username) {
  if (!username) return;
  currentUsername = username.trim();
  localStorage.setItem("spellAgent_current_username", currentUsername);

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "login", username: currentUsername })
    });
    const result = await response.json();
    
    if (result.success) {
      if (result.progress) {
        const remoteData = JSON.parse(result.progress);
        DB = { ...fresh(), ...remoteData };
        saveLocalOnly();
        console.log("已從 Google 試算表成功載入進度");
      } else {
        DB = fresh();
        saveLocalOnly();
        console.log("全新帳號，從零開始");
      }
    }
  } catch (err) {
    console.error("雲端同步失敗，使用本地備份", err);
  }
}

// 頁面載入時若已有帳號，自動背景同步一次
if (currentUsername) {
  loginAndSync(currentUsername);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function dayAgo(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return { key: d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(), dnum: d.getDate() };
}

function fresh() {
  return {
    box: {}, stat: {}, lstat: {},
    level: { current: 1, unlocked: 1, placed: false },
    session: { active: false, date: null, answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 },
    history: {}, points: 0, streak: 0, best: 0, attempts: 0, correct: 0,
  };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY + "_" + currentUsername));
    if (!d) return fresh();
    const base = fresh();
    const merged = {
      ...base,
      ...d,
      level: { ...base.level, ...(d.level || {}) },
      session: { ...base.session, ...(d.session || {}) },
      history: d.history || {},
    };
    if (merged.session.active && merged.session.date !== todayStr()) merged.session.active = false;
    return merged;
  } catch {
    return fresh();
  }
}

let DB = load();

function saveLocalOnly() {
  try {
    const key = currentUsername ? `${LS_KEY}_${currentUsername}` : LS_KEY;
    localStorage.setItem(key, JSON.stringify(DB));
  } catch { /* storage off */ }
}

function save() {
  saveLocalOnly();

  if (!currentUsername) return;

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "save",
      username: currentUsername,
      progress: JSON.stringify(DB)
    })
  }).catch(err => {
    console.error("自動上傳 Google 試算表失敗", err);
  });
}

export function box(id) { return DB.box[id] || 0; }
export function everWrong(id) { return !!(DB.stat[id] && DB.stat[id].ew); }
export function correctCount(id) { return DB.stat[id] ? DB.stat[id].c : 0; }

export function grade(id, correct, level) {
  const before = box(id);
  const st = DB.stat[id] || (DB.stat[id] = { a: 0, c: 0, ew: false });
  st.a++;
  DB.attempts++;
  let gain = 0, newlyMastered = false;

  if (correct) {
    st.c++;
    DB.correct++;
    DB.box[id] = Math.min(3, before + 1);
    DB.streak++;
    DB.best = Math.max(DB.best, DB.streak);
    gain = 8 + Math.min(12, DB.streak * 2);
    DB.points += gain;
    if (DB.box[id] === 3 && before < 3) newlyMastered = true;
  } else {
    st.ew = true;
    DB.box[id] = 1;
    DB.streak = 0;
  }

  if (level) {
    const ls = DB.lstat[level] || (DB.lstat[level] = { a: 0, c: 0 });
    ls.a++;
    if (correct) ls.c++;
  }

  if (DB.session.active) {
    const s = DB.session;
    s.answered++;
    if (correct) s.correct++;
    else s.incorrect++;
    s.ids[id] = 1;
    if (newlyMastered) s.mastered++;

    const h = DB.history[todayStr()] || (DB.history[todayStr()] = { a: 0, c: 0, w: 0, m: 0 });
    h.a++;
    if (correct) h.c++;
    else h.w++;
    if (newlyMastered) h.m++;
  }

  save();
  return { correct, gain, streak: DB.streak, box: DB.box[id], newlyMastered };
}

export function reset() {
  DB = fresh();
  save();
}

export function sessionStart() {
  DB.session = { active: true, date: todayStr(), answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 };
  save();
}

export function sessionEnd() {
  const s = DB.session;
  const summary = {
    answered: s.answered,
    correct: s.correct,
    incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length,
    mastered: s.mastered,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
  DB.session.active = false;
  save();
  return summary;
}

export function historyData(n = 28) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const { key, dnum } = dayAgo(i);
    const h = DB.history[key];
    const a = h ? h.a : 0, c = h ? h.c : 0;
    days.push({ key, dnum, a, c, rate: a ? Math.round((c / a) * 100) : 0, level: a === 0 ? 0 : a < 10 ? 1 : a < 20 ? 2 : 3 });
  }
  const has = (off) => !!DB.history[dayAgo(off).key];
  let streak = 0;
  let start = has(0) ? 0 : has(1) ? 1 : null;
  if (start !== null) {
    let k = start;
    while (has(k)) { streak++; k++; }
  }
  const toIdx = (ds) => {
    const [y, m, d] = ds.split("-").map(Number);
    return Math.round(new Date(y, m - 1, d).getTime() / 86400000);
  };
  const idxs = Object.keys(DB.history).map(toIdx).sort((x, y) => x - y);
  let best = 0, cur = 0, prev = null;
  for (const i of idxs) {
    cur = (prev !== null && i === prev + 1) ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = i;
  }
  return { days, streak, best, total: idxs.length };
}

export function sessionState() {
  const s = DB.session;
  return {
    active: s.active,
    answered: s.answered,
    correct: s.correct,
    incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
}

export function progress() { return { ...DB.level }; }
export function levelStats(level) {
  const s = DB.lstat[level] || { a: 0, c: 0 };
  return { attempts: s.a, correct: s.c, rate: s.a ? s.c / s.a : 0 };
}
export function setCurrentLevel(n) {
  DB.level.current = n;
  if (n > DB.level.unlocked) DB.level.unlocked = n;
  save();
}
export function completePlacement(startLevel) {
  DB.level.placed = true;
  DB.level.current = startLevel;
  DB.level.unlocked = Math.max(DB.level.unlocked, startLevel);
  save();
}
export function promote() {
  const next = Math.min(5, DB.level.current + 1);
  DB.level.unlocked = Math.max(DB.level.unlocked, next);
  DB.level.current = next;
  save();
  return next;
}

export function stats(words) {
  let learn = 0, prac = 0, mast = 0;
  for (const w of words) {
    const b = box(w.id);
    if (b >= 3) mast++;
    else if (b === 2) prac++;
    else if (b === 1) learn++;
  }
  const distinctCorrect = Object.values(DB.stat).filter((s) => s.c > 0).length;
  const passRate = DB.attempts ? Math.round((DB.correct / DB.attempts) * 100) : 0;
  return { learn, prac, mast, total: words.length, currentLevel: DB.level.current, streak: DB.streak, distinctCorrect, passRate, attempts: DB.attempts, correct: DB.correct };
}

export function summary(words) {
  const s = stats(words);
  const mastered = words.filter((w) => box(w.id) >= 3);
  const fixed = words.filter((w) => box(w.id) >= 3 && everWrong(w.id));
  const levels = [1, 2, 3, 4, 5].map((lv) => {
    const ws = words.filter((w) => w.level === lv);
    const ls = levelStats(lv);
    return { level: lv, total: ws.length, mast: ws.filter((w) => box(w.id) >= 3).length, correct: ws.filter((w) => correctCount(w.id) > 0).length, rate: Math.round(ls.rate * 100), attempts: ls.attempts };
  });
  const catCounts = Object.keys(CATS).map((k) => {
    const ws = words.filter((w) => w.cat === k);
    return { name: CATS[k].name, color: CATS[k].color, total: ws.length, mast: ws.filter((w) => box(w.id) >= 3).length };
  });
  return { passRate: s.passRate, distinctCorrect: s.distinctCorrect, attempts: s.attempts, correct: s.correct, total: s.total, mastered, fixed, levels, catCounts, history: historyData() };
}
