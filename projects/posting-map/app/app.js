const $ = id => document.getElementById(id);

// デバッグログ出力関数 (本番用: コンソールのみ出力)
window.logDebug = function(msg) {
  console.log("[DEBUG]", msg);
};
window.onerror = function(message, source, lineno, colno, error) {
  if (message === "Script error.") return false;
  logDebug(`ERROR: ${message} at ${source}:${lineno}:${colno}`);
  return false;
};
window.onunhandledrejection = function(event) {
  logDebug(`UNHANDLED PROMISE: ${event.reason}`);
};

let allPoints = [], areaSummary = [], roster = [], rankingData = [];
let _appDataPromise = null; // ⑤ getAppData並列プリフェッチ用
let _rankingFetched = false;  // ランキング遅延取得済みフラグ
let _stockFetched = false;    // 在庫一覧取得済みフラグ
let _stockData = [];          // 在庫一覧キャッシュデータ
let currentCity = null;
let lastAreaSubPage = 'areas'; // 直前のエリアサブページ ('areas' または 'detail') を記憶
let scrollPositions = { areas: 0, detail: 0, settings: 0, ranking: 0 };
window.cityAreaCache = {};
window.activeCityDetailsPromise = null;
window.currentCityDetailsName = null;
window.activeRankingPromise = null;

// ─── ローディングプログレスバー更新 ──────────────────────────────
function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-status');
  if (bar) bar.style.width = pct + '%';
  if (txt) {
    txt.style.opacity = '0';
    setTimeout(() => { txt.textContent = label; txt.style.opacity = '1'; }, 180);
  }
}

const pageIdMap = {
  'page-areas': 'areas',
  'page-detail': 'detail',
  'page-settings': 'settings',
  'page-ranking': 'ranking',
  'page-storage-register': 'storage-register',
  'page-storage-list': 'storage-list'
};

// プレミアム・インタラクション・スキル (JS Touch Handler)
document.addEventListener('touchstart', e => {
  const el = e.target.closest('.btn-neu, .clickable-card, .nav-btn');
  if (!el) return;
  if (el.classList.contains('btn-neu')) el.classList.add('pressed-primary');
  if (el.classList.contains('clickable-card')) el.classList.add('pressed-secondary');
  if (el.classList.contains('nav-btn')) el.classList.add('pressed-nav');
}, {passive: true});

document.addEventListener('touchend', removePressed);
document.addEventListener('touchcancel', removePressed);
function removePressed() {
  document.querySelectorAll('.pressed-primary, .pressed-secondary, .pressed-nav').forEach(el => {
    el.classList.remove('pressed-primary', 'pressed-secondary', 'pressed-nav');
  });
}



// GAS API CONFIG (DYNAMICS LOADED WITH FALLBACK)
const API_URL = (window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.api && window.PMS_CLIENT_CONFIG.api.gasWebAppUrl)
  ? window.PMS_CLIENT_CONFIG.api.gasWebAppUrl
  : "https://script.google.com/macros/s/AKfycbyjNwgZ_6CCv258lqKMrCXJYi0wDR23ZCyyzOQIV1R_WcCF5TQxYXOzZWWSJd_vMyu_/exec";

async function callApi(action, params = {}) {
  const MAX_RETRIES = 3;
  let delay = 1000;
  
  // LIFFがログイン済みならトークンを自動的に付与
  logDebug(`[callApi] Checking LIFF status. typeof liff=${typeof liff}`);
  if (typeof liff !== 'undefined') {
    const isLoggedIn = liff.isLoggedIn();
    const token = liff.getAccessToken();
    logDebug(`[callApi] isLoggedIn=${isLoggedIn}, tokenLength=${token ? token.length : '0'}`);
    if (isLoggedIn && token) {
      params.liffToken = token;
      logDebug(`[callApi] Token injected: ${token.substring(0, 10)}...`);
    } else {
      logDebug(`[callApi] Token injection skipped. isLoggedIn=${isLoggedIn}, hasToken=${!!token}`);
    }
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const queryParams = new URLSearchParams({
      action: action,
      _t: Date.now().toString(), // キャッシュバスター：iOS WebKitの302キャッシュ回避
      ...params
    });
    
    const url = `${API_URL}?${queryParams.toString()}`;
    const options = {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store', // キャッシュを利用しない
      redirect: 'follow'
    };
    
    try {
      logDebug(`[callApi] START (Attempt ${attempt}/${MAX_RETRIES}): action=${action}`);
      logDebug(`[callApi] URL: ${url.substring(0, 80)}...`);

      // 20秒タイムアウト（GASコールドスタート対策）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      logDebug(`[callApi] FETCH OK. status=${response.status}, type=${response.type}`);
      
      if (!response.ok) {
        logDebug(`[callApi] HTTP ERROR: status=${response.status}`);
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      logDebug(`[callApi] Calling response.text()...`);
      const text = await response.text();
      logDebug(`[callApi] TEXT RECEIVED (length=${text.length})`);
      logDebug(`[callApi] TEXT PREVIEW: ${text.substring(0, 150)}`);
      
      logDebug(`[callApi] Parsing JSON...`);
      let data;
      try {
        data = JSON.parse(text);
        logDebug(`[callApi] JSON PARSE SUCCESS. success=${data.success}`);
      } catch (parseErr) {
        logDebug(`[callApi] JSON parse failed. Error=${parseErr.message}`);
        logDebug(`[callApi] Failed Text snippet: ${text.substring(0, 200)}`);
        throw new Error("JSON形式ではない応答を受け取りました: " + parseErr.message);
      }
      
      // GAS v2 形式のレスポンス（data.data ペイロードが存在する）の場合はアンラップ
      if (data && typeof data === 'object' && 'data' in data && data.data !== null) {
        const innerSuccess = data.data.success !== undefined ? data.data.success : data.success;
        if (innerSuccess === false) {
          logDebug(`[callApi] API returned inner success=false. msg=${data.data.message || data.message}`);
          throw new Error(data.data.message || data.message || "API Error");
        }
        return data.data;
      }
      
      if (data.success === false) {
        logDebug(`[callApi] API returned success=false. msg=${data.message}`);
        throw new Error(data.message || "API Error");
      }
      return data;
    } catch (err) {
      logDebug(`[callApi] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === MAX_RETRIES) {
        logDebug(`[callApi] ALL ATTEMPTS FAILED.`);
        console.error("API Connection Error:", err);
        alert("通信エラーが発生しました。\n内容: " + err.message);
        throw err;
      }
      logDebug(`[callApi] Waiting ${delay}ms before retry...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

/**
 * 写真アップロードなど大容量データ用 POST API呼び出し
 * Content-Type未指定（text/plain扱い）でCORSプリフライトを回避しながらJSONボディを送信
 */
async function callApiPost(action, payload = {}) {
  const MAX_RETRIES = 3;
  let delay = 1000;

  // LIFFがログイン済みならトークンを自動的に付与
  if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
    payload.liffToken = liff.getAccessToken();
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const url = `${API_URL}?_t=${Date.now()}`; // actionはbodyに含める
    const body = JSON.stringify({ action, ...payload });

    const options = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow'
      // Content-Typeを設定しない → text/plain扱い → CORSプリフライト不要
    };

    try {
      logDebug(`[callApiPost] START (Attempt ${attempt}/${MAX_RETRIES}): action=${action}, bodySize=${body.length}`);

      // 90秒タイムアウト（大容量画像POST + GASコールドスタート + ドライブ保存処理の遅延対策）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const response = await fetch(url, { ...options, body, signal: controller.signal });
      clearTimeout(timeoutId);
      logDebug(`[callApiPost] FETCH OK. status=${response.status}`);

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const text = await response.text();
      logDebug(`[callApiPost] TEXT RECEIVED (length=${text.length})`);

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error("JSON形式ではない応答を受け取りました: " + parseErr.message);
      }

      // GAS v2 形式のレスポンス（data.data ペイロードが存在する）の場合はアンラップ
      if (data && typeof data === 'object' && 'data' in data && data.data !== null) {
        const innerSuccess = data.data.success !== undefined ? data.data.success : data.success;
        if (innerSuccess === false) throw new Error(data.data.message || data.message || "API Error");
        return data.data;
      }

      if (data.success === false) throw new Error(data.message || "API Error");
      return data;
    } catch (err) {
      logDebug(`[callApiPost] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === MAX_RETRIES) {
        console.error("API POST Error:", err);
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

function startApp(profile = null) {
  // 直ちにID画面（settings）に切り替える（スプラッシュ待ち時間 0秒）
  switchPage('settings');
  $('app').classList.remove('hidden');
  
  // 不透明度 0% を解除し、IDカード画面を前面へ可視化する (バグ修正)
  $('app').classList.remove('opacity-0');
  
  // loading をスムーズに隠す
  const loadingEl = $('loading');
  if (loadingEl) {
    loadingEl.classList.add('opacity-0');
    setTimeout(() => loadingEl.classList.add('hidden'), 400);
  }
  
  // データ同期およびロード処理は完全にバックグラウンドで非同期実行
  loadData(false);
}

function setSyncStatus(state) {
  const statusEl = $('sync-status');
  const textEl = $('sync-text');
  if (!statusEl) return;
  statusEl.className = 'w-2 h-2 rounded-full transition-all duration-300';

  if (textEl) {
    textEl.className = 'text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300';
  }

  if (state === 'online') {
    statusEl.classList.add('bg-[#22c55e]', 'shadow-[0_0_8px_#22c55e]', 'animate-soft-pulse');
    if (textEl) {
      textEl.textContent = 'ONLINE';
      textEl.classList.add('text-[#22c55e]');
    }
  } else if (state === 'offline') {
    statusEl.classList.add('bg-[#f59e0b]', 'shadow-[0_0_8px_#f59e0b]');
    if (textEl) {
      textEl.textContent = 'OFFLINE';
      textEl.classList.add('text-[#f59e0b]');
    }
  } else if (state === 'syncing') {
    statusEl.classList.add('bg-[#2563eb]', 'shadow-[0_0_8px_#2563eb]', 'animate-pulse');
    if (textEl) {
      textEl.textContent = 'SYNCING';
      textEl.classList.add('text-[#2563eb]', 'animate-pulse');
    }
  }
}

let isRegistering = false;
let registrationError = false;
function triggerBackgroundRegistration(profile) {
  window.liffProfile = profile;
  if (isRegistering) return;
  isRegistering = true;
  window.isRegistering = true;
  registrationError = false;
  window.registrationError = false;
  
  const idEl = $('storage-register-staff-id');
  if (idEl) {
    idEl.textContent = 'ID: 登録中...';
    idEl.style.color = 'inherit';
    idEl.style.cursor = 'default';
    idEl.onclick = null;
  }
  
  logDebug("API START (初回登録・非同期)");
  callApiPost('registerStaff', { 
    lastName: profile.displayName, 
    firstName: "(LINE)",
    lineUserId: profile.userId
  }).then(res => {
    isRegistering = false;
    window.isRegistering = false;
    logDebug("API OK (初回登録完了)");
    if (res && res.success) {
      const registeredInfo = {
        last: profile.displayName,
        first: "",
        id: res.id,
        lineUserId: profile.userId,
        picture: profile.pictureUrl
      };
      localStorage.setItem('user_info', JSON.stringify(registeredInfo));
      logDebug("Registered! Staff ID: " + res.id);
      
      const updatedIdEl = $('storage-register-staff-id');
      if (updatedIdEl) {
        updatedIdEl.textContent = 'ID: ' + (res.id || '---');
        updatedIdEl.style.color = 'inherit';
        updatedIdEl.style.cursor = 'default';
        updatedIdEl.onclick = null;
      }
      
      // 非同期登録成功に伴い、設定画面（IDカード）を即座に再描画してローダーから移行
      if (typeof renderSettings === 'function') {
        renderSettings();
      }
    } else {
      throw new Error("GAS registration returned success=false");
    }
  }).catch(err => {
    isRegistering = false;
    window.isRegistering = false;
    registrationError = true;
    window.registrationError = true;
    logDebug("Background registration failed: " + err.message);
    
    const updatedIdEl = $('storage-register-staff-id');
    if (updatedIdEl) {
      updatedIdEl.textContent = 'ID: 登録失敗 (タップして再試行)';
      updatedIdEl.style.color = '#ef4444';
      updatedIdEl.style.cursor = 'pointer';
      updatedIdEl.onclick = () => {
        triggerBackgroundRegistration(profile);
      };
    }
    
    // エラー状態を描画するために再表示
    if (typeof renderSettings === 'function') {
      renderSettings();
    }
  });
}

// 登録再試行用のグローバルハンドラーを公開
window.retryRegistration = () => {
  if (window.liffProfile) {
    triggerBackgroundRegistration(window.liffProfile);
  }
};

let isSyncing = false;
async function syncOfflineQueue() {
  if (isSyncing) return;
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  if (queue.length === 0) {
    setSyncStatus('online');
    return;
  }

  isSyncing = true;
  setSyncStatus('syncing');
  console.log(`Offline sync: processing ${queue.length} report(s)...`);

  const failedItems = [];
  for (const item of queue) {
    try {
      const result = await callApiPost('submitDistribution', item);
      if (!result || !result.success) {
        failedItems.push(item);
      }
    } catch (e) {
      console.error('Failed to sync offline item:', e);
      failedItems.push(item);
    }
  }

  localStorage.setItem('offline_queue', JSON.stringify(failedItems));
  isSyncing = false;

  if (failedItems.length === 0) {
    console.log('Offline sync completed successfully.');
    setSyncStatus('online');
  } else {
    console.warn(`${failedItems.length} items failed to sync. Will retry.`);
    setSyncStatus('offline');
  }
}

async function loadData(skipSync = false) {
  logDebug("[loadData] START (Background)");

  try {
    if (!skipSync && navigator.onLine) {
      logDebug("[loadData] Syncing offline queue in background...");
      await syncOfflineQueue();
    } else if (!navigator.onLine) {
      logDebug("[loadData] Offline. Setting status...");
      setSyncStatus('offline');
    }
    
    logDebug("[loadData] Fetching getAppData in background...");
    const data = await (_appDataPromise || callApi('getAppData')); // ⑤ プリフェッチがあれば再利用
    logDebug("[loadData] getAppData fetched successfully.");
    _appDataPromise = null;
    
    if (data && data.success) {
      logDebug("[loadData] data keys: " + Object.keys(data).join(", "));
      areaSummary = data.areas || [];
      if (data.branchName) localStorage.setItem('branch_name', data.branchName);
      
      logDebug("[loadData] Rendering areas in background...");
      renderAreas();
      logDebug("[loadData] Rendering areas OK. Updating stats...");
      updateStats();

      // バックグラウンドでランキングデータを先読み/更新
      prefetchRanking();
    } else {
      throw new Error(data ? data.message : "データが空です");
    }
  } catch (err) {
    console.error("Background Load Error:", err);
    logDebug(`[loadData] Background ERROR: ${err.message}`);
    // バックグラウンドロードの失敗は画面をブロッキングしてフリーズさせず、ログ出力のみに留めます。
  }
}

// ランキングデータのバックグラウンド先読み関数
function prefetchRanking() {
  window.activeRankingPromise = callApi('getRanking')
    .then(data => {
      if (data && data.success) {
        rankingData = data.ranking || [];
        _rankingFetched = true;
        logDebug("[prefetchRanking] Ranking pre-fetched in background.");
        // 現在ランキングページを表示中であれば再描画
        const activePage = document.querySelector('.page:not(.hidden)');
        if (activePage && activePage.id === 'page-ranking' && typeof renderRanking === 'function') {
          renderRanking();
        }
      }
      return data;
    })
    .catch(err => {
      logDebug("[prefetchRanking] Failed to pre-fetch ranking: " + err.message);
      return null;
    });
}

let numpadContext = null;

function openNumpad(areaName, rowId, initialCount, isDoneToggle = false, checkbox = null) {
  numpadContext = {
    areaName,
    rowId,
    isDoneToggle,
    checkbox,
    currentVal: initialCount ? String(initialCount) : '0'
  };
  
  $('numpad-display').textContent = numpadContext.currentVal;
  
  const modal = $('numpad-modal');
  modal.classList.remove('pointer-events-none', 'opacity-0');
  const content = modal.firstElementChild;
  content.classList.remove('translate-y-full');
}

function closeNumpad() {
  if (!numpadContext) return;
  
  if (numpadContext.isDoneToggle && numpadContext.checkbox) {
    numpadContext.checkbox.checked = false;
  }
  
  const modal = $('numpad-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
  const content = modal.firstElementChild;
  content.classList.add('translate-y-full');
  
  numpadContext = null;
}

// GPS現在地取得ヘルパー (3秒タイムアウト)
function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: '', longitude: '' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy   // GPS精度(m) — 要件2
        });
      },
      (err) => {
        console.warn("GPS Error:", err);
        resolve({ latitude: '', longitude: '', accuracy: null });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  });
}

// カメラを起動して写真Blobを返す
function capturePhoto() {
  return new Promise((resolve) => {
    const input = document.getElementById('camera-input');
    if (!input) {
      resolve(null);
      return;
    }
    
    const onFileChange = async (e) => {
      input.removeEventListener('change', onFileChange);
      const file = e.target.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const compressedBlob = await compressImage(file);
        resolve(compressedBlob);
      } catch (err) {
        console.error("Compression failed, uploading original:", err);
        resolve(file);
      } finally {
        input.value = '';
      }
    };
    
    input.addEventListener('change', onFileChange);
    input.click();
  });
}

// Canvasを使った画像圧縮 (150KB〜300KB)
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_LEN = 1200; // 要件6: 1024→1200px
        
        if (width > height) {
          if (width > MAX_LEN) {
            height = Math.round((height * MAX_LEN) / width);
            width = MAX_LEN;
          }
        } else {
          if (height > MAX_LEN) {
            width = Math.round((width * MAX_LEN) / height);
            height = MAX_LEN;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log(`Compressed image: ${(blob.size / 1024).toFixed(1)} KB`);
            resolve(blob);
          } else {
            reject(new Error("Canvas toBlob returned null"));
          }
        }, "image/jpeg", 0.6);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

window.triggerUISyncRefresh = async function() {
  if (!allPoints || allPoints.length === 0) return; // let変数は window に付かないため直接参照
  if (typeof getQueue !== 'function') return;
  
  const currentAreaName = window.currentCityDetailAreaName;
  if (!currentAreaName) return;

  try {
    const queue = await getQueue();
    allPoints.forEach(p => {
      const found = queue.find(q => q.rowId === p.rowId && q.areaName === currentAreaName);
      if (found) {
        p.syncStatus = found.syncStatus || found.status; // 'pending' | 'sending' | 'failed'
      } else {
        delete p.syncStatus;
      }
    });
    
    // リスト全体の再描画
    const areaName = window.currentCityDetailAreaName || '';
    if (areaName) {
      renderDetailList(areaName);
    }

    // 開いている詳細モーダルの再描画
    if (window.currentPointDetailRowId) {
      const p = allPoints.find(point => point.rowId === window.currentPointDetailRowId);
      const modalContent = $('detail-modal-content');
      if (p && modalContent && typeof renderDetailModalContent === 'function') {
        modalContent.innerHTML = renderDetailModalContent(p);
      }
    }
  } catch (err) {
    console.error("triggerUISyncRefresh error:", err);
  }
};

// 後から写真を追加・変更する処理
async function addPhotoToDetail(rowId) {
  const p = allPoints.find(point => point.rowId === rowId); // let変数は window に付かないため直接参照
  if (!p) return;
  const areaName = window.currentCityDetailAreaName || '';
  
  const imageBlob = await capturePhoto();
  if (!imageBlob) return;
  
  // ローカルBlobプレビューを即座に適用
  p.tempPhotoUrl = URL.createObjectURL(imageBlob);
  renderDetailList(areaName);
  const modalContent = $('detail-modal-content');
  if (modalContent) {
    modalContent.innerHTML = renderDetailModalContent(p);
  }
  
  // 非同期でIndexedDB送信キューに登録
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
  const staffId = userInfo.id || '';
  
  if (typeof enqueueSync === 'function') {
    p.syncStatus = 'pending';
    if (modalContent) {
      modalContent.innerHTML = renderDetailModalContent(p);
    }
    
    const gps = p.gps ? { latitude: p.gps.split(',')[0], longitude: p.gps.split(',')[1] } : { latitude: '', longitude: '' };

    // BlobはSafari/LINE WebViewのIndexedDBで失われるため送信前にbase64変換
    let photoBase64 = '';
    if (imageBlob && typeof blobToBase64 === 'function') {
      photoBase64 = await blobToBase64(imageBlob);
    }
    
    await enqueueSync({
      areaName,
      rowId,
      isDone:     true,
      count:      p.count || 0,
      latitude:   gps.latitude,
      longitude:  gps.longitude,
      accuracy:   gps.accuracy   || null,                    // 要件2
      branchCode: localStorage.getItem('branch_name') || '', // 要件2
      areaId:     String(rowId),                             // 要件2
      photoBase64, // BlobではなくBase64文字列で保存
      staffName,
      staffId
    });
  }
}

function pressNum(key) {
  if (!numpadContext) return;
  
  if (key === 'C') {
    numpadContext.currentVal = '0';
  } else if (key === 'OK') {
    const valNum = parseFloat(numpadContext.currentVal) || 0;
    const { areaName, rowId } = numpadContext;
    
    const p = allPoints.find(point => point.rowId === rowId);
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
    const staffId = userInfo.id || '';
    const now = new Date();
    const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 1. UIを即座に「完了」へ更新 (待ち時間ゼロUX)
    if (p) {
      p.isDone = true;
      p.count = valNum;
      p.staffName = staffName;
      p.completedAt = timeStr;
      p.syncStatus = 'pending';
      
      // リストを再描画（裏画面用）
      renderDetailList(areaName);
    }
    
    numpadContext.isDoneToggle = false;

    // GPS・カメラを先に開始（ユーザーのタップジェスチャーが生きている間に呼ぶ）
    const gpsPromise = getGPSLocation();
    // capturePhoto()内のinput.click()はここで同期的に実行される
    // → テンキーを閉じる前にカメラが起動するため、裏画面が一瞬見える現象を防ぐ
    const cameraPromise = capturePhoto();

    closeNumpad(); // カメラ起動後にテンキーを閉じる

    // 2. バックグラウンドで写真取得完了とGPS結果を待ちキューイングする
    (async () => {
      let imageBlob = null;
      try {
        imageBlob = await cameraPromise;
      } catch (err) {
        console.error("Camera activation failed:", err);
      }

      // カメラから戻った後、先行開始しておいたGPSの結果を待つ
      let gps = await gpsPromise;
      // GPS未取得の場合はカメラ復帰後にリトライ
      if (!gps.latitude || !gps.longitude) {
        console.log("GPS empty after camera, retrying...");
        gps = await getGPSLocation();
      }

      if (p) {
        if (gps.latitude && gps.longitude) {
          p.gps = `${gps.latitude},${gps.longitude}`;
        }
        if (imageBlob) {
          p.tempPhotoUrl = URL.createObjectURL(imageBlob);
        }
        renderDetailList(areaName);
        const modalContent = $('detail-modal-content');
        if (modalContent) {
          modalContent.innerHTML = renderDetailModalContent(p);
        }
      }

      // BlobはSafari/LINE WebViewのIndexedDBで失われるため送信前にbase64変換
      let photoBase64 = '';
      if (imageBlob && typeof window.blobToBase64 === 'function') {
        photoBase64 = await window.blobToBase64(imageBlob);
      }
      
      if (typeof enqueueSync === 'function') {
        await enqueueSync({
          areaName,
          rowId,
          isDone:     true,
          count:      valNum,
          latitude:   gps.latitude,
          longitude:  gps.longitude,
          accuracy:   gps.accuracy   || null,                    // 要件2
          branchCode: localStorage.getItem('branch_name') || '', // 要件2
          areaId:     String(rowId),                             // 要件2
          photoBase64, // BlobではなくBase64文字列で保存
          staffName,
          staffId
        });
      }
    })().catch(err => {
      console.error("Async sync background task failed:", err);
    });
    
    return;
  } else {
    if (numpadContext.currentVal === '0') {
      numpadContext.currentVal = String(key);
    } else {
      if (numpadContext.currentVal.length < 5) {
        numpadContext.currentVal += String(key);
      }
    }
  }
  
  $('numpad-display').textContent = numpadContext.currentVal;
}

async function updateRecord(areaName, rowId, isDone, count) {
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
  const staffId = userInfo.id || '';

  // IndexedDB キュー経由で送信（db.js のフローと統一 → オフライン対応・リトライあり）
  if (typeof enqueueSync === 'function') {
    await enqueueSync({
      areaName,
      rowId,
      isDone,
      count,
      latitude:    '',
      longitude:   '',
      accuracy:    null,
      branchCode:  localStorage.getItem('branch_name') || '',
      areaId:      String(rowId),
      photoBase64: '',
      staffName,
      staffId
    });
    return;
  }

  // フォールバック: db.js が未ロードの場合のみ旧フローを使用
  const payload = { areaName, rowId, staffName, staffId, isDone, count };
  if (!navigator.onLine) {
    saveToOfflineQueue(payload);
    applyOptimisticCheck(areaName, rowId, isDone, count);
    return;
  }
  try {
    const result = await callApiPost('submitDistribution', payload);
    if (result.success) loadData(true);
  } catch (e) {
    console.warn("API write failed. Storing report to offline queue.");
    saveToOfflineQueue(payload);
    applyOptimisticCheck(areaName, rowId, isDone, count);
  }
}

function saveToOfflineQueue(payload) {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  const filtered = queue.filter(item => !(item.areaName === payload.areaName && item.rowId === payload.rowId));
  filtered.push(payload);
  localStorage.setItem('offline_queue', JSON.stringify(filtered));
  setSyncStatus('offline');
}

function applyOptimisticCheck(areaName, rowId, isDone, count) {
  const p = allPoints.find(point => point.rowId === rowId);
  if (p) {
    p.isDone = isDone;
    p.count = count;
    if (isDone) {
      const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
      p.staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
      const now = new Date();
      p.completedAt = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    } else {
      p.completedAt = '';
      p.staffName = '';
    }
    
    const card = $(`point-card-${rowId}`);
    if (card) {
      card.innerHTML = renderPointCardHtml(areaName, p);
      if (!navigator.onLine) {
        const statusText = card.querySelector('label span');
        if (statusText) {
          statusText.textContent = isDone ? 'MISSION COMPLETED (OFFLINE)' : 'READY TO DEPLOY (OFFLINE)';
        }
      }
    }
  }
}

window.addEventListener('online', () => {
  console.log("Device is online. Initializing background sync.");
  syncOfflineQueue();
});

window.addEventListener('offline', () => {
  console.log("Device went offline.");
  setSyncStatus('offline');
});

async function switchPage(id, force = false) {
  const pages = document.querySelectorAll('.page');
  const targetId = id === 'detail' ? 'page-detail' :
                   id === 'settings' ? 'page-settings' :
                   id === 'ranking' ? 'page-ranking' :
                   id === 'storage-register' ? 'page-storage-register' :
                   id === 'storage-list' ? 'page-storage-list' :
                   'page-areas';
  const target = $(targetId);
  if (!target) return;

  // すでにアクティブなら多重遷移を防ぐためスキップ
  if (!force && !target.classList.contains('hidden') && target.style.opacity === '1') return;

  // エリア関連のページ切り替えであれば直前のページタイプを記憶
  if (id === 'areas' || id === 'detail') {
    lastAreaSubPage = id;
  }

  // 1. 現在表示されているページを上にスライドさせながらフェードアウト
  const activePage = Array.from(pages).find(p => !p.classList.contains('hidden'));
  if (activePage) {
    const activeId = pageIdMap[activePage.id];
    if (activeId) {
      scrollPositions[activeId] = $('content').scrollTop;
    }
    activePage.style.opacity = '0';
    activePage.style.transform = 'translateY(-12px)';
    await new Promise(r => setTimeout(r, 200)); // アニメーション時間分待つ
    activePage.classList.add('hidden');
  } else {
    pages.forEach(p => {
      p.classList.add('hidden');
      p.style.opacity = '0';
    });
  }

  // 2. ページに応じた処理・レンダリングを行う
  if (id === 'settings') renderSettings();
  if (id === 'ranking') {
    const container = $('ranking-list');
    if (!_rankingFetched) {
      if (container) {
        container.innerHTML = `
          <div style="border: 1px solid rgba(255,255,255,0.04);" class="premium-glass p-8 flex flex-col items-center justify-center text-center gap-3">
            <div class="w-8 h-8 rounded-full border-2 border-[#2563eb]/40 border-t-[#2563eb] animate-spin"></div>
            <p class="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Loading Leaderboard...</p>
          </div>`;
      }
      const p = window.activeRankingPromise || callApi('getRanking');
      p.then(data => {
        if (data && data.success) {
          rankingData = data.ranking || [];
          _rankingFetched = true;
        }
        if (typeof renderRanking === 'function') renderRanking();
      }).catch(() => {
        if (typeof renderRanking === 'function') renderRanking();
      });
    } else {
      if (typeof renderRanking === 'function') renderRanking();
    }
  }

  if (id === 'storage-register') {
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const staffId = userInfo.id || '';
    const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
    const idEl = $('storage-register-staff-id');
    const nameEl = $('storage-register-staff-name');
    
    if (idEl) {
      if (staffId) {
        idEl.textContent = 'ID: ' + staffId;
        idEl.style.color = 'inherit';
        idEl.style.cursor = 'default';
        idEl.onclick = null;
      } else if (isRegistering) {
        idEl.textContent = 'ID: 登録中...';
        idEl.style.color = 'inherit';
        idEl.style.cursor = 'default';
        idEl.onclick = null;
      } else if (registrationError) {
        idEl.textContent = 'ID: 登録失敗 (タップして再試行)';
        idEl.style.color = '#ef4444';
        idEl.style.cursor = 'pointer';
        idEl.onclick = async () => {
          try {
            idEl.textContent = 'ID: 再登録中...';
            idEl.style.color = 'inherit';
            const profile = await liff.getProfile();
            triggerBackgroundRegistration(profile);
          } catch(e) {
            idEl.textContent = 'ID: 登録失敗 (タップして再試行)';
            idEl.style.color = '#ef4444';
          }
        };
      } else {
        idEl.textContent = 'ID: ---';
        idEl.style.color = 'inherit';
        idEl.style.cursor = 'default';
        idEl.onclick = null;
      }
    }
    if (nameEl) nameEl.textContent = staffName || '---';

    // Clear input and feedback message on entry
    const countInput = $('storage-register-count');
    if (countInput) countInput.value = '';
    const msgEl = $('storage-register-message');
    if (msgEl) msgEl.classList.add('hidden');

    // Dropdown dynamic population
    const locSelect = $('storage-register-location');
    if (locSelect) {
      locSelect.innerHTML = '';
      const cities = new Set();
      if (Array.isArray(areaSummary)) {
        areaSummary.forEach(s => {
          const cName = getCityName(s.name);
          if (cName) cities.add(cName);
        });
      }
      const CITY_ORDER = { '伊賀市': 1, '亀山市': 2, '鈴鹿市': 3, '名張市': 4, '四日市市': 5 };
      const cityList = Array.from(cities).sort((a, b) => {
        const orderA = CITY_ORDER[a] || 99;
        const orderB = CITY_ORDER[b] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
      
      if (cityList.length === 0) {
        cityList.push('伊賀市', '亀山市', '鈴鹿市', '名張市', '四日市市');
      }
      cityList.forEach(city => {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city;
        locSelect.appendChild(opt);
      });
    }
  }

  if (id === 'storage-list') {
    const listContainer = $('storage-list-container');
    
    // 1. キャッシュがあれば即時描画（ローディング表示なしで即時表示）
    if (_stockFetched && _stockData && _stockData.length > 0) {
      if (typeof renderStorageList === 'function') renderStorageList(_stockData);
    } else {
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="border: 1px solid rgba(255,255,255,0.04);" class="premium-glass p-8 flex flex-col items-center justify-center text-center gap-3">
            <div class="w-8 h-8 rounded-full border-2 border-[#2563eb]/40 border-t-[#2563eb] animate-spin"></div>
            <p class="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Loading Inventory...</p>
          </div>`;
      }
    }
    
    // 2. バックグラウンドで最新データを取得し、サイレント更新
    callApi('getFlyerStock').then(data => {
      if (data && data.success) {
        _stockData = data.stocks || [];
        _stockFetched = true;
        if (typeof renderStorageList === 'function') renderStorageList(_stockData);
      } else {
        if (!_stockFetched && listContainer) {
          listContainer.innerHTML = `
            <div style="border: 1px solid rgba(255,255,255,0.04);" class="premium-glass p-8 flex flex-col items-center justify-center text-center gap-3">
              <span class="text-2xl">⚠️</span>
              <p class="text-sm font-black text-white/60">データ取得に失敗しました</p>
            </div>`;
        }
      }
    }).catch(err => {
      if (!_stockFetched && listContainer) {
        listContainer.innerHTML = `
          <div style="border: 1px solid rgba(255,255,255,0.04);" class="premium-glass p-8 flex flex-col items-center justify-center text-center gap-3">
            <span class="text-2xl">⚠️</span>
            <p class="text-sm font-black text-white/60">エラーが発生しました</p>
          </div>`;
      }
    });
  }
  
  // 3. ナビゲーションの表示制御
  const nav = $('bottom-nav');
  const hasUser = !!localStorage.getItem('user_info');
  if (nav) nav.style.display = hasUser ? '' : 'none';

  // 設定画面（登録・IDカード）では無駄なスクロールを避けるが、画面サイズが小さい場合はスクロール可能にする
  const contentEl = $('content');
  const settingsPage = document.getElementById('page-settings');
  if (id === 'settings') {
    if (!hasUser) {
      if (settingsPage) settingsPage.style.paddingBottom = '0px';
    } else {
      if (settingsPage) settingsPage.style.paddingBottom = '140px';
    }
    contentEl.scrollTop = 0;
    contentEl.style.overflowY = 'hidden';
  } else {
    contentEl.style.overflowY = 'auto';
  }

  // 4. 次のページを少し下から準備してフェードイン
  target.style.opacity = '0';
  target.style.transform = 'translateY(12px)';
  target.classList.remove('hidden');
  
  // リフローを強制してアニメーションを適用
  target.offsetHeight; 
  
  target.style.opacity = '1';
  target.style.transform = 'translateY(0)';
  

  // 下ナビのタブのアクティブ状態の不透明度とカラーを調整
  const navContainer = $('bottom-nav');
  if (navContainer && typeof renderBottomNavigation === 'function') {
    navContainer.innerHTML = renderBottomNavigation(id);
  }

  // スクロール位置の復元
  if (id === 'areas' && window.currentCityDetailAreaName) {
    setTimeout(() => {
      const cardEl = document.getElementById(`area-card-${window.currentCityDetailAreaName}`);
      if (cardEl) {
        cardEl.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else {
        $('content').scrollTo(0, scrollPositions[id] || 0);
      }
    }, 50);
  } else {
    $('content').scrollTo(0, scrollPositions[id] || 0);
  }
}

// 2層フリップ式ナビゲーション制御
let _prevPageBeforeTier2 = 'areas'; // 次へを押す前にいたページを記憶

window.toggleNavTier = function(tier) {
  if (tier === 2) {
    // 現在アクティブなページIDを記憶してから切り替え
    const activePage = document.querySelector('.page:not(.hidden)');
    if (activePage) {
      _prevPageBeforeTier2 = pageIdMap[activePage.id] || 'areas';
    }
    switchPage('storage-list');
  }
};

window.backToTier1 = function() {
  // 次へを押す前にいたページへ戻る
  if (_prevPageBeforeTier2 === 'ranking') {
    switchPage('ranking');
  } else if (_prevPageBeforeTier2 === 'settings') {
    switchPage('settings');
  } else if (_prevPageBeforeTier2 === 'detail') {
    switchPage('detail');
  } else {
    navigateToAreaTab();
  }
};

// 在庫登録フォームの処理
window.submitFlyerStock = async function() {
  const locSelect = $('storage-register-location');
  const countInput = $('storage-register-count');
  const msgEl = $('storage-register-message');
  const btn = $('btn-storage-register-submit');
  
  if (!locSelect || !countInput || !msgEl || !btn) return;
  
  const location = locSelect.value;
  const count = parseInt(countInput.value, 10);
  
  if (!location) {
    alert("保管場所を選択してください。");
    return;
  }
  if (isNaN(count) || count < 0) {
    alert("正しい枚数を入力してください。");
    return;
  }
  
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
  
  if (!staffId || !staffName) {
    alert("ID情報がありません。ID登録を行ってください。");
    return;
  }
  
  btn.disabled = true;
  btn.textContent = "登録中...";
  msgEl.classList.add('hidden');
  
  try {
    const res = await callApiPost('updateFlyerStock', {
      location: location,
      count: count,
      staffName: staffName,
      staffId: staffId
    });
    
    if (res && res.success) {
      msgEl.textContent = "✓ 在庫を登録しました";
      msgEl.classList.remove('hidden');
      countInput.value = '';
      _stockFetched = false; // キャッシュを無効化し、次回遷移時に最新の在庫を取得させる
    } else {
      alert("登録に失敗しました: " + (res.message || "エラー"));
    }
  } catch (e) {
    alert("エラーが発生しました: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "在庫を登録する";
  }
};

// 下ナビの「エリア」ボタンタップ時に直前のサブページへ戻る
function navigateToAreaTab() {
  switchPage(lastAreaSubPage);
}

// 2層目（エリア一覧）から1層目（市区町村一覧）へ戻る
function backToCityList() {
  currentCity = null;
  renderAreas();
  const contentEl = $('content');
  if (contentEl) contentEl.scrollTop = 0;
}

function updateStats() {
  let totalDone = 0;
  let totalPoints = 0;
  if (!areaSummary || !Array.isArray(areaSummary)) {
    logDebug("[updateStats] areaSummary is missing or not an array!");
    return;
  }
  areaSummary.forEach(area => {
    totalDone += area.done || 0;
    totalPoints += area.total || 0;
  });

  const countEl = $('header-count');
  const pctEl = $('header-pct');

  if (totalPoints === 0) {
    if (countEl) countEl.textContent = '0/ 0';
    if (pctEl) pctEl.textContent = '0%';
    return;
  }

  const pct = Math.round((totalDone / totalPoints) * 100);

  if (countEl) countEl.textContent = `${totalDone}/ ${totalPoints}`;
  if (pctEl) pctEl.textContent = `${pct}%`;
}

function cleanNameInput(str) {
  if (!str) return "";
  // 1. スペース（半角・全角）をすべて除去
  let s = str.replace(/[\s\u3000]/g, "");
  
  // 2. 半角カタカナを全角カタカナに変換
  const kanaMap = {
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ',
    'ｰ': 'ー', 'ﾞ': '゛', 'ﾟ': '゜'
  };
  let reg = new RegExp('[' + Object.keys(kanaMap).join('') + ']', 'g');
  s = s.replace(reg, m => kanaMap[m]);
  
  // 濁点・半濁点の結合処理
  s = s.replace(/カ゛/g, 'ガ').replace(/キ゛/g, 'ギ').replace(/ク゛/g, 'グ').replace(/ケ゛/g, 'ゲ').replace(/コ゛/g, 'ゴ')
       .replace(/サ゛/g, 'ザ').replace(/シ゛/g, 'ジ').replace(/ス゛/g, 'ズ').replace(/セ゛/g, 'ゼ').replace(/ソ゛/g, 'ゾ')
       .replace(/タ゛/g, 'ダ').replace(/チ゛/g, 'ヂ').replace(/ツ゛/g, 'ヅ').replace(/テ゛/g, 'デ').replace(/ト゛/g, 'ド')
       .replace(/ハ゛/g, 'バ').replace(/ヒ゛/g, 'ビ').replace(/フ゛/g, 'ブ').replace(/ヘ゛/g, 'ベ').replace(/ホ゛/g, 'ボ')
       .replace(/ハ゜/g, 'パ').replace(/ヒ゜/g, 'ピ').replace(/フ゜/g, 'プ').replace(/ヘ゜/g, 'ペ').replace(/ホ゜/g, 'ポ');
       
  return s;
}

// [CANDIDATE FOR REMOVAL]
// Legacy manual registration.
// Not executed in normal LINE authentication flow.
async function saveProfile() {
  logDebug("saveProfile: click triggered");
  const rawLast = $('user-last').value, rawFirst = $('user-first').value;
  logDebug(`saveProfile: inputs: last='${rawLast}', first='${rawFirst}'`);
  const last = cleanNameInput(rawLast);
  const first = cleanNameInput(rawFirst);
  logDebug(`saveProfile: cleaned: last='${last}', first='${first}'`);
  
  if (!last || !first) {
    logDebug("saveProfile: validation failed (empty last/first name)");
    alert('姓名を入力してください');
    return;
  }
  
  logDebug("saveProfile: showing loading indicator");
  $('loading').classList.remove('hidden');
  $('loading').classList.remove('opacity-0');
  
  await new Promise(r => setTimeout(r, 50));
  
  try {
    logDebug("saveProfile: invoking callApi('registerStaff')");
    const res = await callApi('registerStaff', { lastName: last, firstName: first });
    logDebug(`saveProfile: API result: ${JSON.stringify(res)}`);
    if (res && res.success) {
      logDebug("saveProfile: success! storing user_info to localStorage");
      const existing = JSON.parse(localStorage.getItem('user_info')) || {};
      const updated = Object.assign({}, existing, { last, first });
      if (res.id) updated.id = res.id;
      localStorage.setItem('user_info', JSON.stringify(updated));
      window.isEditingProfile = false;
      logDebug("saveProfile: switching to settings page");
      switchPage('settings', true);
      $('loading').classList.add('opacity-0');
      setTimeout(() => $('loading').classList.add('hidden'), 700);
    } else {
      throw new Error('Failed');
    }
  } catch (err) {
    logDebug(`saveProfile: caught exception: ${err.message}`);
    alert('通信エラーが発生しました。');
    $('loading').classList.add('opacity-0');
    setTimeout(() => $('loading').classList.add('hidden'), 700);
  }
}

async function safeInitApp() {
  // LIFF SDK が内部でトークン交換用に生成する非表示 iframe 内での二重実行（アクセストークン失効）を完全に防止するガード
  if (window !== window.top) {
    console.log("[DEBUG] Running inside iframe, skipping safeInitApp.");
    return;
  }

  logDebug("safeInitApp invoked.");
  console.log("POSTING MAP PRO safeInitApp started.");
  
  // URLに死んだパラメータが残っている、かつ初期化前（または失敗時）の保険
  const urlParams = new URLSearchParams(window.location.search);
  const hasOAuthParams = urlParams.has('code') || urlParams.has('liff.state');
  const isReturningFromLogin = sessionStorage.getItem('liff_initializing') === 'true';

  // liff.login()で戻ってきた場合（?code= あり & フラグあり）→ LIFFに正常処理させる
  // 孤立した ?code=（フラグなし）→ クリーンURLでやり直し（スタック防止）
  if (hasOAuthParams && !isReturningFromLogin) {
      sessionStorage.setItem('liff_initializing', 'true');
      window.location.href = window.location.origin + window.location.pathname;
      return;
  }
  // ※ フラグはここでは削除しない。ログイン確認成功後（isLoggedIn()=true）に削除する。
  
  // クライアント設定(PMS_CLIENT_CONFIG)からLIFF IDを取得、なければホスト名からフォールバック
  const liffId = (window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.line && window.PMS_CLIENT_CONFIG.line.liffId)
    ? window.PMS_CLIENT_CONFIG.line.liffId
    : (window.location.hostname === 'area-management.github.io' ? "2010374196-gIYb6PDH" : "2010374196-gIYb6PDH");
  
  if (typeof liff !== 'undefined') {
    try {
      logDebug("LIFF INIT START"); // ① LIFF初期化開始
      // ① LINE JS Bridge 接続待ち（最適化済み）
      await new Promise(r => setTimeout(r, 50));

      // ⏳ 5秒でタイムアウトする安全装置
      const liffInitPromise = liff.init({ liffId: liffId });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("LINEログインの応答がタイムアウトしました(5秒)")), 5000)
      );

      await Promise.race([liffInitPromise, timeoutPromise]);
      logDebug("LIFF INIT OK"); // ② LIFF初期化成功
      setLoadingProgress(35, 'AUTHENTICATED');
      
      logDebug("LOGIN CHECK"); // ③ login判定
      if (liff.isLoggedIn()) {
        logDebug("LOGIN OK");
        sessionStorage.removeItem('liff_initializing'); // ✅ ログイン確認後にフラグを削除（ここが正しいタイミング）
        
        let userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
        
        // ⑤ getAppDataを並列プリフェッチ開始
        _appDataPromise = callApi('getAppData');

        // 【通常起動】既にユーザー登録・LINE連携キャッシュがある場合は、同期通信を待たずに即時起動
        if (userInfo.id && userInfo.lineUserId) {
          logDebug("Fast startup using cached user info.");
          const cachedProfile = {
            displayName: userInfo.last,
            userId: userInfo.lineUserId,
            pictureUrl: userInfo.picture || ''
          };
          
          // 0.1秒で即時にID表示・メイン画面可視化
          startApp(cachedProfile);

          // バックグラウンドで静かにgetProfileを走らせ、LINE公式の最新データに追従
          liff.getProfile().then(profile => {
            logDebug("Background profile refresh OK");
            userInfo.lineUserId = profile.userId;
            userInfo.picture = profile.pictureUrl;
            localStorage.setItem('user_info', JSON.stringify(userInfo));
            
            // 最新の名前・アバター写真をIDカードにリアルタイム反映（再描画）
            if (typeof renderSettings === 'function') {
              renderSettings();
            }
          }).catch(err => {
            console.warn("Background profile refresh failed:", err);
          });

        } else {
          // 【初回ログイン/キャッシュ未確立時】同期的にgetProfileを取得して登録へ進む
          try {
            // LINE内部トークン処理完了のための安全ウェイト（300ms）
            await new Promise(r => setTimeout(r, 300));

            logDebug("PROFILE START");
            const profile = await liff.getProfile();
            logDebug("PROFILE OK");
            
            // トークン確立後に OAuth パラメータを安全に消去
            try {
              const cleanUrl = window.location.origin + window.location.pathname + window.location.search.replace(/[\?&](code|liff\.state)=[^&]*/g, '');
              window.history.replaceState({}, document.title, cleanUrl);
              logDebug("OAuth query parameters cleaned from address bar via history.replaceState (Safe Delay)");
            } catch (e) {
              console.warn("Failed to clean OAuth query parameters:", e);
            }

            setLoadingProgress(65, 'PROFILE LOADED');
            console.log(profile);

            // 初回登録をバックグラウンド(非同期)で実行
            triggerBackgroundRegistration(profile);

            logDebug("START APP");
            startApp(profile);
          } catch (err) {
            console.error("LIFF PROFILE ERROR", err);
            logDebug("LIFF PROFILE ERROR: " + err.message);
            $('loading-status').textContent = "起動エラー: " + err.message;
          }
        }
      } else {
        // LINEログイン処理中（OAuthコールバックのパラメータがある）なら、手動ログイン画面を出さずに少し待機して再チェックする
        const urlParams = new URLSearchParams(window.location.search);
        const isProcessing = urlParams.has('code') || urlParams.has('liff.state');
        if (isProcessing) {
          logDebug("LINE login is processing in background. Retrying login check in 1.5s...");
          setTimeout(() => {
            if (liff.isLoggedIn()) {
              logDebug("Retried Login: OK");
              safeInitApp(); // 再起動してメインフローへ入る
            } else {
              logDebug("Retried Login: FAIL. Redirecting to LINE Login automatically...");
              sessionStorage.setItem('liff_initializing', 'true');
              liff.login();
            }
          }, 1500);
          return;
        }

        logDebug("Not logged in. Redirecting to LINE Login automatically...");
        sessionStorage.setItem('liff_initializing', 'true');
        liff.login();
      }
    } catch (err) {
      console.error("LIFF Init Error:", err);
      logDebug("LIFF Error: " + err.message);
      $('loading-status').textContent = "起動エラー: " + err.message;
    }
  } else {
    logDebug("Running in standalone web browser. Blocked.");
    $('loading-status').textContent = "エラー: LINEアプリ内から起動してください。";
  }
}

// defer属性によりDOM解析完了後・LIFF SDK読み込み後に実行される（DOMContentLoaded待ち不要）
safeInitApp();

// 規約・ライセンスデータ
const ID_INFO_DATA = {
  terms: {
    title: 'Terms of Service',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p>POSTING MAP は、<br>認証された配布員・管理者向けの<br><span class="text-white font-bold">FIELD OPERATIONS SYSTEM</span> です。</p>
        
        <div class="space-y-1">
          <p class="text-white/70 font-black">本システムは：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・配布進捗</div>
            <div>・エリア管理</div>
            <div>・GPSログ</div>
            <div>・活動データ</div>
            <div>・ランキング</div>
          </div>
          <p class="text-white/40">をリアルタイム管理します。</p>
        </div>

        <div class="space-y-1">
          <p class="text-white/70 font-black">本システムの：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・無断複製</div>
            <div>・再配布</div>
            <div>・不正利用</div>
            <div>・地域外利用</div>
          </div>
          <p class="text-white/40">を禁止します。</p>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">各地域ライセンスは、<br>契約支部・契約組織にのみ付与されます。</p>
      </div>
    `
  },
  privacy: {
    title: 'Privacy Policy',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p>POSTING MAP は、<br>FIELD OPERATIONS SYSTEM として、<br>以下の情報を取得・管理します。</p>
        
        <div class="space-y-1">
          <p class="text-white/70 font-black">【取得・管理する情報】</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・LINE認証情報</div>
            <div>・配布員ID</div>
            <div>・エリア進捗</div>
            <div>・配布ログ</div>
            <div>・GPS位置情報</div>
            <div>・写真エビデンス</div>
            <div>・デバイス情報</div>
          </div>
        </div>

        <div class="space-y-1">
          <p class="text-white/70 font-black">【取得データの利用目的】</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・配布進捗管理</div>
            <div>・エリア統制</div>
            <div>・FIELD OPERATIONS分析</div>
            <div>・不正防止</div>
            <div>・リアルタイム同期</div>
          </div>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">GPSおよび写真情報は、<br>FIELD OPERATIONS の活動証跡として利用されます。</p>
      </div>
    `
  },
  license: {
    title: 'License',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p class="text-white font-bold">FIELD OPERATIONS LICENSE</p>
        
        <p class="text-white/60 font-black">LICENSED ORGANIZATION<br>【__BRANCH_NAME__】</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">AUTHORIZED SYSTEMS：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・STAFF APP</div>
            <div>・ADMIN CONTROL</div>
            <div>・HQ MONITORING</div>
            <div>・REALTIME FIELD SYNC</div>
          </div>
        </div>

        <p class="text-white/60 font-black">LICENSE STATUS:<br><span class="text-emerald-500/80 font-black">ACTIVE</span></p>

        <p class="text-white/40">本ライセンスは、契約地域内のみ有効です。<br>地域外利用・再配布は禁止します。</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">POSTING MAP は：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・LINE認証</div>
            <div>・STAFF ID</div>
            <div>・ライセンス管理</div>
            <div>・権限制御</div>
          </div>
          <p class="text-white/40">により、FIELD OPERATIONS を保護します。</p>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">LICENSED FIELD OPERATIONS SYSTEM<br>© POSTING MAP</p>
      </div>
    `
  }
};

// ID情報モーダルの制御
function openIdInfoModal(type, event) {
  if (event) event.stopPropagation(); // イベントのバブリング防止
  
  const modal = $('id-info-modal');
  if (!modal) return;
  
  const data = ID_INFO_DATA[type];
  if (!data) return;
  
  const titleEl = $('id-info-title');
  const bodyEl = $('id-info-body');
  
  if (titleEl) titleEl.textContent = data.title;
  if (bodyEl) {
    let bodyText = data.body;
    
    // ライセンス表示時のみ、支部名を動的に差し替える
    if (type === 'license') {
      const rawBranch = localStorage.getItem('branch_name') || '';
      const displayBranch = rawBranch ? (rawBranch.includes('支部') ? rawBranch : `${rawBranch} 支部`) : 'MIE-02 支部';
      bodyText = bodyText.replace('__BRANCH_NAME__', displayBranch);
    }
    
    bodyEl.innerHTML = bodyText;
  }
  
  modal.classList.remove('pointer-events-none', 'opacity-0');
  modal.firstElementChild.classList.remove('translate-y-full');
}

function closeIdInfoModal() {
  const modal = $('id-info-modal');
  if (!modal) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.firstElementChild.classList.add('translate-y-full');
}

// =============================
// 受渡要請システム (Flyer Transfer Request System)
// =============================
let currentTransferRequest = null;

window.openTransferRequestDialog = function(name, id, loc, count) {
  currentTransferRequest = { holderName: name, holderUserId: id, requestArea: loc, stockCount: count };

  // 既存を削除して再生成（CSS競合を完全排除）
  const prev = document.getElementById('dynamic-transfer-dialog');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dynamic-transfer-dialog';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.85);';

  overlay.innerHTML = `
    <div style="background:#1C1C1E;border-radius:24px;border:1px solid rgba(255,255,255,0.12);padding:32px 24px;width:100%;max-width:340px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:24px;margin-bottom:10px;">📦</div>
        <div style="color:white;font-size:15px;font-weight:900;letter-spacing:0.05em;">受渡要請の確認</div>
        <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:4px;">以下の方にチラシ受渡を要請します</div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;margin-bottom:24px;text-align:center;">
        <div style="color:rgba(255,255,255,0.45);font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">保管者</div>
        <div style="color:white;font-size:17px;font-weight:900;">${name}</div>
        <div style="color:rgba(255,255,255,0.45);font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin-top:12px;margin-bottom:4px;">保管枚数</div>
        <div style="color:#22c55e;font-size:22px;font-weight:900;font-family:monospace;">${Number(count).toLocaleString()}枚</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="dyn-cancel" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;">キャンセル</button>
        <button id="dyn-submit" style="flex:2;background:#2563eb;border:none;color:white;border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;">🤝 要請する</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('dyn-cancel').addEventListener('click', () => overlay.remove());

  document.getElementById('dyn-submit').addEventListener('click', async () => {
    const btn = document.getElementById('dyn-submit');
    if (btn) { btn.textContent = '送信中...'; btn.disabled = true; }
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    try {
      const res = await callApiPost('requestFlyerTransfer', {
        requestUserId: userInfo.id || 'UNKNOWN',
        requestUserName: userInfo.last || '不明',
        requestArea: currentTransferRequest.requestArea,
        holderUserId: currentTransferRequest.holderUserId,
        holderName: currentTransferRequest.holderName,
        stockCount: currentTransferRequest.stockCount
      });
      overlay.remove();
      if (res && res.success) {
        alert('✅ 受渡要請を送信しました！\n保管者に通知されます。');
      } else {
        alert('送信に失敗しました: ' + (res ? res.message : 'Unknown error'));
      }
    } catch(err) {
      alert('通信エラー: ' + err.message);
      if (btn) { btn.textContent = '🤝 要請する'; btn.disabled = false; }
    }
  });
};

window.closeTransferRequestDialog = function() {
  const d = document.getElementById('dynamic-transfer-dialog');
  if (d) d.remove();
};


