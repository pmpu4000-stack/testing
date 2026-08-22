var LOGIN_SHEET_NAME = "使用者清單";
var REGISTRY_SHEET_NAME = "_帳號同步";
var USER_SHEET_PREFIX = "user_";
var SESSION_TTL_SECONDS = 21600;

function doPost(e) {
  try {
    var request = parseRequest_(e);
    var action = request.action || inferAction_(request);

    if (action === "login") return handleLogin_(request);
    if (action === "uploadState") return handleUploadState_(request);
    if (action === "downloadState") return handleDownloadState_(request);

    return jsonResponse_({ status: "error", message: "不支援的操作" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: err.message || String(err) });
  }
}

function inferAction_(request) {
  if (request.storage) return "uploadState";
  if (request.username && request.password) return "login";
  return "";
}

function handleLogin_(request) {
  var auth = authenticateUser_(request.username, request.password);
  var sheet = getOrCreateUserSheet_(auth.username);
  return jsonResponse_({
    status: "success",
    message: "登入成功",
    username: auth.username,
    sheetName: sheet.getName(),
    sessionToken: createSessionToken_(auth.username),
    storage: readUserStorage_(sheet),
  });
}

function handleUploadState_(request) {
  var auth = authorizeRequest_(request);
  var sheet = getOrCreateUserSheet_(auth.username);
  writeUserStorage_(sheet, auth.username, request.storage);
  return jsonResponse_({
    status: "success",
    message: "上傳成功",
    username: auth.username,
    sheetName: sheet.getName(),
  });
}

function handleDownloadState_(request) {
  var auth = authorizeRequest_(request);
  var sheet = getOrCreateUserSheet_(auth.username);
  return jsonResponse_({
    status: "success",
    message: "下載成功",
    username: auth.username,
    sheetName: sheet.getName(),
    storage: readUserStorage_(sheet),
  });
}

function authenticateUser_(username, password) {
  var user = String(username || "").trim();
  var pass = password == null ? "" : String(password);
  if (!user || !pass) throw new Error("請輸入帳號與密碼");

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGIN_SHEET_NAME);
  if (!sheet) throw new Error("找不到使用者清單工作表");

  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) throw new Error("使用者清單是空的");

  var columns = findCredentialColumns_(values[0]);
  var startRow = columns.header ? 1 : 0;
  for (var i = startRow; i < values.length; i++) {
    var row = values[i];
    if (String(row[columns.user] || "").trim() === user && String(row[columns.pass] || "").trim() === pass) {
      return { username: user };
    }
  }
  throw new Error("帳號或密碼錯誤");
}

function authorizeRequest_(request) {
  if (!request || !request.sessionToken) throw new Error("登入已逾時，請重新登入");
  return authenticateSession_(request.sessionToken, request.username);
}

function createSessionToken_(username) {
  var user = String(username || "").trim();
  var token = Utilities.getUuid();
  cleanupExpiredSessions_();
  PropertiesService.getScriptProperties().setProperty("session:" + token, JSON.stringify({
    username: user,
    expiresAt: Date.now() + (SESSION_TTL_SECONDS * 1000),
  }));
  return token;
}

function cleanupExpiredSessions_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf("session:") !== 0) return;
    try {
      var session = JSON.parse(all[key]);
      if (!session.expiresAt || Number(session.expiresAt) < Date.now()) props.deleteProperty(key);
    } catch (err) {
      props.deleteProperty(key);
    }
  });
}

function authenticateSession_(token, expectedUsername) {
  var key = "session:" + String(token || "").trim();
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) throw new Error("登入已逾時，請重新登入");

  var session = JSON.parse(raw);
  if (!session.expiresAt || Number(session.expiresAt) < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    throw new Error("登入已逾時，請重新登入");
  }
  var username = String(session.username || "").trim();
  var expected = String(expectedUsername || "").trim();
  if (expected && expected !== username) throw new Error("登入資訊不符");
  return { username: username };
}

function findCredentialColumns_(headerRow) {
  var userAliases = ["帳號", "使用者", "使用者名稱", "username", "user", "account"];
  var passAliases = ["密碼", "password", "pass", "pwd"];
  var userIdx = findHeaderIndex_(headerRow, userAliases);
  var passIdx = findHeaderIndex_(headerRow, passAliases);
  if (userIdx !== -1 && passIdx !== -1) return { header: true, user: userIdx, pass: passIdx };
  return { header: false, user: 0, pass: 1 };
}

function findHeaderIndex_(row, aliases) {
  for (var i = 0; i < row.length; i++) {
    var value = String(row[i] || "").trim().toLowerCase();
    if (!value) continue;
    for (var j = 0; j < aliases.length; j++) {
      if (value === aliases[j].toLowerCase()) return i;
    }
  }
  return -1;
}

function getOrCreateUserSheet_(username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registry = getOrCreateRegistrySheet_(ss);
  var user = String(username || "").trim();
  var entries = registry.getDataRange().getDisplayValues();

  for (var i = 1; i < entries.length; i++) {
    if (String(entries[i][0] || "").trim() !== user) continue;
    var existingName = String(entries[i][1] || "").trim();
    var existingSheet = existingName ? ss.getSheetByName(existingName) : null;
    if (existingSheet) return existingSheet;

    var recreated = createUserSheet_(ss, user);
    registry.getRange(i + 1, 2).setValue(recreated.getName());
    return recreated;
  }

  var created = createUserSheet_(ss, user);
  registry.appendRow([user, created.getName(), new Date()]);
  return created;
}

function getOrCreateRegistrySheet_(ss) {
  var sheet = ss.getSheetByName(REGISTRY_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(REGISTRY_SHEET_NAME);
  sheet.hideSheet();
  sheet.appendRow(["username", "sheetName", "createdAt"]);
  return sheet;
}

function createUserSheet_(ss, username) {
  var baseName = USER_SHEET_PREFIX + sanitizeSheetName_(username);
  var sheetName = uniqueSheetName_(ss, baseName);
  var sheet = ss.insertSheet(sheetName);
  writeUserStorage_(sheet, username, {});
  return sheet;
}

function sanitizeSheetName_(username) {
  var name = String(username || "")
    .replace(/[\[\]\*\/\\\?\:]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^'+|'+$/g, "")
    .trim();
  if (!name) name = "account";
  return name.substring(0, 90);
}

function uniqueSheetName_(ss, baseName) {
  var name = baseName || "user_account";
  var attempt = name.substring(0, 100);
  var n = 1;
  while (ss.getSheetByName(attempt)) {
    var suffix = "_" + n++;
    attempt = name.substring(0, Math.max(1, 100 - suffix.length)) + suffix;
  }
  return attempt;
}

function writeUserStorage_(sheet, username, storage) {
  var normalized = storage && typeof storage === "object" ? storage : {};
  var keys = Object.keys(normalized).sort();
  var rows = [
    ["account", String(username || "").trim()],
    ["updatedAt", new Date().toISOString()],
    ["", ""],
    ["key", "value"],
  ];

  keys.forEach(function (key) {
    rows.push([key, String(normalized[key] != null ? normalized[key] : "")]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

function readUserStorage_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 5) return {};

  var values = sheet.getRange(5, 1, lastRow - 4, 2).getDisplayValues();
  var storage = {};
  values.forEach(function (row) {
    var key = String(row[0] || "").trim();
    if (!key) return;
    storage[key] = row[1] || "";
  });
  return storage;
}

function parseRequest_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(raw);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
