import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, Shield } from "lucide-react";

export default function LoginSelectorPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      if (user.expiresAt && Date.now() > user.expiresAt) {
        localStorage.removeItem("user");
        return;
      }
      if (user.role === "courier") navigate("/courier");
      else if (user.role === "systemadmin") navigate("/system");
      else if (user.role === "restaurant") navigate("/restoran");
      else navigate("/admin");
    }
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: "url('https://static.prod-images.emergentagent.com/jobs/dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/images/df1ee712afbdbe4a80c6c8d13bb106900f89ddc6a7a9eff3309ca29c9ca23dea.png')",
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img
            src="https://customer-assets.emergentagent.com/job_dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/artifacts/kj7xrk2d_agroslogo.png"
            alt="AgrosJet"
            className="h-24 drop-shadow-lg"
          />
        </div>

        {/* Kartlar */}
        <div className="space-y-4">
          <Link
            to="/restoran-login"
            className="group flex flex-col items-center gap-3 bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] border border-white/50"
            data-testid="selector-restaurant"
          >
            <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
              <Store className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-900">Restoran Girişi</h3>
              <p className="text-sm text-slate-500">Restoran yönetim paneli</p>
            </div>
          </Link>

          <Link
            to="/admin-login"
            className="group flex flex-col items-center gap-3 bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] border border-white/50"
            data-testid="selector-admin"
          >
            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
              <Shield className="w-8 h-8 text-slate-700" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-900">Yönetici Girişi</h3>
              <p className="text-sm text-slate-500">Şirket yönetim paneli</p>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-sm text-slate-600 drop-shadow-sm">
          © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
        </p>
      </div>
    </div>
  );
}
