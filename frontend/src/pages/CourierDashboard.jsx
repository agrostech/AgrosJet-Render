import { useState, useEffect } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, FileText, Package } from "lucide-react";

const NAV_ITEMS = [
  { path: "/courier", label: "VARDİYA", icon: Clock },
  { path: "/courier/muhasebe", label: "MUHASEBE", icon: FileText },
  { path: "/courier/zimmet", label: "ZİMMET", icon: Package },
];

function VardiyaPage() {
  return (
    <div data-testid="courier-vardiya-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        VARDİYA
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
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        MUHASEBE
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
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        ZİMMET
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
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const company = user.company;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
          ) : (
            <span className="font-heading text-lg font-bold uppercase">{company?.name || "KURYE"}</span>
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
              className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider ${
                location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
              }`}
              data-testid={`mobile-nav-${item.label.toLowerCase().replace('İ', 'i')}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider hover:bg-white/10 text-left"
            data-testid="mobile-logout-btn"
          >
            <LogOut className="w-5 h-5" />
            ÇIKIŞ
          </button>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
          <div className="p-6 border-b border-white/20">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-10 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-xl font-bold uppercase">{company?.name}</h1>
            )}
            <p className="text-white/60 text-sm mt-1">Kurye Paneli</p>
            <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
          </div>
          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                  location.pathname === item.path
                    ? "bg-white/20 border-l-4 border-orange-500"
                    : "hover:bg-white/10"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace('İ', 'i')}`}
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
              className="w-full justify-start text-white hover:bg-white/10 uppercase font-bold text-xs tracking-wider"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              ÇIKIŞ YAP
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8">
          <Routes>
            <Route index element={<VardiyaPage />} />
            <Route path="muhasebe" element={<MuhasebePage />} />
            <Route path="zimmet" element={<ZimmetPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
