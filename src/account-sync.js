import * as store from "./store.js";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxiWdW_Bb9nYdLTw0OKvwj7vWtKDPcLQBIEsPD0JvGLjopmYehjK0fRGY7ac0kYM1mO/exec";

const el = {
  loginBtn: document.getElementById("login-btn"),
  loginUser: document.getElementById("login-user"),
  loginPass: document.getElementById("login-pass"),
  loginMsg: document.getElementById("login-msg"),
  loginOverlay: document.getElementById("login-overlay"),
  uploadBtn: document.getElementById("upload-control"),
  downloadBtn: document.getElementById("download-control"),
  syncStatus: document.getElementById("sync-status"),
};

let auth = null;
let statusTimer = null;

function setStatus(message, isError = false) {
  if (!el.syncStatus) return;
  el.syncStatus.textContent = message || "";
  el.syncStatus.style.color = isError ? "#c2410c" : "#4f46e5";
  if (statusTimer) clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => {
    if (el.syncStatus.textContent === message) el.syncStatus.textContent = "";
  }, 4000);
}

function requireAuth() {
  if (auth) return true;
  setStatus("請先登入帳號後再同步紀錄。", true);
  return false;
}

function collectStorage() {
  const storage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    storage[key] = localStorage.getItem(key) || "";
  }
  return storage;
}

function restoreStorage(storageMap) {
  localStorage.clear();
  Object.entries(storageMap).forEach(([key, value]) => {
    if (typeof value === "string") localStorage.setItem(key, value);
  });
}

function applyRemoteStorage(storageMap) {
  const storage = storageMap && typeof storageMap === "object" ? storageMap : {};
  let parsed = null;
  const rawState = storage[store.STORAGE_KEY];
  if (rawState) {
    try {
      parsed = JSON.parse(rawState);
    } catch (err) {
      throw new Error("雲端紀錄格式錯誤，未覆蓋本機資料");
    }
  }

  const snapshot = collectStorage();
  try {
    restoreStorage(storage);
    store.importState(parsed);
    window.dispatchEvent(new Event("spellagent:store-reloaded"));
  } catch (err) {
    restoreStorage(snapshot);
    let localState = null;
    const rawLocalState = snapshot[store.STORAGE_KEY];
    if (rawLocalState) {
      try { localState = JSON.parse(rawLocalState); } catch { localState = null; }
    }
    store.importState(localState);
    window.dispatchEvent(new Event("spellagent:store-reloaded"));
    throw err;
  }
}

async function postToScript(payload) {
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.message || "同步失敗");
  }
  return result;
}

async function login() {
  const username = el.loginUser.value.trim();
  const password = el.loginPass.value;

  if (!username || !password) {
    el.loginMsg.textContent = "請輸入帳號與密碼";
    return;
  }

  el.loginMsg.textContent = "正在驗證中...";
  el.loginBtn.disabled = true;

  try {
    const result = await postToScript({ action: "login", username, password });
    auth = { username, sessionToken: result.sessionToken || "", sheetName: result.sheetName || "" };
    applyRemoteStorage(result.storage);
    el.loginOverlay.style.display = "none";
    el.loginMsg.textContent = "";
    setStatus(result.storage && Object.keys(result.storage).length
      ? `已載入 ${username} 的雲端紀錄`
      : `登入成功，${username} 目前沒有已儲存紀錄`);
  } catch (err) {
    console.error(err);
    auth = null;
    el.loginMsg.textContent = err.message || "連線失敗，請檢查網路或網址是否正確";
  } finally {
    el.loginBtn.disabled = false;
  }
}

async function uploadState() {
  if (!requireAuth()) return;
  setStatus("正在上傳紀錄...");
  try {
    await postToScript({
      action: "uploadState",
      username: auth.username,
      sessionToken: auth.sessionToken,
      storage: collectStorage(),
    });
    setStatus(`已上傳 ${auth.username} 的目前紀錄`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "上傳失敗", true);
  }
}

async function downloadState() {
  if (!requireAuth()) return;
  setStatus("正在下載紀錄...");
  try {
    const result = await postToScript({
      action: "downloadState",
      username: auth.username,
      sessionToken: auth.sessionToken,
    });
    applyRemoteStorage(result.storage);
    setStatus(`已下載 ${auth.username} 的雲端紀錄`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "下載失敗", true);
  }
}

el.loginBtn.addEventListener("click", login);
el.loginPass.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});
el.uploadBtn.addEventListener("click", uploadState);
el.downloadBtn.addEventListener("click", downloadState);
