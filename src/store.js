// src/store.js - 終極穩定版：本地優先 + localStorage 雙重保險 + 定時背景同步

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
let unsavedChanges = false; // 追蹤是否有尚未同步至雲端的變更
let syncInterval = null;    // 定時背景同步計時器

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
    saveToLocalStorage(); // 每次狀態改變，立即寫入瀏覽器本地快取
}

// 內部工具：將當前狀態寫入 localStorage
function saveToLocalStorage() {
    const username = window.CLOUD_USERNAME;
    if (!username) return;
    try {
        localStorage.setItem(`spelling_state_${username}`, JSON.stringify(state));
    } catch (err) {
        console.error("寫入 localStorage 失敗：", err);
    }
}

// 1. 初始化：優先從 localStorage 秒開，再向雲端更新
export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username) {
        console.warn("尚未設定雲端帳號");
        return;
    }

    // 防線 A：優先讀取瀏覽器本地快取（秒開、零網路延遲）
    try {
        const localData = localStorage.getItem(`spelling_state_${username}`);
        if (localData) {
            const parsed = JSON.parse(localData);
            state = Object.assign(state, parsed);
            if (!state.session) state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
            if (!state.stats) state.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
            if (!state.levelStats) state.levelStats = {};
            notify();
            console.log("已從瀏覽器 localStorage 快速載入本地快取！");
        }
    } catch (err) {
        console.error("讀取 localStorage 失敗：", err);
    }

    if (!scriptUrl) return;

    // 防線 B：在背景向雲端專屬分頁請求最新進度
    try {
        const response = await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "load", username: username })
        });
        const result = await response.json();
        
        if (result.status === "success" && result.progress) {
            state = Object.assign(state, result.progress);
            if (!state.session) state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
            if (!state.stats) state.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
            if (!state.levelStats) state.levelStats = {};
            saveToLocalStorage(); // 更新本地快取
            unsavedChanges = false;
            notify();
            console.log("成功從雲端專屬分頁同步最新紀錄！");
        }
    } catch (err) {
        console.warn("網路不穩或雲端載入失敗，目前安心使用本地快取運行：", err);
    }

    // 啟動定時背景同步機制：每 3 分鐘自動檢查一次，若有未存檔變更則自動推送到雲端
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            if (unsavedChanges) {
                console.log("執行定時背景自動同步...");
                saveToCloud();
            }
        }, 3 * 60 * 1000); // 3 分鐘
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
        console.error("同步至雲端失敗（將於下次自動重試）：", err);
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

        // 每完成一個小節（20題倍數）自動同步至雲端分頁
        if (state.session.done > 0 && state.session.done % state.session.goal === 0) {
            console.log("已達成小節目標，正在自動同步雲端...");
            saveToCloud();
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    state.history[today] = (state.history[today] || 0) + 1;

    notify(); // 自動觸發畫面更新與 localStorage 備份
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
