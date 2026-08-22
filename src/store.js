// src/store.js - 雲端 Google 試算表同步與本地雙重備份版

const CLOUD_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxiWdW_Bb9nYdLTw0OKvwj7vWtKDPcLQBIEsPD0JvGLjopmYehjK0fRGY7ac0kYM1mO/exec";

// 預設狀態結構
let currentState = {
    username: localStorage.getItem("spelling_username") || "a",
    password: localStorage.getItem("spelling_password") || "a",
    level: 1,
    words: [],
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

/**
 * 登入並驗證帳號密碼
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
            currentState.username = username;
            currentState.password = password;
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
 * 取得當前狀態
 */
export function getState() {
    return currentState;
}

/**
 * 儲存狀態至本地與 Google 試算表
 */
export async function saveState(newState) {
    if (newState) {
        currentState = { ...currentState, ...newState };
    }

    // 1. 雙重保障：先存入本地 LocalStorage
    localStorage.setItem("spelling_agent_state", JSON.stringify(currentState));

    // 2. 非同步即時上傳至 Google 試算表對應欄位
    if (!CLOUD_SCRIPT_URL) return;

    try {
        await fetch(CLOUD_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "save",
                username: currentState.username,
                password: currentState.password,
                progress: currentState
            })
        });
        console.log("☁️ 答題數值與狀態已成功同步至 Google 試算表！");
    } catch (error) {
        console.error("❌ 雲端同步失敗（已保留本地緩存）:", error);
    }
}

/**
 * 從 Google 試算表載入進度
 */
export async function loadState() {
    try {
        const response = await fetch(CLOUD_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "load",
                username: currentState.username
            })
        });

        const result = await response.json();
        if (result.status === "success" && result.progress) {
            currentState = { ...currentState, ...result.progress };
            console.log("☁️ 成功從 Google 試算表載入最新數據！");
        }
    } catch (error) {
        console.error("❌ 從雲端載入失敗，使用本地數據:", error);
        const local = localStorage.getItem("spelling_agent_state");
        if (local) {
            try { currentState = { ...currentState, ...JSON.parse(local) }; } catch (e) {}
        }
    }
    return currentState;
}
