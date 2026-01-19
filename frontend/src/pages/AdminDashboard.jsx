import { useState, useEffect, useCallback } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, Users, UserCog, LayoutDashboard, SlidersHorizontal, ShoppingBag, GraduationCap, User } from "lucide-react";
import { useSessionCheck } from "@/hooks/useSessionCheck";

// Page components
import VardiyaPage from "./VardiyaPage";
import GuncelDurumPage from "./GuncelDurumPage";
import MuhasebePage from "./MuhasebePage";
import ZimmetPage from "./ZimmetPage";
import KuryelerPage from "./admin/KuryelerPage";
import YoneticilerPage from "./admin/YoneticilerPage";
import SistemPage from "./SistemPage";
import JetPuanMarketPage from "./JetPuanMarketPage";
import AkademiPage from "./admin/AkademiPage";

// UI components
import AdminSidebar from "@/components/admin/AdminSidebar";
import ProfileModal from "@/components/admin/ProfileModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [badges, setBadges] = useState({});

  useSessionCheck();

  // Fetch pending orders count for badge
  const fetchBadges = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/pending-count`);
      setBadges(prev => ({ ...prev, jetpuan: res.data.count }));
    } catch (err) {
      console.error("Badge fetch error:", err);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== "admin" && parsed.role !== "superadmin") {
      navigate("/login");
      return;
    }
    setUser(parsed);
    
    // Fetch badges initially and every 30 seconds
    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    
    // Listen for badge refresh events
    const handleBadgeRefresh = () => fetchBadges();
    window.addEventListener('refreshBadges', handleBadgeRefresh);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshBadges', handleBadgeRefresh);
    };
  }, [navigate, fetchBadges]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";
  const permissions = user.permissions || {};
  const company = user.company;

  const NAV_ITEMS = [
    { path: "/admin", label: "Anasayfa", icon: LayoutDashboard, key: "guncel" },
    { path: "/admin/vardiyalar", label: "Vardiyalar", icon: Clock, key: "vardiya" },
    { path: "/admin/muhasebe", label: "Muhasebe", icon: Calculator, key: "muhasebe" },
    { path: "/admin/zimmet", label: "Zimmet", icon: Package, key: "zimmet" },
    { path: "/admin/jetpuan", label: "Market", icon: ShoppingBag, key: "jetpuan" },
    { path: "/admin/akademi", label: "Akademi", icon: GraduationCap, key: "akademi" },
    { path: "/admin/kuryeler", label: "Kuryeler", icon: Users, key: "kuryeler" },
    { path: "/admin/yoneticiler", label: "Yöneticiler", icon: UserCog, key: "yoneticiler" },
    { path: "/admin/sistem", label: "Sistem", icon: SlidersHorizontal, key: "sistem" },
  ].filter((item) => isSuperAdmin || permissions[item.key]);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
          ) : (
            <span className="font-heading text-lg font-bold">{company?.name}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10" data-testid="admin-mobile-menu-btn">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Navigation - Grid Layout */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20 p-3">
          <div className="grid grid-cols-4 gap-2">
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setMobileMenuOpen(false)} 
                className={`flex flex-col items-center justify-center p-2 rounded-lg text-center relative ${
                  location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {badges[item.key] > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center">
                    {badges[item.key] > 99 ? '99+' : badges[item.key]}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-white/20">
            <button 
              onClick={() => {
                setMobileMenuOpen(false);
                setShowProfileModal(true);
              }} 
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              data-testid="admin-mobile-profile-btn"
            >
              <User className="w-4 h-4" />
              Profil
            </button>
            <button 
              onClick={handleLogout} 
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors" 
              data-testid="admin-mobile-logout-btn"
            >
              <LogOut className="w-4 h-4" />
              Çıkış
            </button>
          </div>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <AdminSidebar
          user={user}
          company={company}
          navItems={NAV_ITEMS}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          onProfileClick={() => setShowProfileModal(true)}
          onLogout={handleLogout}
          badges={badges}
        />

        {/* Main Content */}
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<GuncelDurumPage companyId={user.company_id} />} />
              <Route path="vardiyalar" element={<VardiyaPage companyId={user.company_id} />} />
              <Route path="muhasebe" element={<MuhasebePage companyId={user.company_id} adminId={user.id} adminName={user.name || user.username} companyLogo={company?.logo_url} companyName={company?.name} />} />
              <Route path="zimmet" element={<ZimmetPage />} />
              <Route path="jetpuan" element={<JetPuanMarketPage companyId={user.company_id} />} />
              <Route path="akademi" element={<AkademiPage companyId={user.company_id} companyName={company?.name} />} />
              <Route path="kuryeler" element={<KuryelerPage companyId={user.company_id} />} />
              {(isSuperAdmin || permissions.yoneticiler) && (
                <Route path="yoneticiler" element={<YoneticilerPage companyId={user.company_id} />} />
              )}
              {(isSuperAdmin || permissions.sistem) && (
                <Route path="sistem" element={<SistemPage companyId={user.company_id} />} />
              )}
            </Routes>
          </div>
          
          {/* Footer */}
          <footer className="bg-white border-t py-3 text-center text-xs text-muted-foreground">
            © 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.
          </footer>
        </main>
      </div>

      {/* Profile Modal */}
      <ProfileModal 
        user={user} 
        open={showProfileModal} 
        onOpenChange={setShowProfileModal} 
      />
    </div>
  );
}
