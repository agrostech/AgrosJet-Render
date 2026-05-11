/**
 * content.js (MAIN world) — v1.5
 *
 * Adisyo panelindeki XHR, fetch ve WebSocket çağrılarını intercept eder.
 *
 * Gerçek zamanlı yakalama:
 *  - XHR/fetch: Adisyo manuel listing yenilemelerinde devreye girer
 *  - WebSocket: SignalR/native WS push'larıyla yeni sipariş bildirimi yakalanır
 *  - Periyodik polling: Son yakalanan listing URL'sini her 20 sn'de bir tekrar çağırır
 *    (F5'e gerek kalmadan otomatik akış için)
 */
(function () {
  if (window.__AGROSJET_ADISYO_HOOKED__) return;
  window.__AGROSJET_ADISYO_HOOKED__ = true;

  const PATH_REGEX = /(GetOrdersForList|GetOrderList|GetOrders|OrderList|orders\/list|listOrders)/i;
  const POLL_INTERVAL_MS = 20000; // 20 sn — F5'siz otomatik akış için

  let lastListingURL = null;
  let lastListingMethod = "GET";
  let lastListingBody = null;
  let lastListingHeaders = {};

  function safeJSON(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function looksLikeOrderArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0];
    return first && (
      typeof first.id !== "undefined" ||
      typeof first.orderNumber !== "undefined" ||
      typeof first.OrderNumber !== "undefined"
    );
  }

  function extractOrders(parsed) {
    if (!parsed) return null;
    if (looksLikeOrderArray(parsed)) return parsed;
    if (parsed.Data && looksLikeOrderArray(parsed.Data)) return parsed.Data;
    if (parsed.data && looksLikeOrderArray(parsed.data)) return parsed.data;
    if (parsed.result && looksLikeOrderArray(parsed.result)) return parsed.result;
    if (parsed.Result && looksLikeOrderArray(parsed.Result)) return parsed.Result;
    if (parsed.items && looksLikeOrderArray(parsed.items)) return parsed.items;
    if (parsed.orders && looksLikeOrderArray(parsed.orders)) return parsed.orders;
    return null;
  }

  function postToBridge(orders, url, channel) {
    try {
      console.log(`[AgrosJet] ${channel} → ${orders.length} sipariş yakalandı (${url})`);
      window.postMessage({ source: "agrosjet-adisyo-hook", payload: orders, url, channel }, "*");
    } catch (e) {
      console.warn("[AgrosJet] postMessage error", e);
    }
  }

  function rememberListing(url, method, body, headers) {
    lastListingURL = url;
    lastListingMethod = method || "GET";
    lastListingBody = body || null;
    lastListingHeaders = headers || {};
  }

  /* ====== 1) XMLHttpRequest hook ====== */
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__agrosjet_url = url;
    this.__agrosjet_method = method;
    this.__agrosjet_headers = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this.__agrosjet_headers) this.__agrosjet_headers[key] = value;
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__agrosjet_url && PATH_REGEX.test(this.__agrosjet_url)) {
      rememberListing(this.__agrosjet_url, this.__agrosjet_method, body, this.__agrosjet_headers);
    }
    this.addEventListener("load", function () {
      try {
        const url = this.__agrosjet_url || "";
        if (url && PATH_REGEX.test(url)) {
          const parsed = safeJSON(this.responseText);
          const orders = extractOrders(parsed);
          if (orders && orders.length) postToBridge(orders, url, "XHR");
        }
      } catch (e) { /* ignore */ }
    });
    return origSend.apply(this, arguments);
  };

  /* ====== 2) fetch hook ====== */
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = (typeof input === "string") ? input : (input && input.url) || "";
    const method = (init && init.method) || (input && input.method) || "GET";
    if (url && PATH_REGEX.test(url)) {
      const headers = {};
      try {
        if (init && init.headers) {
          if (init.headers.forEach) init.headers.forEach((v, k) => { headers[k] = v; });
          else Object.assign(headers, init.headers);
        }
      } catch {}
      rememberListing(url, method, (init && init.body) || null, headers);
    }
    const resp = await origFetch.apply(this, arguments);
    try {
      if (url && PATH_REGEX.test(url)) {
        const clone = resp.clone();
        clone.text().then((txt) => {
          const parsed = safeJSON(txt);
          const orders = extractOrders(parsed);
          if (orders && orders.length) postToBridge(orders, url, "fetch");
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    return resp;
  };

  /* ====== 3) WebSocket hook (SignalR/native WS push'ları için) ====== */
  try {
    const OrigWS = window.WebSocket;
    function WrappedWS(url, protocols) {
      const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
      console.log("[AgrosJet] WebSocket bağlantı kuruldu: " + url);
      const origOnMsg = ws.onmessage;
      ws.addEventListener("message", function (ev) {
        try {
          const data = ev && ev.data;
          if (typeof data !== "string") return;
          // SignalR mesajları 0x1E ile ayrılabilir; her parça JSON
          const parts = data.split(/\x1E/);
          for (const part of parts) {
            if (!part) continue;
            const parsed = safeJSON(part);
            if (!parsed) continue;
            // Adisyo SignalR mesajları args/data içinde sipariş array'i taşır
            let orders = extractOrders(parsed);
            if (!orders && parsed.arguments && Array.isArray(parsed.arguments)) {
              for (const arg of parsed.arguments) {
                const inner = extractOrders(arg);
                if (inner) { orders = inner; break; }
                // Tek sipariş objesi (live push) gelmiş olabilir
                if (arg && (arg.id || arg.orderNumber)) { orders = [arg]; break; }
              }
            }
            if (orders && orders.length) postToBridge(orders, "ws:" + url, "WebSocket");
          }
        } catch (e) { /* ignore */ }
      });
      return ws;
    }
    WrappedWS.prototype = OrigWS.prototype;
    WrappedWS.CONNECTING = OrigWS.CONNECTING;
    WrappedWS.OPEN = OrigWS.OPEN;
    WrappedWS.CLOSING = OrigWS.CLOSING;
    WrappedWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = WrappedWS;
    console.log("[AgrosJet] WebSocket hook installed");
  } catch (e) {
    console.warn("[AgrosJet] WebSocket hook failed", e);
  }

  /* ====== 4) Periyodik polling (F5'siz otomatik akış) ====== */
  async function pollListing() {
    if (!lastListingURL) return;
    try {
      const opts = {
        method: lastListingMethod || "GET",
        headers: lastListingHeaders || {},
        credentials: "include",
      };
      if (lastListingMethod !== "GET" && lastListingMethod !== "HEAD") {
        opts.body = lastListingBody || null;
      }
      const resp = await origFetch(lastListingURL, opts);
      const txt = await resp.text();
      const parsed = safeJSON(txt);
      const orders = extractOrders(parsed);
      if (orders && orders.length) postToBridge(orders, lastListingURL, "poll");
    } catch (e) {
      console.warn("[AgrosJet] poll error", e && e.message);
    }
  }
  setInterval(pollListing, POLL_INTERVAL_MS);

  console.log("[AgrosJet Adisyo Bridge] hooks installed (v1.5) — XHR + fetch + WS + 20s polling");
})();
