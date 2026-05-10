const $ = (id) => document.getElementById(id);

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (cls ? " " + cls : "");
}

function load() {
  chrome.storage.sync.get(["backend_url", "token", "restaurant_id"], (cfg) => {
    $("backend_url").value = cfg.backend_url || "";
    $("token").value = cfg.token || "";
    $("restaurant_id").value = cfg.restaurant_id || "";
  });
}

$("save").addEventListener("click", () => {
  const backend_url = $("backend_url").value.trim();
  const token = $("token").value.trim();
  const restaurant_id = $("restaurant_id").value.trim();
  if (!backend_url || !token || !restaurant_id) {
    setStatus("Tüm alanları doldurun", "err");
    return;
  }
  chrome.storage.sync.set({ backend_url, token, restaurant_id }, () => {
    setStatus("Kaydedildi ✓", "ok");
  });
});

$("test").addEventListener("click", () => {
  setStatus("Test ediliyor...");
  chrome.runtime.sendMessage({ type: "TEST_HEALTH" }, (res) => {
    if (!res) {
      setStatus("Yanıt yok", "err");
      return;
    }
    if (res.ok) {
      setStatus("✓ Bağlantı OK · " + (res.body || "").slice(0, 120), "ok");
    } else {
      setStatus("✗ " + (res.error || ("HTTP " + res.status + " · " + (res.body || ""))), "err");
    }
  });
});

load();
