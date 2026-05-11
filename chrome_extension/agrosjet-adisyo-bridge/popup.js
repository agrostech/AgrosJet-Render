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
      $("userNameVal").textContent = state.user_name || "—";
      setStatus("Hazır — Adisyo panelini açın", "ok");
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
  chrome.runtime.sendMessage({ type: "LOGOUT" }, () => {
    show("login");
    setStatus("Çıkış yapıldı");
    $("username").value = "";
    $("password").value = "";
  });
});

// Initial
refreshState();
