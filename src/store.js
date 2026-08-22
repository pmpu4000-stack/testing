// src/store.js - 零死角相容、背景非同步雲端同步版（含 stats 函式）

let state = {
    level: 1,
    placed: true,
    words: {},    
    history: {},  
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
    session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 }
};

let listeners = [];

export function progress() {
    return state;
}

export function getState() {
    return state;
}

export function sessionState() {
    if (!state.session) {
        state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
    }
    return state.session;
}

// 【新增】提供 app.js 呼叫的 stats() 函式
export function stats() {
    if (!state.stats) {
        state.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    }
    return state.stats;
}

export function box(word) {
    if (!state.words[word]) return 1;
    return state.words[word].box || 1;
}

export function subscribe(fn) {
    listeners.push(fn);
    fn(state);
    return () => {
        listeners = listeners.filter(l => l !== fn);
    };
}

function notify() {
    for (const fn of listeners) fn(state);
    saveToCloud();
}

export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username || !scriptUrl) {
        console.warn("尚未設定雲端帳號，使用預設狀態");
        return;
    }

    try {
        const response = await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "load", username: username })
        });
        const result = await response.json();
        
        if (result.status === "success" && result.progress) {
            state = Object.assign(state, result.progress);
            if (!state.session) {
                state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
            }
            if (!state.stats) {
                state.stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
            }
            console.log("雲端存檔載入成功，正在更新畫面...");
            notify();
        }
    } catch (err) {
        console.error("從雲端載入進度失敗：", err);
    }
}

async function saveToCloud() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;
    if (!username || !scriptUrl) return;

    try {
        await fetch(scriptUrl, {
            method: "POST",
            body: JSON.stringify({ action: "save", username: username, progress: state })
        });
    } catch (err) {
        console.error("同步至雲端失敗：", err);
    }
}

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

    if (state.session) {
        state.session.done = (state.session.done || 0) + 1;
        if (correct) {
            state.session.correct = (state.session.correct || 0) + 1;
        } else {
            state.session.wrong = (state.session.wrong || 0) + 1;
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
            session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 }
        };
        notify();
    }
}

// 預設匯出物件（包含 stats）
export default {
    initStore,
    progress,
    getState,
    sessionState,
    stats,
    box,
    subscribe,
    recordAnswer,
    setLevel,
    resetProgress
};
