import { useState, useEffect } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, FileText, Package, Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSessionCheck } from "@/hooks/useSessionCheck";

const NAV_ITEMS = [
  { path: "/courier", label: "Vardiya", icon: Clock },
  { path: "/courier/muhasebe", label: "Muhasebe", icon: FileText },
  { path: "/courier/zimmet", label: "Zimmet", icon: Package },
];

function VardiyaPage() {
  return (
    <div data-testid="courier-vardiya-page">
      <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">
        Vardiya
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Vardiya yönetimi içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

function MuhasebePage() {
  return (
    <div data-testid="courier-muhasebe-page">
      <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">
        Muhasebe
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Muhasebe içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

function ZimmetPage() {
  return (
    <div data-testid="courier-zimmet-page">
      <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">
        Zimmet
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Zimmet takibi içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  useSessionCheck();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== "courier") {
      navigate("/login");
      return;
    }
    setUser(parsed);
    if (parsed.companies && parsed.companies.length > 0) {
      setSelectedCompany(parsed.companies[0]);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const companies = user.companies || [];
  const hasCompanies = companies.length > 0;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedCompany?.logo_url ? (
            <img src={selectedCompany.logo_url} alt={selectedCompany.name} className="h-8 object-contain" />
          ) : (
            <span className="font-heading text-lg font-bold">
              {selectedCompany?.name || "ShiftJet"}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-white hover:bg-white/10"
          data-testid="mobile-menu-btn"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold ${
                location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-white/10 text-left"
            data-testid="mobile-logout-btn"
          >
            <LogOut className="w-5 h-5" />
            Çıkış
          </button>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
          <div className="p-6 border-b border-white/20">
            {selectedCompany?.logo_url ? (
              <img src={selectedCompany.logo_url} alt={selectedCompany.name} className="h-10 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-xl font-bold">
                {selectedCompany?.name || "ShiftJet"}
              </h1>
            )}
            <p className="text-white/60 text-sm mt-1">Kurye Paneli</p>
            <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
          </div>
          
          {/* Company Selector */}
          {hasCompanies && companies.length > 1 && (
            <div className="px-4 py-3 border-b border-white/20">
              <p className="text-white/60 text-xs mb-2">Şirket Seç</p>
              <Select 
                value={selectedCompany?.id || ""} 
                onValueChange={(val) => setSelectedCompany(companies.find(c => c.id === val))}
              >
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-semibold transition-colors ${
                  location.pathname === item.path
                    ? "bg-white/20 border-l-4 border-orange-500"
                    : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-white/20">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-white hover:bg-white/10 font-semibold text-sm"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 pb-16">
          {!hasCompanies ? (
            <div className="border-2 border-border p-8 bg-white text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-heading text-xl font-bold mb-2">Şirket Bekleniyor</h2>
              <p className="text-muted-foreground">
                Henüz bir şirkete bağlı değilsiniz. Bir şirket sizi ekledikten sonra paneli kullanabilirsiniz.
              </p>
            </div>
          ) : (
            <Routes>
              <Route index element={<VardiyaPage />} />
              <Route path="muhasebe" element={<MuhasebePage />} />
              <Route path="zimmet" element={<ZimmetPage />} />
            </Routes>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t py-3 text-center text-xs text-muted-foreground">
        © 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.
      </footer>
    </div>
  );
}
