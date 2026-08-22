// src/store.js - 終極防護版：內含資料清洗與空值防禦

let state = {
    level: 1,
    placed: true,
    words: {},    
    history: {},  
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
    session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 },
    levelStats: {} 
};

let listeners = [];
let unsavedChanges = false;
let syncInterval = null;

export function progress() { return state; }
export function getState() { return state; }

export function sessionState() {
    if (!state.session) {
        state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
    }
    return state.session;
}

export function stats() {
    if (!state.stats) {
        state.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    }
    return state.stats;
}

export function levelStats(lv) {
    if (!state.levelStats) state.levelStats = {};
    if (lv !== undefined && lv !== null) {
        if (!state.levelStats[lv]) {
            state.levelStats[lv] = { correct: 0, wrong: 0, total: 0 };
        }
        return state.levelStats[lv];
    }
    return state.levelStats;
}

export function box(word) {
    if (!state.words[word]) return 1;
    return state.words[word].box || 1;
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
        localStorage.setItem(`spelling_state_${username}`, JSON.stringify(state));
    } catch (err) {
        console.error("寫入 localStorage 失敗：", err);
    }
}

// 安全合併資料的輔助函式：嚴格檢查並過濾 null，保證關鍵欄位安全
function mergeStateData(target, source) {
    if (!source || typeof source !== 'object') return;
    
    if (source.level != null) target.level = source.level;
    if (source.placed !== undefined) target.placed = source.placed;
    if (source.words && typeof source.words === 'object') target.words = source.words;
    if (source.history && typeof source.history === 'object') target.history = source.history;
    
    if (source.stats && typeof source.stats === 'object') {
        target.stats = Object.assign({}, target.stats, source.stats);
    }
    if (source.session && typeof source.session === 'object') {
        target.session = Object.assign({}, target.session, source.session);
    }
    if (source.levelStats && typeof source.levelStats === 'object') {
        target.levelStats = source.levelStats;
    }

    // 絕對防線：確保核心屬性永遠有預設值，絕不為 null/undefined
    if (!target.level || isNaN(target.level)) target.level = 1;
    if (!target.session) target.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
    if (!target.stats) target.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    if (!target.levelStats) target.levelStats = {};
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
        if (localData) {
            const parsed = JSON.parse(localData);
            mergeStateData(state, parsed);
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
            mergeStateData(state, result.progress);
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
            body: JSON.stringify({ action: "save", username: username, progress: state })
        });
        unsavedChanges = false;
        console.log("進度已成功同步至 Google 試算表專屬分頁！");
    } catch (err) {
        console.error("同步至雲端失敗：", err);
    }
}

// 3. 作答處理
export function recordAnswer(word, correct, level) {
    if (!state.words[word]) {
        state.words[word] = { box: 1, correctCount: 0, wrongCount: 0 };
    }
    const w = state.words[word];
    
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
        if (!state.levelStats) state.levelStats = {};
        if (!state.levelStats[level]) state.levelStats[level] = { correct: 0, wrong: 0, total: 0 };
        state.levelStats[level].total++;
        if (correct) state.levelStats[level].correct++;
        else state.levelStats[level].wrong++;
    }

    if (state.session) {
        state.session.done = (state.session.done || 0) + 1;
        if (correct) state.session.correct = (state.session.correct || 0) + 1;
        else state.session.wrong = (state.session.wrong || 0) + 1;

        if (state.session.done > 0 && state.session.done % state.session.goal === 0) {
            console.log("已達成小節目標，正在自動同步雲端...");
            saveToCloud();
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    state.history[today] = (state.history[today] || 0) + 1;

    notify();
}

export function setLevel(lv) {
    state.level = lv;
    notify();
}

export function resetProgress() {
    if (confirm("確定要重設所有學習進度嗎？")) {
        state = {
            level: 1,
            placed: true,
            words: {},
            history: {},
            stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
            session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 },
            levelStats: {}
        };
        saveToLocalStorage();
        notify();
        saveToCloud();
    }
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
    saveToCloud
};
