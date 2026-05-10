/**
 * background.js (service worker)
 *
 * Görev: bridge.js'ten gelen Adisyo orderlarını AgrosJet backend'ine forward eder.
 *
 * chrome.storage.sync üzerinde tutulan ayarlar:
 *   - backend_url  (ör. https://logo-deployment-test-1.preview.emergentagent.com)
 *   - token        (Bearer token, admin veya restoran giriş tokenı)
 *   - restaurant_id (AgrosJet UUID)
 *
 * Throttle: aynı sipariş ID'leri 30 sn içinde tekrar yollanırsa atlanır
 * (idempotency zaten backend'de var, ek savunma).
 */

const SENT_CACHE = new Map(); // adisyo_order_id -> last_sent_ts
const CACHE_TTL_MS = 30 * 1000;

function cleanupCache() {
  const now = Date.now();
  for (const [k, v] of SENT_CACHE.entries()) {
    if (now - v > CACHE_TTL_MS) SENT_CACHE.delete(k);
  }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["backend_url", "token", "restaurant_id"], (cfg) => resolve(cfg || {}));
  });
}

async function forwardOrders(orders) {
  const cfg = await getConfig();
  if (!cfg.backend_url || !cfg.token || !cfg.restaurant_id) {
    console.warn("[AgrosJet bridge] config eksik:", {
      hasBackend: !!cfg.backend_url, hasToken: !!cfg.token, hasRestaurant: !!cfg.restaurant_id,
    });
    return { skipped: "no_config" };
  }

  cleanupCache();
  const now = Date.now();
  const filtered = orders.filter((o) => {
    const id = o && o.id;
    if (!id) return false;
    const last = SENT_CACHE.get(id);
    if (last && now - last < CACHE_TTL_MS) return false;
    return true;
  });
  if (!filtered.length) return { skipped: "throttled" };

  const url = cfg.backend_url.replace(/\/$/, "") + "/api/adisyo-scrape/orders";

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.token,
      },
      body: JSON.stringify({
        restaurant_id: cfg.restaurant_id,
        orders: filtered,
      }),
    });
    const text = await resp.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    console.log("[AgrosJet bridge] POST status=" + resp.status + " body=" + text.slice(0, 200));

    if (resp.ok) {
      filtered.forEach((o) => SENT_CACHE.set(o.id, now));
      updateBadge(data || {});
    } else {
      // auth hatasında badge'i yandan göster
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
      chrome.action.setBadgeText({ text: "!" });
    }
    return data;
  } catch (e) {
    console.error("[AgrosJet bridge] fetch error", e);
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    chrome.action.setBadgeText({ text: "!" });
    return { error: String(e) };
  }
}

function updateBadge(summary) {
  const c = summary.created || 0;
  const u = summary.updated || 0;
  const total = c + u;
  if (total > 0) {
    chrome.action.setBadgeBackgroundColor({ color: "#059669" });
    chrome.action.setBadgeText({ text: String(total) });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ADISYO_ORDERS" && Array.isArray(msg.orders)) {
    forwardOrders(msg.orders).then((res) => sendResponse(res || {})).catch(() => sendResponse({}));
    return true; // async response
  }
  if (msg && msg.type === "TEST_HEALTH") {
    (async () => {
      const cfg = await getConfig();
      if (!cfg.backend_url || !cfg.token) {
        sendResponse({ ok: false, error: "config_missing" });
        return;
      }
      try {
        const url = cfg.backend_url.replace(/\/$/, "") + "/api/adisyo-scrape/health";
        const r = await fetch(url, { headers: { "Authorization": "Bearer " + cfg.token } });
        const t = await r.text();
        sendResponse({ ok: r.ok, status: r.status, body: t.slice(0, 300) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[AgrosJet Adisyo Bridge] installed");
});
