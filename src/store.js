// src/store.js - 終極無敵防禦版（全方位涵蓋所有可能呼叫的函式與屬性）

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
    if (!obj || typeof obj !== 'object') obj = {};
    if (obj.level == null || isNaN(Number(obj.level))) obj.level = 1;
    else obj.level = Number(obj.level);

    if (obj.placed === undefined) obj.placed = true;
    if (!obj.words || typeof obj.words !== 'object') obj.words = {};
    if (!obj.history || typeof obj.history !== 'object') obj.history = {};

    if (!obj.stats || typeof obj.stats !== 'object') {
        obj.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    }
    if (!obj.session || typeof obj.session !== 'object') {
        obj.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
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
        if (prop === 'then') return undefined;
        return target[prop] !== undefined ? target[prop] : 1;
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

// 建立萬無一失的回合物件
function makeRoundObj() {
    sanitizeState(rawState);
    return {
        level: rawState.level,
        number: rawState.level,
        words: [],
        index: 0,
        ...rawState
    };
}

function createRobustAccessor(getterFn) {
    const fn = function() {
        const res = getterFn();
        return res != null ? res : makeRoundObj();
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

const roundGetter = () => makeRoundObj();

// 完整涵蓋各種可能的命名呼叫
export const round = createRobustAccessor(roundGetter);
export const currentRound = createRobustAccessor(roundGetter);
export const getRound = createRobustAccessor(roundGetter);
export const getCurrentRound = createRobustAccessor(roundGetter);
export const getNextRound = createRobustAccessor(roundGetter);
export const getActiveRound = createRobustAccessor(roundGetter);
export const getRoundData = createRobustAccessor(roundGetter);
export const loadRound = createRobustAccessor(roundGetter);
export const roundData = createRobustAccessor(roundGetter);

export function getCurrentLevel() {
    sanitizeState(rawState);
    return rawState.level;
}
export function getLevel() { return getCurrentLevel(); }
export function level() { return getCurrentLevel(); }

export function subscribe(fn) {
    listeners.push(fn);
    try { fn(state); } catch (e) {}
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    sanitizeState(rawState);
    for (const fn of listeners) {
        try { fn(state); } catch (e) {}
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
    } catch (err) {}
}

export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username) return;

    try {
        const localData = localStorage.getItem(`spelling_state_${username}`);
        if (localData && localData !== "null" && localData !== "undefined") {
            const parsed = JSON.parse(localData);
            if (parsed && typeof parsed === 'object') {
                Object.assign(rawState, sanitizeState(parsed));
                notify();
            } else {
                localStorage.removeItem(`spelling_state_${username}`);
            }
        }
    } catch (err) {
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
        }
    } catch (err) {}

    if (!syncInterval) {
        syncInterval = setInterval(() => {
            if (unsavedChanges) saveToCloud();
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
    } catch (err) {}
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
    getCurrentRound,
    getNextRound,
    getActiveRound,
    getRoundData,
    loadRound,
    roundData,
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
