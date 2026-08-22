// src/store.js - 雙模態鐵壁防禦版：保證函式與屬性存取絕對安全

let rawState = {
    level: 1,
    placed: true,
    words: {},    
    history: {},  
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
    session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 },
    levelStats: {} 
};

function sanitizeState(obj) {
    if (!obj || typeof obj !== 'object') {
        obj = {};
    }
    if (obj.level == null || isNaN(Number(obj.level))) {
        obj.level = 1;
    } else {
        obj.level = Number(obj.level);
    }

    if (obj.placed === undefined) obj.placed = true;
    if (!obj.words || typeof obj.words !== 'object') obj.words = {};
    if (!obj.history || typeof obj.history !== 'object') obj.history = {};

    if (!obj.stats || typeof obj.stats !== 'object') {
        obj.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    } else {
        if (obj.stats.totalCorrect == null) obj.stats.totalCorrect = 0;
        if (obj.stats.streak == null) obj.stats.streak = 0;
        if (obj.stats.bestStreak == null) obj.stats.bestStreak = 0;
    }

    if (!obj.session || typeof obj.session !== 'object') {
        obj.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
    } else {
        if (obj.session.active === undefined) obj.session.active = true;
        if (obj.session.done == null) obj.session.done = 0;
        if (obj.session.correct == null) obj.session.correct = 0;
        if (obj.session.wrong == null) obj.session.wrong = 0;
        if (obj.session.goal == null) obj.session.goal = 20;
    }

    if (!obj.levelStats || typeof obj.levelStats !== 'object') {
        obj.levelStats = {};
    }

    return obj;
}

sanitizeState(rawState);

const state = new Proxy(rawState, {
    get(target, prop) {
        sanitizeState(target);
        if (prop === 'level') return target.level;
        if (prop === 'session') return target.session;
        if (prop === 'stats') return target.stats;
        if (prop === 'levelStats') return target.levelStats;
        if (prop === 'words') return target.words;
        if (prop === 'history') return target.history;
        if (prop === 'then') return undefined; // 避免 Promise 誤判
        return target[prop];
    }
});

let listeners = [];
let unsavedChanges = false;
let syncInterval = null;

export function progress() { return state; }
export function getState() { return state; }

export function sessionState() {
    sanitizeState(state);
    return state.session;
}

export function stats() {
    sanitizeState(state);
    return state.stats;
}

export function levelStats(lv) {
    sanitizeState(state);
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
    sanitizeState(state);
    const words = state.words;
    if (!words[word]) return 1;
    return words[word].box || 1;
}

// 建立「既可當函式呼叫、又可當物件讀取屬性（如 .level）」的強固存取器
function createRobustAccessor(getterFn) {
    const fn = function() {
        return getterFn();
    };
    Object.defineProperties(fn, {
        level: {
            get() {
                const obj = getterFn();
                return obj && obj.level != null ? obj.level : 1;
            },
            configurable: true
        },
        number: {
            get() {
                const obj = getterFn();
                return obj && obj.number != null ? obj.number : 1;
            },
            configurable: true
        },
        words: {
            get() {
                const obj = getterFn();
                return obj && obj.words ? obj.words : [];
            },
            configurable: true
        }
    });
    return fn;
}

const roundGetter = () => {
    sanitizeState(rawState);
    return {
        level: rawState.level,
        number: rawState.level,
        words: [],
        index: 0,
        ...rawState
    };
};

export const round = createRobustAccessor(roundGetter);
export const currentRound = createRobustAccessor(roundGetter);
export const getRound = createRobustAccessor(roundGetter);

export function getCurrentLevel() {
    sanitizeState(rawState);
    return rawState.level;
}
export function getLevel() { return getCurrentLevel(); }
export function level() { return getCurrentLevel(); }

export function subscribe(fn) {
    listeners.push(fn);
    try {
        fn(state);
    } catch (e) {
        console.error("Subscribe error:", e);
    }
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    sanitizeState(rawState);
    for (const fn of listeners) {
        try {
            fn(state);
        } catch (e) {
            console.error("Listener error:", e);
        }
    }
    unsavedChanges = true;
    saveToLocalStorage();
}

function saveToLocalStorage() {
    const username = window.CLOUD_USERNAME;
    if (!username) return;
    try {
        sanitizeState(rawState);
        localStorage.setItem(`spelling_state_${username}`, JSON.stringify(rawState));
    } catch (err) {
        console.error("寫入 localStorage 失敗：", err);
    }
}

export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username) {
        console.warn("尚未設定雲端帳號");
        return;
    }

    try {
        const localData = localStorage.getItem(`spelling_state_${username}`);
        if (localData && localData !== "null" && localData !== "undefined") {
            const parsed = JSON.parse(localData);
            if (parsed && typeof parsed === 'object') {
                Object.assign(rawState, sanitizeState(parsed));
                notify();
                console.log("已從瀏覽器 localStorage 安全載入並清洗本地快取！");
            } else {
                localStorage.removeItem(`spelling_state_${username}`);
            }
        }
    } catch (err) {
        console.error("讀取 localStorage 失敗，已自動清除壞掉的快取：", err);
        localStorage.removeItem(`spelling_state_${username}`);
    }

    if (!scriptUrl) return;

    try {
        const response = await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "load", username: username })
        });
        const result = await response.json();
        
        if (result.status === "success" && result.progress) {
            Object.assign(rawState, sanitizeState(result.progress));
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

export async function saveToCloud() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;
    if (!username || !scriptUrl) return;

    try {
        sanitizeState(rawState);
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

export function recordAnswer(word, correct, levelNum) {
    sanitizeState(state);
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

    const lv = levelNum || state.level;
    if (lv) {
        const lvs = state.levelStats;
        if (!lvs[lv]) lvs[lv] = { correct: 0, wrong: 0, total: 0 };
        lvs[lv].total++;
        if (correct) lvs[lv].correct++;
        else lvs[lv].wrong++;
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

export function reset() {
    resetProgress();
}

export function sessionEnd() {
    sanitizeState(state);
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
    getRound,
    round,
    currentRound,
    getCurrentLevel,
    getLevel,
    level,
    subscribe,
    recordAnswer,
    setLevel,
    resetProgress,
    reset,
    sessionEnd,
    saveToCloud
};
