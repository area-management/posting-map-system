/**
 * 🚩 ポスティング管理システム Pro (Client Stub)
 * このファイルのコードは「橋渡し」だけです。
 * 全ロジックはマスターライブラリ（PostingMapLib）側にあります。
 */

// ==========================================
// 1. 初期化（メニュー生成）
// ==========================================
function onOpen(e) {
  PostingMapLib.masterOnOpen(e);
}

// ==========================================
// 2. 地図ダッシュボード
// ==========================================
function openMapDashboard() {
  PostingMapLib.openMapDashboard();
}

function getMapData() {
  return PostingMapLib.getMapData();
}

// ==========================================
// 3. 集計・レポート系
// ==========================================
function aggregateTotalVolumes() {
  PostingMapLib.aggregateTotalVolumes();
}

function exportAllDataToMasterSheet() {
  PostingMapLib.exportAllDataToMasterSheet();
}

function exportToKML() {
  PostingMapLib.exportToKML();
}

function generateProfessionalReport() {
  PostingMapLib.generateProfessionalReport();
}

function createManualSheet() {
  PostingMapLib.createManualSheet();
}

// ==========================================
// 4. シート生成・書式設定
// ==========================================
function autoAll() {
  PostingMapLib.autoAll();
}

function applyGreyOutRuleToAllSheets() {
  PostingMapLib.applyGreyOutRuleToAllSheets();
}

function startGenerateAreaSheets() {
  PostingMapLib.startGenerateAreaSheets();
}

function createAddressLinks() {
  PostingMapLib.createAddressLinks();
}

function applyMapToAllSheets() {
  PostingMapLib.applyMapToAllSheets();
}

function updateGuideSheetTitle() {
  PostingMapLib.updateGuideSheetTitle();
}

// ==========================================
// 5. システム・リセット
// ==========================================
function setupTriggers() {
  PostingMapLib.setupTriggers();
}

function deleteAllAreaSheets() {
  PostingMapLib.deleteAllAreaSheets();
}

function showLicenseError() {
  PostingMapLib.showLicenseError();
}

// ==========================================
// 6. イベント・Webアプリ
// ==========================================
function onEditTrigger(e) {
  PostingMapLib.masterOnEditTrigger(e);
}

function doGet(e) {
  return PostingMapLib.doGet(e);
}
/**
 * 新デザインを別シートでテストする
 */
function testNewDashboard() {
  PostingMapLib.testNewDashboard();
}
