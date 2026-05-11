/**
 * background.js (service worker) — v1.6
 *
 * Akış:
 *  1) Restoran user'ı popup'tan login olur (remember_me=true → 30 gün token).
 *  2) chrome.alarms ile periyodik tick (varsayılan 1 dakika, popup'tan ayarlanabilir).
 *  3) Her tick:
 *     - Adisyo tab'i açıksa: chrome.tabs.reload → sayfa F5 olur,
 *       content.js GetOrdersForList'i yakalar, background'a iletir, biz POST'larız.
 *     - Adisyo tab'i kapalıysa: skip (kullanıcıya status'ta gösterilir).
 *  4) Son tick zamanı storage.local'a yazılır; popup açıldığında geri sayım gösterilir.
 *
 * Backend URL hardcoded: https://api.agrosjet.app
 */

const DEFAULT_BACKEND = "https://api.agrosjet.app";
const ALARM_NAME = "agrosjet-poll-tick";
const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 30;
const MAX_POLL_SECONDS = 300;

const SENT_CACHE = new Map();
const CACHE_TTL_MS = 30 * 1000;

function cleanupCache() {
  const now = Date.now();
  for (const [k, v] of SENT_CACHE.entries()) {
    if (now - v > CACHE_TTL_MS) SENT_CACHE.delete(k);
  }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["backend_url", "token", "restaurant_id", "restaurant_name", "user_name", "company_name", "company_id", "poll_seconds"],
      (cfg) => {
        cfg.backend_url = cfg.backend_url || DEFAULT_BACKEND;
        cfg.poll_seconds = cfg.poll_seconds || DEFAULT_POLL_SECONDS;
        resolve(cfg || {});
      }
    );
  });
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: color || "#059669" });
    chrome.action.setBadgeText({ text: String(text || "") });
  } catch (e) { /* ignore */ }
}

async function forwardOrders(orders) {
  const cfg = await getConfig();
  if (!cfg.token || !cfg.restaurant_id) {
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
      body: JSON.stringify({ restaurant_id: cfg.restaurant_id, orders: filtered }),
    });
    const text = await resp.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    console.log("[AgrosJet bridge] POST status=" + resp.status + " body=" + text.slice(0, 200));

    if (resp.ok) {
      filtered.forEach((o) => SENT_CACHE.set(o.id, now));
      const c = (data && data.created) || 0;
      const u = (data && data.updated) || 0;
      const total = c + u;
      if (total > 0) {
        setBadge(String(total), "#059669");
        setTimeout(() => setBadge(""), 5000);
      }
    } else if (resp.status === 401) {
      // Token süresi dolmuş
      setBadge("!", "#dc2626");
      chrome.storage.sync.remove(["token"]);
    } else {
      setBadge("!", "#dc2626");
    }
    return data;
  } catch (e) {
    console.error("[AgrosJet bridge] fetch error", e);
    setBadge("!", "#dc2626");
    return { error: String(e) };
  }
}

/* ============== Auth helpers (popup'tan çağrılır) ============== */

async function login({ username, password }) {
  try {
    const backend = DEFAULT_BACKEND;
    const url = backend.replace(/\/$/, "") + "/api/restaurant-users/login";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, remember_me: true }),
    });
    const text = await resp.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    if (!resp.ok) {
      return { ok: false, error: (data && data.detail) || ("HTTP " + resp.status) };
    }
    // Token + restoran bilgisi kaydet — restoran kullanıcı tek restorana bağlı, dropdown'a gerek yok
    await new Promise((res) => {
      chrome.storage.sync.set({
        backend_url: backend,
        token: data.token,
        user_name: data.name,
        role: data.role,
        restaurant_id: data.restaurant_id,
        restaurant_name: data.restaurant_name,
        company_id: data.company_id,
        company_name: data.company_name || "",
      }, res);
    });
    return { ok: true, user: data };
  } catch (e) {
    console.error("[AgrosJet bridge] login error", e);
    return { ok: false, error: "Bağlantı hatası: " + (e && e.message ? e.message : String(e)) };
  }
}

async function saveRestaurant({ restaurant_id, restaurant_name, company_id, company_name }) {
  await new Promise((res) => {
    chrome.storage.sync.set({ restaurant_id, restaurant_name, company_id, company_name }, res);
  });
  return { ok: true };
}

async function getState() {
  const cfg = await getConfig();
  return {
    logged_in: !!cfg.token,
    user_name: cfg.user_name || "",
    company_id: cfg.company_id || "",
    company_name: cfg.company_name || "",
    restaurant_id: cfg.restaurant_id || "",
    restaurant_name: cfg.restaurant_name || "",
    backend_url: cfg.backend_url,
  };
}

async function logout() {
  await new Promise((res) => {
    chrome.storage.sync.remove(
      ["token", "user_name", "role", "company_id", "company_name", "restaurant_id", "restaurant_name"],
      res
    );
  });
  setBadge("");
  return { ok: true };
}

/* ============== Message handler ============== */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  switch (msg.type) {
    case "ADISYO_ORDERS":
      forwardOrders(msg.orders).then((r) => sendResponse(r || {})).catch((e) => sendResponse({ error: String(e) }));
      return true;
    case "LOGIN":
      login(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    case "GET_STATE":
      getState().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
      return true;
    case "LOGOUT":
      logout().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    case "TRIGGER_REFRESH":
      triggerRefresh().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    case "SET_POLL_SECONDS":
      setPollSeconds(msg.seconds).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    case "GET_TICK_INFO":
      getTickInfo().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
      return true;
  }
  return false;
});


/* ============== Alarm + Refresh Mekanizması ============== */

async function setLastTickNow() {
  return new Promise((res) => {
    chrome.storage.local.set({ last_tick_ts: Date.now() }, res);
  });
}

async function getLastTickTs() {
  return new Promise((res) => {
    chrome.storage.local.get(["last_tick_ts"], (d) => res(d.last_tick_ts || 0));
  });
}

async function getTickInfo() {
  const cfg = await getConfig();
  const last = await getLastTickTs();
  const intervalMs = cfg.poll_seconds * 1000;
  const elapsed = Date.now() - last;
  const remaining = Math.max(0, intervalMs - elapsed);
  // Adisyo tab açık mı?
  const tabs = await chrome.tabs.query({ url: ["https://app.adisyo.com/*", "https://*.adisyo.com/*"] });
  return {
    poll_seconds: cfg.poll_seconds,
    last_tick_ts: last,
    next_in_ms: remaining,
    adisyo_tab_open: tabs.length > 0,
    adisyo_tab_count: tabs.length,
  };
}

async function setPollSeconds(seconds) {
  let s = parseInt(seconds, 10) || DEFAULT_POLL_SECONDS;
  if (s < MIN_POLL_SECONDS) s = MIN_POLL_SECONDS;
  if (s > MAX_POLL_SECONDS) s = MAX_POLL_SECONDS;
  await new Promise((r) => chrome.storage.sync.set({ poll_seconds: s }, r));
  await rescheduleAlarm(s);
  return { ok: true, poll_seconds: s };
}

async function rescheduleAlarm(seconds) {
  try {
    await chrome.alarms.clear(ALARM_NAME);
  } catch {}
  // chrome.alarms minimum periodInMinutes = 0.5 (30 sn) — Chrome 117+
  const periodInMinutes = Math.max(0.5, (seconds || DEFAULT_POLL_SECONDS) / 60);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: periodInMinutes, periodInMinutes });
  console.log(`[AgrosJet] alarm set: every ${periodInMinutes.toFixed(2)} min (${seconds}s)`);
}

async function triggerRefresh() {
  /**
   * Adisyo tab'ini yenile. content.js sayfa açıldıktan sonra GetOrdersForList
   * yakalayıp background'a iletir; biz forwardOrders ile AgrosJet'e POST'larız.
   *
   * Adisyo tab kapalıysa: hiçbir şey yapmaz, UI'da "Adisyo tab kapalı" gösterilir.
   */
  await setLastTickNow();
  const cfg = await getConfig();
  if (!cfg.token || !cfg.restaurant_id) {
    return { ok: false, error: "config_missing" };
  }
  try {
    const tabs = await chrome.tabs.query({ url: ["https://app.adisyo.com/*", "https://*.adisyo.com/*"] });
    if (!tabs.length) {
      return { ok: false, error: "no_adisyo_tab" };
    }
    // İlk açık tab'i reload et (birden fazla varsa hepsi: ama performans için tek)
    const tab = tabs[0];
    await chrome.tabs.reload(tab.id);
    console.log(`[AgrosJet] tab ${tab.id} reloaded`);
    return { ok: true, tab_id: tab.id, tab_count: tabs.length };
  } catch (e) {
    console.warn("[AgrosJet] triggerRefresh error", e);
    return { ok: false, error: String(e) };
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log("[AgrosJet] alarm tick → trigger refresh");
  await triggerRefresh();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AgrosJet Adisyo Bridge v1.6] installed");
  const cfg = await getConfig();
  if (!cfg.backend_url) chrome.storage.sync.set({ backend_url: DEFAULT_BACKEND });
  if (!cfg.poll_seconds) chrome.storage.sync.set({ poll_seconds: DEFAULT_POLL_SECONDS });
  await rescheduleAlarm(cfg.poll_seconds || DEFAULT_POLL_SECONDS);
});

chrome.runtime.onStartup.addListener(async () => {
  const cfg = await getConfig();
  await rescheduleAlarm(cfg.poll_seconds || DEFAULT_POLL_SECONDS);
});
