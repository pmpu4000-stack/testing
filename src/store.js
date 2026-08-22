// src/store.js - 零死角相容、背景非同步雲端同步版

// 1. 預設狀態（確保網頁一開機、程式還沒抓到雲端前，所有欄位都安全存在）
let state = {
    level: 1,
    placed: true,
    words: {},    
    history: {},  
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 },
    session: { active: true, done: 0, correct: 0, wrong: 0, goal: 20 }
};

let listeners = [];

// 2. 核心介面函式（網頁一載入就隨時待命，絕對不會是 undefined）
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
    saveToCloud(); // 狀態改變時自動同步回雲端
}

// 3. 背景非同步載入存檔（程式先跑完，這段在背景悄悄抓資料）
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
            // 雲端資料回來了！安全地與預設狀態合併
            state = Object.assign(state, result.progress);
            if (!state.session) {
                state.session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
            }
            console.log("雲端存檔載入成功，正在更新畫面...");
            notify(); // 通知所有畫面進行重新渲染
        }
    } catch (err) {
        console.error("從雲端載入進度失敗（維持預設狀態）：", err);
    }
}

// 4. 同步至雲端
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

// 5. 答題與狀態更新
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

// 6. 雙向匯出，確保 app.js 不論怎麼引用都不會失敗
export default {
    initStore,
    progress,
    getState,
    sessionState,
    box,
    subscribe,
    recordAnswer,
    setLevel,
    resetProgress
};
