const $ = (id) => document.getElementById(id);

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (cls ? " " + cls : "");
}

function show(view) {
  $("loginView").classList.toggle("hidden", view !== "login");
  $("activeView").classList.toggle("hidden", view !== "active");
}

let countdownTimer = null;
let lastTickTs = 0;
let intervalSec = 60;

function updateTimerUI(remainingMs) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  $("timerNum").textContent = sec;
  $("timerStatus").textContent = sec > 0 ? `${sec} saniye sonra yenilenecek` : "Yenileniyor…";
  // Ring progress (188.5 ≈ 2*PI*r=30)
  const fullDash = 188.5;
  const progress = remainingMs / (intervalSec * 1000); // 1.0 → 0.0
  const offset = fullDash * (1 - progress);
  $("timerArc").setAttribute("stroke-dashoffset", offset.toFixed(2));
}

function startCountdownLoop() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const elapsed = Date.now() - lastTickTs;
    const remaining = (intervalSec * 1000) - elapsed;
    if (remaining <= 0) {
      // background alarm tetikleyecek; biz state'i tazeleyelim
      refreshTickState();
    } else {
      updateTimerUI(remaining);
    }
  }, 500);
}

function refreshTickState() {
  chrome.runtime.sendMessage({ type: "GET_TICK_INFO" }, (info) => {
    if (!info || info.error) return;
    intervalSec = info.poll_seconds || 60;
    lastTickTs = info.last_tick_ts || Date.now();
    // İlk açılışta lastTick yoksa "şimdi" sayılır
    if (!info.last_tick_ts) {
      lastTickTs = Date.now();
      chrome.runtime.sendMessage({ type: "GET_TICK_INFO" }, () => {});
    }
    updateTimerUI(info.next_in_ms);
    // Tab durumunu güncelle
    if (info.adisyo_tab_open) {
      $("tabStatus").innerHTML = `<span class="dot ok"></span>Adisyo sekmesi açık (${info.adisyo_tab_count})`;
      $("statusDot").className = "dot ok";
      $("statusLabel").textContent = "Aktif";
    } else {
      $("tabStatus").innerHTML = `<span class="dot warn"></span>Adisyo sekmesi kapalı — açın`;
      $("statusDot").className = "dot warn";
      $("statusLabel").textContent = "Beklemede";
    }
  });
}

async function refreshState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (!state) {
        setStatus("Eklenti yüklenemedi", "err");
        return resolve(null);
      }
      if (!state.logged_in) {
        show("login");
        setStatus("Restoran hesabınızla giriş yapın");
        return resolve(state);
      }
      show("active");
      $("restaurantNameVal").textContent = state.restaurant_name || "—";
      $("companyNameVal").textContent = state.company_name || "—";
      setStatus("");
      refreshTickState();
      startCountdownLoop();
      resolve(state);
    });
  });
}

$("loginBtn").addEventListener("click", () => {
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    setStatus("Kullanıcı adı ve şifre gerekli", "err");
    return;
  }
  setStatus("Giriş yapılıyor…");
  chrome.runtime.sendMessage({ type: "LOGIN", username, password }, (res) => {
    if (!res) { setStatus("Yanıt yok", "err"); return; }
    if (!res.ok) { setStatus("Giriş başarısız: " + res.error, "err"); return; }
    setStatus("Giriş başarılı ✓", "ok");
    refreshState();
  });
});

$("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("loginBtn").click();
});

$("logoutBtn").addEventListener("click", () => {
  if (countdownTimer) clearInterval(countdownTimer);
  chrome.runtime.sendMessage({ type: "LOGOUT" }, () => {
    show("login");
    setStatus("Çıkış yapıldı");
    $("username").value = "";
    $("password").value = "";
  });
});

$("refreshNowBtn").addEventListener("click", () => {
  setStatus("Adisyo sayfası yenileniyor…");
  chrome.runtime.sendMessage({ type: "TRIGGER_REFRESH" }, (res) => {
    if (!res || !res.ok) {
      const e = (res && res.error) || "bilinmeyen";
      if (e === "no_adisyo_tab") {
        setStatus("Adisyo sekmesi açık değil — app.adisyo.com'u açın", "err");
      } else if (e === "config_missing") {
        setStatus("Önce giriş yapın", "err");
      } else {
        setStatus("Hata: " + e, "err");
      }
      return;
    }
    setStatus(`Adisyo yenilendi ✓ (${res.tab_count} sekme)`, "ok");
    setTimeout(() => setStatus(""), 3000);
    refreshTickState();
  });
});

$("intervalSelect").addEventListener("change", (e) => {
  const sec = parseInt(e.target.value, 10);
  chrome.runtime.sendMessage({ type: "SET_POLL_SECONDS", seconds: sec }, (res) => {
    if (res && res.ok) {
      intervalSec = res.poll_seconds;
      setStatus(`Yenileme sıklığı: ${res.poll_seconds} sn`, "ok");
      setTimeout(() => setStatus(""), 2000);
      refreshTickState();
    }
  });
});

// Initial: select'i mevcut interval'a göre seç
chrome.runtime.sendMessage({ type: "GET_TICK_INFO" }, (info) => {
  if (info && info.poll_seconds) {
    intervalSec = info.poll_seconds;
    $("intervalSelect").value = String(info.poll_seconds);
  }
  refreshState();
});
