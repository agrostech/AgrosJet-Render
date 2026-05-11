/**
 * background.js (service worker) — v1.1
 *
 * Yeni akış:
 *  1) Kullanıcı popup'a giriş yapar (username + password). Eklenti
 *     /api/auth/admin/login çağırır, remember_me=true ile 30 günlük token alır.
 *  2) Token + accessible_companies + restaurants storage'a kaydedilir.
 *  3) Kullanıcı popup'tan tek tıkla şirket + restoran seçer.
 *  4) Adisyo panelindeki siparişler otomatik backend'e iletilir.
 *
 * Backend URL hardcoded: https://api.agrosjet.com
 */

const DEFAULT_BACKEND = "https://api.agrosjet.com";

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
    chrome.storage.sync.get(["backend_url", "token", "restaurant_id", "user_name", "company_name"], (cfg) => {
      cfg.backend_url = cfg.backend_url || DEFAULT_BACKEND;
      resolve(cfg || {});
    });
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
      forwardOrders(msg.orders).then((r) => sendResponse(r || {}));
      return true;
    case "LOGIN":
      login(msg).then(sendResponse);
      return true;
    case "GET_STATE":
      getState().then(sendResponse);
      return true;
    case "LOGOUT":
      logout().then(sendResponse);
      return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[AgrosJet Adisyo Bridge v1.1] installed");
  // Default backend URL set
  chrome.storage.sync.get(["backend_url"], (cfg) => {
    if (!cfg.backend_url) chrome.storage.sync.set({ backend_url: DEFAULT_BACKEND });
  });
});
