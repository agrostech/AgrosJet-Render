/**
 * bridge.js - Çalışma alanı: ISOLATED (extension content script context)
 *
 * Görev: content.js (MAIN world) tarafından `window.postMessage` ile yollanan
 * Adisyo response'larını alır ve `chrome.runtime.sendMessage` ile background.js'e
 * iletir (background AgrosJet backend'e POST eder).
 */
(function () {
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    if (event.data.source !== "agrosjet-adisyo-hook") return;
    const payload = event.data.payload;
    if (!Array.isArray(payload)) {
      // Bazen response { Data: [...] } şeklinde olabilir
      if (payload && Array.isArray(payload.Data)) {
        forwardOrders(payload.Data);
      } else if (payload && Array.isArray(payload.data)) {
        forwardOrders(payload.data);
      }
      return;
    }
    forwardOrders(payload);
  });

  function forwardOrders(orders) {
    if (!orders || !orders.length) return;
    try {
      chrome.runtime.sendMessage({ type: "ADISYO_ORDERS", orders }, () => {
        // ignore response
      });
    } catch (e) {
      console.warn("[AgrosJet bridge] sendMessage failed", e);
    }
  }
})();
