/**
 * content.js (MAIN world) — v1.3
 *
 * Adisyo panelindeki XHR ve fetch çağrılarını intercept eder.
 * Sipariş listesi endpoint'leri (Adisyo bunları farklı isimlerle çağırabilir):
 *   - GetOrdersForList
 *   - GetOrders
 *   - OrderList
 *   - GetOrderList
 *
 * Yakalanan response'ları postMessage ile bridge.js'e iletir.
 * Debug için console'a tüm intercept'ler loglanır.
 */
(function () {
  if (window.__AGROSJET_ADISYO_HOOKED__) return;
  window.__AGROSJET_ADISYO_HOOKED__ = true;

  const PATH_REGEX = /(GetOrdersForList|GetOrderList|GetOrders|OrderList|orders\/list|listOrders)/i;

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
    return null;
  }

  function postToBridge(orders, url) {
    try {
      console.log("[AgrosJet Adisyo Bridge] " + orders.length + " sipariş yakalandı (" + url + ")");
      window.postMessage({ source: "agrosjet-adisyo-hook", payload: orders, url: url }, "*");
    } catch (e) {
      console.warn("[AgrosJet Adisyo Bridge] postMessage hatası", e);
    }
  }

  // 1) XMLHttpRequest intercept
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__agrosjet_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      try {
        const url = this.__agrosjet_url || "";
        if (url && PATH_REGEX.test(url)) {
          console.log("[AgrosJet Adisyo Bridge] XHR match → " + url);
          const parsed = safeJSON(this.responseText);
          const orders = extractOrders(parsed);
          if (orders && orders.length) {
            postToBridge(orders, url);
          } else {
            console.log("[AgrosJet Adisyo Bridge] response içinde sipariş array'i yok, raw=", parsed);
          }
        }
      } catch (e) { console.warn("[AgrosJet] XHR handler error", e); }
    });
    return origSend.apply(this, arguments);
  };

  // 2) fetch intercept
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const resp = await origFetch.apply(this, arguments);
    try {
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url && PATH_REGEX.test(url)) {
        console.log("[AgrosJet Adisyo Bridge] fetch match → " + url);
        const clone = resp.clone();
        clone.text().then((txt) => {
          const parsed = safeJSON(txt);
          const orders = extractOrders(parsed);
          if (orders && orders.length) {
            postToBridge(orders, url);
          } else {
            console.log("[AgrosJet Adisyo Bridge] response içinde sipariş array'i yok, raw=", parsed);
          }
        }).catch(() => {});
      }
    } catch (e) { console.warn("[AgrosJet] fetch handler error", e); }
    return resp;
  };

  console.log("[AgrosJet Adisyo Bridge] hooks installed (v1.3)");
})();
