import { APPS_SCRIPT_URL, SESSION_STORAGE_KEY, SYNC_STORAGE_KEYS } from "./config.js";

function post(body) {
  return fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

function clearSavedSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function saveSession(session) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function getSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.username || !session.token || !session.expiresAt) {
      clearSavedSession();
      return null;
    }
    if (Number(session.expiresAt) <= Date.now()) {
      clearSavedSession();
      return null;
    }
    return session;
  } catch {
    clearSavedSession();
    return null;
  }
}

export function collectSyncState() {
  return SYNC_STORAGE_KEYS.reduce((state, key) => {
    const value = localStorage.getItem(key);
    if (value !== null) state[key] = value;
    return state;
  }, {});
}

export function applySyncState(state) {
  SYNC_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(state || {}, key) && state[key] != null) {
      localStorage.setItem(key, String(state[key]));
      return;
    }
    localStorage.removeItem(key);
  });
}

function ensureActiveSession() {
  const session = getSavedSession();
  if (!session) throw new Error("登入已過期，請重新登入");
  return session;
}

function handleSessionResult(result) {
  if (result && result.status === "error" && /重新登入|已過期/.test(result.message || "")) {
    clearSavedSession();
  }
  return result;
}

export async function login(username, password) {
  const result = handleSessionResult(await post({
    action: "login",
    username: String(username || "").trim(),
    password: password == null ? "" : String(password),
  }));

  if (result.status === "success") {
    saveSession({
      username: String(username || "").trim(),
      token: result.token,
      sheetName: result.sheetName,
      expiresAt: result.expiresAt,
    });
    applySyncState(result.state || {});
  }

  return result;
}

export async function uploadSyncState() {
  const session = ensureActiveSession();
  return handleSessionResult(await post({
    action: "upload",
    username: session.username,
    token: session.token,
    state: collectSyncState(),
  }));
}

export async function downloadSyncState() {
  const session = ensureActiveSession();
  const result = handleSessionResult(await post({
    action: "download",
    username: session.username,
    token: session.token,
  }));

  if (result.status === "success") {
    applySyncState(result.state || {});
  }

  return result;
}
