/**
 * GAS v2（最強安定・統合版） - 設定モジュール
 * - 全体の動作パラメータ管理
 */

// ==========================================
// GLOBAL CONFIGURATION (gas.gs 準拠)
// ==========================================
const CONFIG = {
  VERSION: "2.2.0 (Mobile & Pro Integrated)",
  // ファイル名設定
  DISTRICT_CSV: "三重県選挙区区割り",
  POSTAL_CSV: "MIE_POSTAL.CSV",
  TURNOUT_CSV: "voter_turnout.csv",
  TARGET_GOAL: 300000, // 目標配布枚数（ダッシュボード用）

  // シート名設定
  SHEET_GUIDE: "初めての方「使い方ガイド」",
  SHEET_ROSTER: "名簿",
  SHEET_TEMPLATE: "原本",
  SHEET_POSTAL: "郵便番号",
  SHEET_DISTRICT: "区割り",
  SHEET_MASTER_EXPORT: "📥 集計用マスターデータ",
  SHEET_REPORT: "📄 活動報告書",
  SHEET_MANUAL: "📖 らくらくマニュアル",
  SHEET_SYSTEM_CACHE: "__SYSTEM_CACHE__", // 高速集計用シャドウシート

  // 動作設定
  CHUNK_SIZE: 10,
  ROW_HEIGHT_STAFF: 60,
  DENOMINATOR_UNITS: 651, // 三重第2区の戦略ユニット総数

  // デフォルト対象
  DEFAULT_DISTRICT: "第2区",
  DEFAULT_PREFECTURE: "三重県",
};
