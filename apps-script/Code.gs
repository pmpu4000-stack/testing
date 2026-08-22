const SESSION_TTL_MS = 60 * 60 * 1000;
const STATE_STORAGE_KEY = "spellAgent.v2";
const SESSION_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

function doOptions() {
  return ContentService.createTextOutput("");
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userListSheet = ss.getSheetByName("使用者清單");

    if (!userListSheet) {
      return json_({
        status: "error",
        message: "找不到「使用者清單」工作表"
      });
    }

    var params = parseRequest_(e);
    var action = String(params.action || "login").trim();
    var inputUser = String(params.username || "").trim();
    var inputPass = params.password == null ? "" : String(params.password);

    if (!inputUser) {
      return json_({
        status: "error",
        message: "請輸入帳號"
      });
    }

    if (action === "login") {
      if (!inputPass) {
        return json_({
          status: "error",
          message: "請輸入帳號與密碼"
        });
      }

      if (!authenticateUser_(userListSheet, inputUser, inputPass)) {
        return json_({
          status: "error",
          message: "帳號或密碼錯誤"
        });
      }

      var userSheet = getOrCreateUserSheet_(ss, inputUser);
      var logSheet = getOrCreateLogSheet_(ss);
      var now = new Date();
      var session = createSessionToken_(inputUser);
      var savedState = loadLatestState_(userSheet);

      userSheet.appendRow([now, inputUser, "login", "登入成功"]);
      logSheet.appendRow([now, inputUser, "login", "登入成功", userSheet.getName()]);

      return json_({
        status: "success",
        message: "驗證成功",
        sheetName: userSheet.getName(),
        token: session.token,
        expiresAt: session.expiresAt,
        state: savedState
      });
    }

    var token = String(params.token || "").trim();
    var sessionUser = authenticateSession_(token, inputUser);
    if (!sessionUser) {
      return json_({
        status: "error",
        message: "登入已過期，請重新登入"
      });
    }

    if (action === "upload") {
      var userSheetUpload = getOrCreateUserSheet_(ss, sessionUser);
      var logSheetUpload = getOrCreateLogSheet_(ss);
      var nowUpload = new Date();
      var stateJson = JSON.stringify(sanitizeSyncState_(params.state));

      appendStateRow_(userSheetUpload, nowUpload, sessionUser, "upload", stateJson);
      logSheetUpload.appendRow([nowUpload, sessionUser, "upload", stateJson, userSheetUpload.getName()]);

      return json_({
        status: "success",
        message: "上傳成功"
      });
    }

    if (action === "download") {
      var userSheetDownload = getOrCreateUserSheet_(ss, sessionUser);
      return json_({
        status: "success",
        message: "下載成功",
        sheetName: userSheetDownload.getName(),
        state: loadLatestState_(userSheetDownload)
      });
    }

    return json_({
      status: "error",
      message: "不支援的操作"
    });
  } catch (error) {
    console.error(error);
    return json_({
      status: "error",
      message: "後端錯誤，請稍後再試"
    });
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents || "{}");
}

function authenticateUser_(userListSheet, username, password) {
  var data = userListSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === username && String(data[i][1]) === password) {
      return true;
    }
  }
  return false;
}

function getOrCreateUserSheet_(ss, username) {
  var sheetName = sanitizeSheetName_("user_" + username);
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["時間", "帳號", "動作", "資料"]);
  }

  return sheet;
}

function getOrCreateLogSheet_(ss) {
  var sheet = ss.getSheetByName("log");
  if (!sheet) {
    sheet = ss.insertSheet("log");
    sheet.appendRow(["時間", "帳號", "動作", "資料", "使用者分頁"]);
  }
  return sheet;
}

function appendStateRow_(sheet, now, username, action, stateJson) {
  sheet.appendRow([now, username, action, stateJson]);
}

function loadLatestState_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return {};
  }

  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][2] || "") !== "upload") continue;
    return parseStateJson_(values[i][3]);
  }

  return {};
}

function parseStateJson_(raw) {
  if (!raw) return {};

  try {
    return sanitizeSyncState_(JSON.parse(String(raw)));
  } catch (err) {
    return {};
  }
}

function sanitizeSyncState_(state) {
  var clean = {};
  if (state && Object.prototype.hasOwnProperty.call(state, STATE_STORAGE_KEY) && state[STATE_STORAGE_KEY] != null) {
    clean[STATE_STORAGE_KEY] = String(state[STATE_STORAGE_KEY]);
  }
  return clean;
}

function sanitizeSheetName_(name) {
  return String(name)
    .trim()
    .replace(/[\\\/\?\*\[\]:]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 99);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function createSessionToken_(username) {
  cleanupExpiredSessionsIfNeeded_();

  var token = Utilities.getUuid();
  var expiresAt = Date.now() + SESSION_TTL_MS;

  PropertiesService.getScriptProperties().setProperty("session:" + token, JSON.stringify({
    username: String(username || "").trim(),
    expiresAt: expiresAt
  }));

  return { token: token, expiresAt: expiresAt };
}

function authenticateSession_(token, expectedUsername) {
  var props = PropertiesService.getScriptProperties();
  var key = "session:" + String(token || "").trim();
  var raw = props.getProperty(key);
  if (!raw) return "";

  try {
    var session = JSON.parse(raw);
    if (!session.username || !session.expiresAt) {
      props.deleteProperty(key);
      return "";
    }

    if (Number(session.expiresAt) <= Date.now()) {
      props.deleteProperty(key);
      return "";
    }

    if (String(session.username).trim() !== String(expectedUsername || "").trim()) {
      return "";
    }

    return String(session.username).trim();
  } catch (err) {
    props.deleteProperty(key);
    return "";
  }
}

function cleanupExpiredSessions_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();

  Object.keys(all).forEach(function(key) {
    if (key.indexOf("session:") !== 0) return;

    try {
      var session = JSON.parse(all[key]);
      if (!session.expiresAt || Number(session.expiresAt) <= Date.now()) {
        props.deleteProperty(key);
      }
    } catch (err) {
      props.deleteProperty(key);
    }
  });
}

function cleanupExpiredSessionsIfNeeded_() {
  var props = PropertiesService.getScriptProperties();
  var lastRun = Number(props.getProperty("meta:lastSessionCleanupAt") || 0);
  if ((Date.now() - lastRun) < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  cleanupExpiredSessions_();
  props.setProperty("meta:lastSessionCleanupAt", String(Date.now()));
}
