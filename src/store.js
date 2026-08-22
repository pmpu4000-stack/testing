// src/store.js - 完整修復版：補齊 reset、sessionEnd 與極致防禦

let rawState = {
    level: 1,
    placed: true,
    words: {},    
    history: {},  
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
    session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 },
    levelStats: {} 
};

// 使用 Proxy 建立鐵壁防線：攔截所有屬性讀取，保證關鍵欄位永遠安全、絕不回傳 null
const state = new Proxy(rawState, {
    get(target, prop) {
        if (prop === 'level') {
            return (target.level != null && !isNaN(target.level)) ? Number(target.level) : 1;
        }
        if (prop === 'session') {
            if (!target.session || typeof target.session !== 'object') {
                target.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
            }
            return target.session;
        }
        if (prop === 'stats') {
            if (!target.stats || typeof target.stats !== 'object') {
                target.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
            }
            return target.stats;
        }
        if (prop === 'levelStats') {
            if (!target.levelStats || typeof target.levelStats !== 'object') {
                target.levelStats = {};
            }
            return target.levelStats;
        }
        if (prop === 'words') {
            if (!target.words || typeof target.words !== 'object') {
                target.words = {};
            }
            return target.words;
        }
        if (prop === 'history') {
            if (!target.history || typeof target.history !== 'object') {
                target.history = {};
            }
            return target.history;
        }
        return target[prop];
    }
});

let listeners = [];
let unsavedChanges = false;
let syncInterval = null;

export function progress() { return state; }
export function getState() { return state; }

export function sessionState() {
    return state.session;
}

export function stats() {
    return state.stats;
}

export function levelStats(lv) {
    const lvs = state.levelStats;
    if (lv !== undefined && lv !== null) {
        if (!lvs[lv]) {
            lvs[lv] = { correct: 0, wrong: 0, total: 0 };
        }
        return lvs[lv];
    }
    return lvs;
}

export function box(word) {
    const words = state.words;
    if (!words[word]) return 1;
    return words[word].box || 1;
}

export function subscribe(fn) {
    listeners.push(fn);
    fn(state);
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    for (const fn of listeners) fn(state);
    unsavedChanges = true;
    saveToLocalStorage();
}

function saveToLocalStorage() {
    const username = window.CLOUD_USERNAME;
    if (!username) return;
    try {
        localStorage.setItem(`spelling_state_${username}`, JSON.stringify(rawState));
    } catch (err) {
        console.error("寫入 localStorage 失敗：", err);
    }
}

// 資料清洗與安全合併
function mergeStateData(target, source) {
    if (!source || typeof source !== 'object') return;
    
    if (source.level != null && !isNaN(source.level)) target.level = Number(source.level);
    if (source.placed !== undefined) target.placed = source.placed;
    if (source.words && typeof source.words === 'object') target.words = source.words;
    if (source.history && typeof source.history === 'object') target.history = source.history;
    
    if (source.stats && typeof source.stats === 'object') {
        target.stats = Object.assign({ totalCorrect: 0, streak: 0, bestStreak: 0 }, source.stats);
    }
    if (source.session && typeof source.session === 'object') {
        target.session = Object.assign({ active: true, done: 0, correct: 0, wrong: 0, goal: 20 }, source.session);
    }
    if (source.levelStats && typeof source.levelStats === 'object') {
        target.levelStats = source.levelStats;
    }
}

// 1. 初始化
export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username) {
        console.warn("尚未設定雲端帳號");
        return;
    }

    // 防線 A：讀取 localStorage
    try {
        const localData = localStorage.getItem(`spelling_state_${username}`);
        if (localData && localData !== "null" && localData !== "undefined") {
            const parsed = JSON.parse(localData);
            mergeStateData(rawState, parsed);
            notify();
            console.log("已從瀏覽器 localStorage 安全載入本地快取！");
        }
    } catch (err) {
        console.error("讀取 localStorage 失敗，已重置狀態：", err);
        localStorage.removeItem(`spelling_state_${username}`);
    }

    if (!scriptUrl) return;

    // 防線 B：向雲端同步
    try {
        const response = await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "load", username: username })
        });
        const result = await response.json();
        
        if (result.status === "success" && result.progress) {
            mergeStateData(rawState, result.progress);
            saveToLocalStorage();
            unsavedChanges = false;
            notify();
            console.log("成功從雲端專屬分頁同步最新紀錄！");
        }
    } catch (err) {
        console.warn("網路不穩或雲端載入失敗，目前安心使用本地快取運行：", err);
    }

    if (!syncInterval) {
        syncInterval = setInterval(() => {
            if (unsavedChanges) {
                console.log("執行定時背景自動同步...");
                saveToCloud();
            }
        }, 3 * 60 * 1000);
    }
}

// 2. 核心雲端同步函式
export async function saveToCloud() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;
    if (!username || !scriptUrl) return;

    try {
        await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "save", username: username, progress: rawState })
        });
        unsavedChanges = false;
        console.log("進度已成功同步至 Google 試算表專屬分頁！");
    } catch (err) {
        console.error("同步至雲端失敗：", err);
    }
}

// 3. 作答處理
export function recordAnswer(word, correct, level) {
    const words = state.words;
    if (!words[word]) {
        words[word] = { box: 1, correctCount: 0, wrongCount: 0 };
    }
    const w = words[word];
    
    if (correct) {
        w.correctCount++;
        w.box = Math.min(3, w.box + 1);
        state.stats.totalCorrect++;
        state.stats.streak++;
        if (state.stats.streak > state.stats.bestStreak) {
            state.stats.bestStreak = state.stats.streak;
        }
    } else {
        w.wrongCount++;
        w.box = 1;
        state.stats.streak = 0;
    }

    if (level) {
        const lvs = state.levelStats;
        if (!lvs[level]) lvs[level] = { correct: 0, wrong: 0, total: 0 };
        lvs[level].total++;
        if (correct) lvs[level].correct++;
        else lvs[level].wrong++;
    }

    const sess = state.session;
    if (sess) {
        sess.done = (sess.done || 0) + 1;
        if (correct) sess.correct = (sess.correct || 0) + 1;
        else sess.wrong = (sess.wrong || 0) + 1;

        if (sess.done > 0 && sess.done % sess.goal === 0) {
            console.log("已達成小節目標，正在自動同步雲端...");
            saveToCloud();
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    state.history[today] = (state.history[today] || 0) + 1;

    notify();
}

export function setLevel(lv) {
    rawState.level = (lv != null && !isNaN(lv)) ? Number(lv) : 1;
    notify();
}

export function resetProgress() {
    if (confirm("確定要重設所有學習進度嗎？")) {
        rawState.level = 1;
        rawState.placed = true;
        rawState.words = {};
        rawState.history = {};
        rawState.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
        rawState.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
        rawState.levelStats = {};
        
        saveToLocalStorage();
        notify();
        saveToCloud();
    }
}

// 補齊 app.js 所需的方法
export function reset() {
    resetProgress();
}

export function sessionEnd() {
    if (state.session) {
        state.session.active = false;
    }
    notify();
    saveToCloud();
}

export default {
    initStore,
    progress,
    getState,
    sessionState,
    stats,
    levelStats,
    box,
    subscribe,
    recordAnswer,
    setLevel,
    resetProgress,
    reset,
    sessionEnd,
    saveToCloud
};
