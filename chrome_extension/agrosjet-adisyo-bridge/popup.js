const $ = (id) => document.getElementById(id);

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (cls ? " " + cls : "");
}

function show(view) {
  $("loginView").classList.toggle("hidden", view !== "login");
  $("configView").classList.toggle("hidden", view !== "config");
}

async function refreshState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (!state) {
        setStatus("Eklenti background yüklenemedi", "err");
        return resolve(null);
      }
      if (!state.logged_in) {
        show("login");
        setStatus("Giriş yapın");
        return resolve(state);
      }
      show("config");
      $("userNameVal").textContent = state.user_name || "—";
      $("companyNameVal").textContent = state.company_name || "—";

      // Şirketler dropdown
      const companies = state.accessible_companies || [];
      const sel = $("companySelect");
      sel.innerHTML = "";
      if (companies.length === 0 && state.company_id) {
        const opt = document.createElement("option");
        opt.value = state.company_id;
        opt.textContent = state.company_name || state.company_id;
        sel.appendChild(opt);
      } else {
        companies.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.name;
          if (c.id === state.company_id) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      $("companyField").style.display = companies.length > 1 ? "block" : "none";

      // Aktif restoran kartı
      if (state.restaurant_id) {
        $("activeCard").style.display = "block";
        $("activeRestVal").textContent = state.restaurant_name || state.restaurant_id;
        setStatus("Bağlantı aktif", "ok");
      } else {
        $("activeCard").style.display = "none";
        setStatus("Restoran seçin");
      }

      // Restoran dropdown
      loadRestaurants(state.company_id, state.restaurant_id);
      resolve(state);
    });
  });
}

function loadRestaurants(companyId, selectedRestId) {
  if (!companyId) return;
  const sel = $("restaurantSelect");
  sel.innerHTML = '<option value="">Yükleniyor…</option>';
  chrome.runtime.sendMessage({ type: "LIST_RESTAURANTS", company_id: companyId }, (res) => {
    sel.innerHTML = "";
    if (!res || !res.ok) {
      sel.innerHTML = '<option value="">Yüklenemedi</option>';
      setStatus("Restoran listesi alınamadı: " + (res && res.error), "err");
      return;
    }
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = "— Seçin —";
    sel.appendChild(empty);
    res.restaurants.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      if (r.id === selectedRestId) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

/* ============== Events ============== */

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

$("companySelect").addEventListener("change", (e) => {
  const cid = e.target.value;
  loadRestaurants(cid, null);
});

$("saveBtn").addEventListener("click", () => {
  const company_id = $("companySelect").value;
  const company_name = $("companySelect").selectedOptions[0]?.textContent || "";
  const restaurant_id = $("restaurantSelect").value;
  const restaurant_name = $("restaurantSelect").selectedOptions[0]?.textContent || "";
  if (!restaurant_id) {
    setStatus("Restoran seçin", "err");
    return;
  }
  chrome.runtime.sendMessage(
    { type: "SAVE_RESTAURANT", restaurant_id, restaurant_name, company_id, company_name },
    () => {
      setStatus("Kaydedildi ✓", "ok");
      refreshState();
    }
  );
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
