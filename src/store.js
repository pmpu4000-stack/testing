// src/store.js - 完整保留 V2000 遊戲架構、SRS box 支援與 Google 試算表同步

const CLOUD_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxiWdW_Bb9nYdLTw0OKvwj7vWtKDPcLQBIEsPD0JvGLjopmYehjK0fRGY7ac0kYM1mO/exec";

// 完整遊戲狀態
let state = {
    username: localStorage.getItem("spelling_username") || "a",
    password: localStorage.getItem("spelling_password") || "a",
    level: 1,
    words: [],       // 所有單字進度
    box: {},         // Leitner SRS 盒子資料
    boxes: [],       // 盒子陣列支援
    history: {},     // 答題日誌
    stats: {
        totalCorrect: 0,
        streak: 0,
        bestStreak: 0
    },
    session: {
        active: false,
        done: 0,
        correct: 0,
        wrong: 0,
        goal: 20
    },
    counts: {
        learning: 0,
        practicing: 0,
        mastered: 0
    }
};

// 匯出供 srs.js 與其他模組直接引用的變數參考
export let box = state.box;
export let boxes = state.boxes;

/**
 * 載入本地存檔
 */
export function loadProgress() {
    const saved = localStorage.getItem("spelling_agent_state");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            box = state.box || {};
            boxes = state.boxes || [];
        } catch (e) {
            console.error("解析本地存檔失敗", e);
        }
    }
    return state;
}

/**
 * 取得當前狀態
 */
export function getState() {
    return state;
}

/**
 * 儲存進度至本地，並背景同步至 Google 試算表
 */
export function saveProgress(newState) {
    if (newState) {
        state = { ...state, ...newState };
        box = state.box || box;
        boxes = state.boxes || boxes;
    }
    
    // 1. 寫入本地 LocalStorage
    localStorage.setItem("spelling_agent_state", JSON.stringify(state));

    // 2. 背景非同步同步至 Google 試算表
    syncToCloud(state);
}

/**
 * 登入驗證
 */
export async function loginUser(username, password) {
    try {
        const response = await fetch(CLOUD_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "login",
                username: username,
                password: password
            })
        });
        const result = await response.json();
        if (result.status === "success") {
            state.username = username;
            state.password = password;
            localStorage.setItem("spelling_username", username);
            localStorage.setItem("spelling_password", password);
            return true;
        }
        return false;
    } catch (error) {
        console.error("登入連線失敗:", error);
        return false;
    }
}

/**
 * 從 Google 試算表載入進度
 */
export async function loadFromCloud() {
    if (!CLOUD_SCRIPT_URL) return loadProgress();
    try {
        const response = await fetch(CLOUD_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "load",
                username: state.username || "a"
            })
        });
        const result = await response.json();
        if (result.status === "success" && result.progress) {
            state = { ...state, ...result.progress };
            box = state.box || box;
            boxes = state.boxes || boxes;
            localStorage.setItem("spelling_agent_state", JSON.stringify(state));
            console.log("☁️ 成功從 Google 試算表載入最新數據！");
        }
    } catch (error) {
        console.error("❌ 從雲端載入失敗，使用本地數據:", error);
    }
    return state;
}

/**
 * 背景同步到雲端試算表
 */
async function syncToCloud(currentState) {
    if (!CLOUD_SCRIPT_URL) return;
    try {
        await fetch(CLOUD_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "save",
                username: currentState.username || "a",
                password: currentState.password || "a",
                progress: currentState
            })
        });
        console.log("☁️ 答題數值與狀態已成功同步至 Google 試算表！");
    } catch (error) {
        console.error("❌ 雲端同步失敗（已保留本地緩存）:", error);
    }
}
