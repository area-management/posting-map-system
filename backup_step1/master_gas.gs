/**
 * ポスティング・マップ・システム Master Control (Version 1.0.0)
 * 役割: Stripe Webhook受信、ライセンス管理、ツール自動プロビジョニング
 */

const MASTER_CONFIG = {
  MASTER_SHEET_NAME: "UserDB", // スキーマ定義に基づいたシート名
  TEMPLATE_FILE_ID: "YOUR_TEMPLATE_SS_ID", // 顧客に渡す原本スプレッドシートのID
  NOTIFICATION_EMAIL: "admin@example.com", // 管理者への通知先
  LOG_SHEET_NAME: "SystemLog"
};

/**
 * ライセンス判定API (GETリクエスト)
 * 顧客シートからの「このユーザーは有効か？」という問い合わせに答える
 */
function doGet(e) {
  const email = e.parameter.email;
  const result = checkLicenseStatus(email);
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 顧客DBを検索してライセンス状態を返す
 */
function checkLicenseStatus(email) {
  if (!email) return { status: "error", message: "Email required" };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_CONFIG.MASTER_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  // 2行目から検索 (Emailは1列目/インデックス0とする)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      const status = data[i][2]; // Status
      const plan = data[i][1];   // Plan
      const expiry = data[i][6]; // ExpiryDate
      
      const isExpired = new Date(expiry) < new Date();
      
      if (status === "active" && !isExpired) {
        return { status: "active", plan: plan, expiry: expiry };
      } else {
        return { status: "inactive", message: "Subscription expired or canceled" };
      }
    }
  }
  
  return { status: "not_found", message: "User not registered" };
}

/**
 * Stripe Webhook 受信処理 (POSTリクエスト)
 */
function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const type = json.type;
    
    logEvent(type, json);

    // 決済完了イベント
    if (type === "checkout.session.completed") {
      handleCheckoutCompleted(json.data.object);
    }
    
    // サブスクキャンセル・更新イベント等もここに拡張可能
    
    return ContentService.createTextOutput(JSON.stringify({result: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    logEvent("ERROR", err.toString());
    return ContentService.createTextOutput(JSON.stringify({result: "error", message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 決済完了時の処理: 顧客DB更新 & ツール発行
 */
function handleCheckoutCompleted(session) {
  const email = session.customer_details.email;
  const stripeCustomerId = session.customer;
  const stripeSubId = session.subscription;
  
  // StripeのMetadataやLine Itemsからプランを判定（暫定でEnterprise）
  const plan = "Enterprise"; 
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_CONFIG.MASTER_SHEET_NAME);
  
  // 既存ユーザーか確認、なければ新規追加
  const data = sheet.getDataRange().getValues();
  let userRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      userRow = i + 1;
      break;
    }
  }
  
  const now = new Date();
  const expiry = new Date();
  expiry.setMonth(now.getMonth() + 1); // とりあえず1ヶ月更新
  
  if (userRow === -1) {
    // 新規顧客: 行を追加
    sheet.appendRow([
      email, 
      plan, 
      "active", 
      stripeCustomerId, 
      stripeSubId, 
      now, 
      expiry, 
      "", 
      now, 
      "Stripe自動登録"
    ]);
    
    // TODO: ここで原本テンプレートをコピーして顧客にメール送信する処理を追加
    // setupClientSheet(email);
    
  } else {
    // 既存顧客: ステータスと期限を更新
    sheet.getRange(userRow, 2).setValue(plan);
    sheet.getRange(userRow, 3).setValue("active");
    sheet.getRange(userRow, 6).setValue(now);
    sheet.getRange(userRow, 7).setValue(expiry);
  }
  
  GmailApp.sendEmail(MASTER_CONFIG.NOTIFICATION_EMAIL, 
    "【通知】新規決済・ライセンス更新完了", 
    `ユーザー: ${email}\nプラン: ${plan}\nStripeID: ${stripeCustomerId}`);
}

/**
 * システムログの記録
 */
function logEvent(type, content) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MASTER_CONFIG.LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MASTER_CONFIG.LOG_SHEET_NAME);
  
  sheet.appendRow([new Date(), type, typeof content === 'string' ? content : JSON.stringify(content)]);
}
