/**
 * content.js - Çalışma alanı: MAIN world (sayfanın kendi JS context'i)
 *
 * Görev: Adisyo panelindeki XMLHttpRequest ve fetch çağrılarını intercept et,
 * "GetOrdersForList" çağrılarının response body'sini yakala ve postMessage ile
 * isolated content script (bridge.js) tarafına yolla.
 *
 * NOT: Manifest v3 + world:"MAIN" sayesinde bu script doğrudan sayfanın
 * window/fetch'ine erişebilir. chrome.* API'lerine erişemez; o yüzden
 * bridge.js üzerinden köprü kurulur.
 */
(function () {
  if (window.__AGROSJET_ADISYO_HOOKED__) return;
  window.__AGROSJET_ADISYO_HOOKED__ = true;

  const TARGET_PATH = "GetOrdersForList"; // Adisyo endpoint adı

  function safeJSON(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function postToBridge(data) {
    try {
      window.postMessage({ source: "agrosjet-adisyo-hook", payload: data }, "*");
    } catch (e) {
      // ignore
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
        if (url && url.indexOf(TARGET_PATH) !== -1) {
          const body = this.responseText;
          const parsed = safeJSON(body);
          if (parsed) postToBridge(parsed);
        }
      } catch (e) { /* ignore */ }
    });
    return origSend.apply(this, arguments);
  };

  // 2) fetch intercept
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const resp = await origFetch.apply(this, arguments);
    try {
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url && url.indexOf(TARGET_PATH) !== -1) {
        const clone = resp.clone();
        clone.text().then((txt) => {
          const parsed = safeJSON(txt);
          if (parsed) postToBridge(parsed);
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    return resp;
  };

  console.log("[AgrosJet Adisyo Bridge] hooks installed");
})();
