// src/ui.js - 完整修復版（含 renderRound、initModes、onCheckClick 與全方位防禦）

/**
 * 渲染當前回合與關卡資訊
 * @param {Object} roundData - 回合資料物件
 */
export function renderRound(roundData) {
    if (!roundData || typeof roundData !== 'object') {
        roundData = { level: 1, number: 1, words: [], index: 0 };
    }
    if (roundData.level == null || isNaN(roundData.level)) {
        roundData.level = 1;
    }

    const levelDisplay = document.getElementById('level-display') || document.querySelector('.level-display') || document.getElementById('level');
    if (levelDisplay) {
        levelDisplay.textContent = `Level ${roundData.level}`;
    }

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
 * 初始化遊戲模式或選單切換按鈕
 * @param {Function} onModeChange - 當切換模式時的回呼函式
 */
export function initModes(onModeChange) {
    const modeButtons = document.querySelectorAll('.mode-btn, [data-mode], button[id^="mode-"]');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode || btn.id.replace('mode-', '') || btn.textContent.trim();
            modeButtons.forEach(b => b.classList.remove('active', 'selected'));
            btn.classList.add('active', 'selected');

            if (typeof onModeChange === 'function') {
                onModeChange(mode);
            }
        });
    });
}

/**
 * 處理或綁定檢查答案按鈕點擊事件（雙模態相容）
 * @param {Function|Event} arg - 可能是回呼函式或事件物件
 */
export function onCheckClick(arg) {
    const checkBtn = document.getElementById('check-btn') || document.querySelector('.check-btn') || document.getElementById('submit-btn') || document.getElementById('btn-check');

    if (typeof arg === 'function') {
        // 如果 app.js 傳入的是回呼函式，則自動幫忙綁定到畫面的檢查按鈕上
        if (checkBtn) {
            checkBtn.addEventListener('click', arg);
        }
    } else {
        // 如果被當作事件處理函式直接觸發，安全地回傳
        return true;
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
    initModes,
    onCheckClick,
    renderAll
};
