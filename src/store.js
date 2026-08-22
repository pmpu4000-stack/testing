// src/store.js - 雲端同步與狀態管理（含 srs.js 所需的 box 匯出）

let state = {
    level: 1,
    words: {}, // word -> { box, correctCount, wrongCount, lastPracticed }
    history: {}, // 'YYYY-MM-DD' -> count
    stats: { totalCorrect: 0, streak: 0, bestStreak: 0 }
};

let listeners = [];

// 初始化：從 Google 雲端載入該使用者的資料
export async function initStore() {
    const username = window.CLOUD_USERNAME;
    const scriptUrl = window.CLOUD_SCRIPT_URL;

    if (!username || !scriptUrl) {
        console.error("未找到登入的使用者資訊");
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
        }
    } catch (err) {
        console.error("從雲端載入進度失敗：", err);
    }
    notify();
}

// 儲存至雲端
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

export function getState() {
    return state;
}

// 【關鍵修復】提供 srs.js 讀取單字箱號的匯出函式
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
    saveToCloud(); // 每次狀態變動即時觸發雲端儲存
}

// 更新單字進度與答題數據
export function recordAnswer(word, correct, level) {
    if (!state.words[word]) {
        state.words[word] = { box: 1, correctCount: 0, wrongCount: 0 };
    }
    const w = state.words[word];
    
    if (correct) {
        w.correctCount++;
        w.box = Math.min(3, w.box + 1); // 最多到 3 (精通)
        state.stats.totalCorrect++;
        state.stats.streak++;
        if (state.stats.streak > state.stats.bestStreak) {
            state.stats.bestStreak = state.stats.streak;
        }
    } else {
        w.wrongCount++;
        w.box = 1; // 答錯退回學習中
        state.stats.streak = 0;
    }

    // 記錄今日歷史
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
            words: {},
            history: {},
            stats: { totalCorrect: 0, streak: 0, bestStreak: 0 }
        };
        notify();
    }
}
