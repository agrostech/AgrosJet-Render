/**
 * bridge.js (ISOLATED) — v1.3
 * content.js (MAIN) ↔ background.js köprüsü
 */
(function () {
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    if (event.data.source !== "agrosjet-adisyo-hook") return;
    const orders = event.data.payload;
    const url = event.data.url || "";
    if (!Array.isArray(orders) || !orders.length) return;
    console.log("[AgrosJet Bridge] background'a " + orders.length + " sipariş gönderiliyor");
    try {
      chrome.runtime.sendMessage({ type: "ADISYO_ORDERS", orders, url }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn("[AgrosJet Bridge] sendMessage err:", chrome.runtime.lastError.message);
          return;
        }
        console.log("[AgrosJet Bridge] backend yanıt:", res);
      });
    } catch (e) {
      console.warn("[AgrosJet Bridge] sendMessage exception", e);
    }
  });
  console.log("[AgrosJet Bridge] isolated context aktif");
})();
