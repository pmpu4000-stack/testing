// src/ui.js - 完整修復與鐵壁防禦版

/**
 * 渲染當前回合與關卡資訊
 * @param {Object} roundData - 回合資料物件
 */
export function renderRound(roundData) {
    // 🛡️ 鐵壁防禦：確保 roundData 絕對不會是 null 或 undefined，且 level 必定存在
    if (!roundData || typeof roundData !== 'object') {
        roundData = { level: 1, number: 1, words: [], index: 0 };
    }
    if (roundData.level == null || isNaN(roundData.level)) {
        roundData.level = 1;
    }

    // 1. 渲染等級顯示
    const levelDisplay = document.getElementById('level-display') || document.querySelector('.level-display') || document.getElementById('level');
    if (levelDisplay) {
        levelDisplay.textContent = `Level ${roundData.level}`;
    }

    // 2. 渲染當前單字或提示（若有對應 DOM 元素）
    const wordPrompt = document.getElementById('word-prompt') || document.getElementById('prompt');
    if (wordPrompt && roundData.words && roundData.words.length > 0) {
        const currentWord = roundData.words[roundData.index || 0];
        if (currentWord) {
            wordPrompt.textContent = currentWord.definition || currentWord.prompt || currentWord.word || '';
        }
    }
}

/**
 * 更新整體統計數據顯示
 * @param {Object} stats - 統計物件
 */
export function renderStats(stats) {
    if (!stats || typeof stats !== 'object') {
        stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    }

    const totalCorrectEl = document.getElementById('total-correct') || document.querySelector('.total-correct');
    if (totalCorrectEl) {
        totalCorrectEl.textContent = stats.totalCorrect ?? 0;
    }

    const streakEl = document.getElementById('streak') || document.querySelector('.streak');
    if (streakEl) {
        streakEl.textContent = stats.streak ?? 0;
    }

    const bestStreakEl = document.getElementById('best-streak') || document.querySelector('.best-streak');
    if (bestStreakEl) {
        bestStreakEl.textContent = stats.bestStreak ?? 0;
    }
}

/**
 * 更新小節（Session）進度顯示
 * @param {Object} session - 小節狀態物件
 */
export function renderSession(session) {
    if (!session || typeof session !== 'object') {
        session = { active: true, done: 0, correct: 0, wrong: 0, goal: 20 };
    }

    const sessionProgressEl = document.getElementById('session-progress') || document.querySelector('.session-progress');
    if (sessionProgressEl) {
        const done = session.done ?? 0;
        const goal = session.goal ?? 20;
        sessionProgressEl.textContent = `${done} / ${goal}`;
    }

    const accuracyEl = document.getElementById('accuracy') || document.querySelector('.accuracy');
    if (accuracyEl) {
        const done = session.done ?? 0;
        const correct = session.correct ?? 0;
        const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
        accuracyEl.textContent = `${accuracy}%`;
    }
}

/**
 * 初始化並綁定整體 UI 畫面更新
 * @param {Object} state - 完整狀態物件
 */
export function renderAll(state) {
    if (!state || typeof state !== 'object') return;

    renderRound(state);
    if (state.stats) renderStats(state.stats);
    if (state.session) renderSession(state.session);
}

export default {
    renderRound,
    renderStats,
    renderSession,
    renderAll
};
