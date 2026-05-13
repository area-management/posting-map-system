/**
 * GAS v2 - API専用エンジン
 */

// =============================
// ⓪ 基本設定
// =============================
const SPREADSHEET_ID = '1KuA5pN0ItODhwSJph-fwgj_U_ZyHrn9Osew92D99xBs';

function getSS() {
  if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not defined.");
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// =============================
// ① APIエントリポイント
// =============================

// GETリクエスト：データの取得
function doGet(e) {
  const action = e.parameter.action;
  let response;

  try {
    switch (action) {
      case 'getAppData':
        response = getAppData();
        break;
      case 'getAreaDetails':
        response = getAreaDetails(e.parameter.areaName);
        break;
      case 'getRoster':
        response = getRoster();
        break;
      default:
        response = { success: false, message: 'Invalid GET action: ' + action };
    }
  } catch (err) {
    response = { success: false, message: err.toString() };
  }

  return createJsonResponse(response);
}

// POSTリクエスト：データの登録・更新
function doPost(e) {
  let postData;
  try {
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else if (e.parameter.json) {
      postData = JSON.parse(e.parameter.json);
    } else {
      postData = e.parameter;
    }
  } catch (f) {
    postData = e.parameter;
  }

  const action = postData.action || e.parameter.action;
  let response;

  try {
    switch (action) {
      case 'submitDistribution':
        response = submitDistribution(
          postData.areaName,
          postData.rowId,
          postData.staffName,
          postData.count,
          postData.isDone,
          postData.staffId
        );
        break;
      case 'registerStaff':
        response = registerStaff(postData.lastName, postData.firstName);
        break;
      default:
        response = { success: false, message: 'Invalid POST action: ' + action };
    }
  } catch (err) {
    response = { success: false, message: err.toString() };
  }

  return createJsonResponse(response);
}

// 共通：JSONレスポンス作成
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================
// ② データ取得ロジック
// =============================

/**
 * モバイルアプリ用：全体サマリー取得
 * 超高速版：全体進捗シートのみを参照
 */
function getAppData() {
  const ss = getSS();
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("app_summary");
  if (cachedData) return JSON.parse(cachedData);
  
  const guideSheet = ss.getSheetByName(CONFIG.SHEET_GUIDE);
  if (!guideSheet) throw new Error("Guide sheet not found");

  // A列:エリア名, G列:進捗% (1行目ヘッダーを飛ばす)
  // 全データを一括取得 (通信はこれ1回だけ！)
  const lastRow = guideSheet.getLastRow();
  if (lastRow < 2) return { branchName: "支部", areas: [] };
  
  const values = guideSheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const totalDistributed = guideSheet.getRange("H5").getValue();

  const areas = values
    .filter(r => r[0] && r[0] !== "")
    .map(r => ({
      name: r[0],
      progress: Math.round(parseFloat(r[6]) * 100) || 0,
      count: 0
    }));

  const roster = getRoster();

  const response = {
    branchName: ss.getName().split(/[ 　]/)[0] || "支部",
    totalDistributed: totalDistributed,
    targetGoal: CONFIG.TARGET_GOAL,
    areas: areas,
    staffList: roster,
  };
  
  cache.put("app_summary", JSON.stringify(response), 30);
  return response;
}

/**
 * エリア詳細情報の取得
 */
function getAreaDetails(areaName) {
  const s = getSS().getSheetByName(areaName);
  if (!s) return { success: false, message: "Area not found" };

  const lastRow = s.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };

  const values = s.getRange(2, 1, lastRow - 1, 6).getValues();
  const data = values.map((r, i) => ({
    id: i + 2,
    town: r[0],
    street: r[1],
    houseCount: r[2],
    isDone: r[3],
    staffName: r[4],
    timestamp: r[5]
  }));

  return { success: true, data: data };
}

/**
 * 名簿の取得
 */
function getRoster() {
  const s = getSS().getSheetByName(CONFIG.SHEET_ROSTER);
  if (!s) return [];
  const lastRow = s.getLastRow();
  if (lastRow < 2) return [];
  return s.getRange(2, 1, lastRow - 1, 2).getValues().map(r => ({ id: r[0], name: r[1] }));
}

/**
 * 進捗報告の登録
 */
function submitDistribution(areaName, rowId, staffName, count, isDone, staffId) {
  const ss = getSS();
  const s = ss.getSheetByName(areaName);
  if (!s) return { success: false, message: "Sheet not found: " + areaName };

  const now = new Date();
  s.getRange(rowId, 4, 1, 3).setValues([[isDone, staffName, now]]);
  
  // ログ記録
  const reportSheet = ss.getSheetByName(CONFIG.SHEET_REPORT);
  if (reportSheet) {
    reportSheet.appendRow([now, areaName, rowId, staffName, count, isDone, staffId]);
  }

  return { success: true };
}

/**
 * 配布員の新規登録
 */
function registerStaff(lastName, firstName) {
  const ss = getSS();
  const s = ss.getSheetByName(CONFIG.SHEET_ROSTER);
  if (!s) return { success: false, message: "Roster sheet not found" };

  const name = lastName + " " + firstName;
  const lastRow = s.getLastRow();
  
  // 重複チェック
  const existing = s.getRange(2, 2, lastRow > 1 ? lastRow - 1 : 1, 1).getValues();
  const rowIndex = existing.findIndex(r => r[0] === name);
  if (rowIndex !== -1) {
    return { success: true, id: s.getRange(rowIndex + 2, 1).getValue(), name: name };
  }

  const newId = "S" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  s.appendRow([newId, name, new Date()]);
  
  return { success: true, id: newId, name: name };
}

// =============================
// ③ 管理者用・ユーティリティ (Restored & Modernized)
// =============================

/**
 * モバイルアプリのURLをモダンなダイアログで表示
 */
function showAppUrl() {
  const url = ScriptApp.getService().getUrl();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
      <style>body { font-family: 'Inter', sans-serif; }</style>
    </head>
    <body class="bg-[#f5f5f7] p-6 text-[#1d1d1f]">
      <div class="bg-white rounded-[2rem] p-8 shadow-sm ring-1 ring-black/[0.02]">
        <div class="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Access Portal</div>
        <h2 class="text-xl font-black text-[#1a237e] tracking-tight mb-6">モバイルアプリ URL</h2>
        
        <div class="space-y-4">
          <div class="bg-apple p-4 rounded-2xl border-2 border-transparent focus-within:border-[#1a237e] transition-all">
            <input type="text" value="${url}" readonly onclick="this.select()" 
                   class="w-full bg-transparent border-none outline-none text-xs font-bold text-gray-500">
          </div>
          <a href="${url}" target="_blank" 
             class="block w-full bg-[#1a237e] text-white text-center py-4 rounded-2xl font-black shadow-lg shadow-navy/20 active:scale-[0.98] transition-all">
            アプリを起動
          </a>
        </div>
      </div>
    </body>
    </html>
  `;
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(450).setHeight(300),
    "Application Access"
  );
}

/**
 * 戦況マップダッシュボードを表示
 */
function openMapDashboard() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    SpreadsheetApp.getUi().alert("⚠️ APIキー (GOOGLE_MAPS_API_KEY) がプロパティに設定されていません。");
    return;
  }
  const html = HtmlService.createTemplateFromFile("scripts/map_dashboard");
  html.apiKey = apiKey;
  SpreadsheetApp.getUi().showModalDialog(
    html.evaluate().setWidth(1200).setHeight(800),
    "Strategy Command Center"
  );
}

/**
 * 全体数と個人ランキングを再集計（進捗シート更新）
 */
function aggregateTotalVolumes() {
  const ss = getSS();
  const guideSheet = ss.getSheetByName(CONFIG.SHEET_GUIDE);
  const exclude = [
    CONFIG.SHEET_GUIDE, CONFIG.SHEET_ROSTER, CONFIG.SHEET_TEMPLATE,
    CONFIG.SHEET_POSTAL, CONFIG.SHEET_DISTRICT, CONFIG.SHEET_MASTER_EXPORT,
    CONFIG.SHEET_REPORT, CONFIG.SHEET_MANUAL, CONFIG.SHEET_SYSTEM_CACHE
  ];

  let totalUnitsDone = 0;
  let grandTotalVolume = 0;
  let staffRanking = {}; 

  const sheets = ss.getSheets();
  sheets.forEach((sheet) => {
    const name = sheet.getName();
    if (!exclude.includes(name) && !sheet.isSheetHidden()) {
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const data = sheet.getRange(2, 4, lastRow - 1, 4).getValues();
        data.forEach((row) => {
          const isDone = row[0] === true;
          const count = parseFloat(row[2]) || 0;
          const staff = row[3];
          if (isDone) {
            totalUnitsDone++;
            grandTotalVolume += count;
            if (staff) staffRanking[staff] = (staffRanking[staff] || 0) + count;
          }
        });
      }
    }
  });

  if (guideSheet) {
    const progressPercent = (totalUnitsDone / CONFIG.DENOMINATOR_UNITS) * 100;
    guideSheet.getRange("H5").setValue(`全体進捗: ${progressPercent.toFixed(1)}%`);
    guideSheet.getRange("H6").setValue(`総配布枚数: ${grandTotalVolume.toLocaleString()} 枚`);

    const sortedRanking = Object.entries(staffRanking)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    guideSheet.getRange("M10:O20").clearContent();
    sortedRanking.forEach((entry, index) => {
      const row = 10 + index;
      guideSheet.getRange(row, 13).setValue(`${index + 1}位`);
      guideSheet.getRange(row, 14).setValue(entry[0]);
      guideSheet.getRange(row, 15).setValue(`${entry[1].toLocaleString()} 枚`);
    });
    ss.toast(`集計完了: ${progressPercent.toFixed(1)}%`, "📊 UPDATE COMPLETE");
  }
}

/**
 * 管理者権限チェック
 */
function isNotAdmin() {
  const user = Session.getActiveUser().getEmail();
  const owner = SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
  if (user !== owner) {
    SpreadsheetApp.getUi().alert("❌ 管理者専用です。");
    return true;
  }
  return false;
}
