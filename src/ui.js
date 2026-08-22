// src/ui.js - 完整防禦與全功能補齊版

/**
 * 渲染當前回合與關卡資訊
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
 */
export function renderStats(stats) {
    if (!stats || typeof stats !== 'object') {
        stats = { totalCorrect: 0, streak: 0, bestStreak: 0 };
    }

    const totalCorrectEl = document.getElementById('total-correct') || document.querySelector('.total-correct');
    if (totalCorrectEl) totalCorrectEl.textContent = stats.totalCorrect ?? 0;

    const streakEl = document.getElementById('streak') || document.querySelector('.streak');
    if (streakEl) streakEl.textContent = stats.streak ?? 0;

    const bestStreakEl = document.getElementById('best-streak') || document.querySelector('.best-streak');
    if (bestStreakEl) bestStreakEl.textContent = stats.bestStreak ?? 0;
}

/**
 * 更新小節（Session）進度顯示
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
 * 初始化遊戲模式切換按鈕
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
 * 綁定檢查答案按鈕
 */
export function onCheckClick(arg) {
    const checkBtn = document.getElementById('check-btn') || document.querySelector('.check-btn') || document.getElementById('submit-btn');
    if (typeof arg === 'function' && checkBtn) {
        checkBtn.addEventListener('click', arg);
    }
    return true;
}

/**
 * 綁定偷看/提示按鈕（支援 callback 或直接事件綁定）
 */
export function onPeek(arg) {
    const peekBtn = document.getElementById('peek-btn') || document.querySelector('.peek-btn') || document.getElementById('hint-btn');
    if (typeof arg === 'function' && peekBtn) {
        peekBtn.addEventListener('click', arg);
    }
    return true;
}

/**
 * 預防 app.js 呼叫其他可能缺少的互動函式而建置的安全佔位函式
 */
export function onNext(arg) {
    const nextBtn = document.getElementById('next-btn') || document.querySelector('.next-btn');
    if (typeof arg === 'function' && nextBtn) nextBtn.addEventListener('click', arg);
    return true;
}

export function onPrev(arg) {
    return true;
}

export function showModal(modalId) {
    const modal = document.getElementById(modalId) || document.querySelector('.modal');
    if (modal) modal.style.display = 'block';
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId) || document.querySelector('.modal');
    if (modal) modal.style.display = 'none';
}

/**
 * 初始化並綁定整體 UI 畫面更新
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
    onPeek,
    onNext,
    onPrev,
    showModal,
    hideModal,
    renderAll
};
