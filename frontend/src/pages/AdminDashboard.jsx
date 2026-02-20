import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, Users, UserCog, LayoutDashboard, SlidersHorizontal, ShoppingBag, GraduationCap, User, MoreHorizontal, ChevronDown, Building2, Store, ClipboardList } from "lucide-react";

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
import RestoranlarPage from "./admin/RestoranlarPage";
import SiparisYonetimiPage from "./admin/SiparisYonetimiPage";
import GecmisSiparislerPage from "./admin/GecmisSiparislerPage";
import IptalSiparislerPage from "./admin/IptalSiparislerPage";

// UI components
import AdminSidebar from "@/components/admin/AdminSidebar";
import ProfileModal from "@/components/admin/ProfileModal";
import CompanySwitcher from "@/components/admin/CompanySwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [badges, setBadges] = useState({});
  
  // Multi-company state
  const [activeCompanyId, setActiveCompanyId] = useState(null);
  const [accessibleCompanies, setAccessibleCompanies] = useState([]);

  // Fetch pending orders count for badge
  const fetchBadges = useCallback(async () => {
    try {
      const companyId = activeCompanyId;
      if (!companyId) return;
      
      const params = `?company_id=${companyId}`;
      const res = await axios.get(`${API}/jetpuan/orders/pending-count${params}`);
      setBadges(prev => ({ ...prev, jetpuan: res.data.count }));
    } catch (err) {
      console.error("Badge fetch error:", err);
    }
  }, [activeCompanyId]);

  // Handle company switch
  const handleCompanySwitch = useCallback((newCompanyId) => {
    const newCompany = accessibleCompanies.find(c => c.id === newCompanyId);
    if (!newCompany) return;

    setActiveCompanyId(newCompanyId);
    
    // Update localStorage
    const stored = localStorage.getItem("user");
    if (stored) {
      const userData = JSON.parse(stored);
      userData.company_id = newCompanyId;
      userData.company = newCompany;
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
    }
    
    toast.success(`${newCompany.name} şirketine geçildi`);
    
    // Refresh badges for new company
    setTimeout(() => fetchBadges(), 100);
  }, [accessibleCompanies, fetchBadges]);

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
    
    // Set accessible companies and active company
    const companies = parsed.accessible_companies || [];
    if (companies.length > 0) {
      setAccessibleCompanies(companies);
    } else if (parsed.company) {
      // Fallback: single company
      setAccessibleCompanies([parsed.company]);
    }
    setActiveCompanyId(parsed.company_id);
    
    // İzin güncelleme kontrolü (sadece admin için, superadmin hariç)
    const checkPermissionUpdate = async () => {
      if (parsed.role === "superadmin") return;
      
      try {
        const savedTimestamp = parsed.permissions_updated_at;
        // Timestamp yoksa kontrol yapma (henüz izin güncellenmemiş)
        if (!savedTimestamp) return;
        
        const encodedTimestamp = encodeURIComponent(savedTimestamp);
        const res = await axios.get(`${API}/auth/check-permissions/${parsed.id}?timestamp=${encodedTimestamp}`);
        
        if (res.data.updated) {
          toast.warning("İzinleriniz güncellendi. Yeniden giriş yapmanız gerekiyor.");
          localStorage.removeItem("user");
          setTimeout(() => navigate("/login"), 1500);
        }
      } catch (err) {
        console.error("Permission check error:", err);
      }
    };
    
    // İlk kontrol ve her 10 saniyede bir kontrol
    checkPermissionUpdate();
    const permInterval = setInterval(checkPermissionUpdate, 10000);
    
    // Fetch badges initially and every 30 seconds
    fetchBadges();
    const badgeInterval = setInterval(fetchBadges, 30000);
    
    // Listen for badge refresh events
    const handleBadgeRefresh = () => fetchBadges();
    window.addEventListener('refreshBadges', handleBadgeRefresh);
    
    return () => {
      clearInterval(permInterval);
      clearInterval(badgeInterval);
      window.removeEventListener('refreshBadges', handleBadgeRefresh);
    };
  }, [navigate, fetchBadges]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin" || user.is_super_admin === true;
  const permissions = user.permissions || {};
  const company = user.company;

  // Menü öğeleri - sayfa bazlı izin kontrolü
  const allNavItems = [
    { path: "/admin", label: "Sipariş Yönetimi", icon: ClipboardList, key: "siparisler", permKey: null },
    { path: "/admin/guncel-durum", label: "Güncel Durum", icon: LayoutDashboard, key: "guncel", permKey: null },
    { path: "/admin/vardiyalar", label: "Vardiyalar", icon: Clock, key: "vardiya", permKey: "vardiya" },
    { path: "/admin/muhasebe", label: "Muhasebe", icon: Calculator, key: "muhasebe", permKey: "muhasebe" },
    { path: "/admin/zimmet", label: "Zimmet", icon: Package, key: "zimmet", permKey: "zimmet" },
    { path: "/admin/jetpuan", label: "Market", icon: ShoppingBag, key: "jetpuan", permKey: "market" },
    { path: "/admin/akademi", label: "Akademi", icon: GraduationCap, key: "akademi", permKey: "akademi" },
    { path: "/admin/kuryeler", label: "Kuryeler", icon: Users, key: "kuryeler", permKey: "kuryeler" },
    { path: "/admin/restoranlar", label: "Restoranlar", icon: Store, key: "restoranlar", permKey: "restoranlar" },
    { path: "/admin/yoneticiler", label: "Yöneticiler", icon: UserCog, key: "yoneticiler", permKey: "yoneticiler" },
    { path: "/admin/sistem", label: "Sistem", icon: SlidersHorizontal, key: "sistem", permKey: "sistem" },
  ];

  // İzin kontrolü ile filtreleme
  const NAV_ITEMS = allNavItems.filter((item) => {
    if (!item.permKey) return true; // Sipariş Yönetimi ve Güncel Durum herkese açık
    if (isSuperAdmin) return true; // Superadmin her şeyi görür
    if (item.permKey === "yoneticiler") return false; // Yöneticiler sadece superadmin
    // Restoranlar tüm adminlere açık
    if (item.permKey === "restoranlar") return true;
    return permissions[item.permKey] === true;
  });

  // Mevcut sayfanın başlığını al
  const getCurrentPageTitle = () => {
    const item = NAV_ITEMS.find(n => n.path === location.pathname);
    if (item) return item.label;
    // Alt sayfalarda kontrol
    if (location.pathname.includes('/admin/gecmis-siparisler')) return 'Geçmiş Siparişler';
    if (location.pathname.includes('/admin/iptal-siparisler')) return 'İptal Siparişler';
    return 'Sipariş Yönetimi';
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-dashboard">
      {/* Desktop Top Bar */}
      <header className="hidden lg:flex fixed top-0 right-0 left-0 h-14 bg-white border-b shadow-sm z-30 items-center px-6" style={{ marginLeft: sidebarCollapsed ? '4rem' : '14rem' }}>
        {/* Sol: Sayfa başlığı */}
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">{getCurrentPageTitle()}</h1>
        </div>
        
        {/* Orta: Şirket logosu */}
        <div className="flex items-center justify-center">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-9 object-contain" />
          ) : (
            <span className="font-heading text-lg font-semibold text-slate-700">{company?.name}</span>
          )}
        </div>
        
        {/* Sağ: Boş alan (dengelemek için) */}
        <div className="flex-1" />
      </header>

      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Company Switcher for mobile - shows if multiple companies */}
          {accessibleCompanies.length > 1 ? (
            <CompanySwitcher
              companies={accessibleCompanies}
              currentCompanyId={activeCompanyId}
              onSwitch={handleCompanySwitch}
              collapsed={false}
            />
          ) : (
            // Single company - just show logo/name
            company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
            ) : (
              <span className="font-heading text-lg font-bold truncate">{company?.name}</span>
            )
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10 flex-shrink-0" data-testid="admin-mobile-menu-btn">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Navigation - Grid Layout with More Menu */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20 p-3">
          {/* First 7 items + More button in 2 rows */}
          <div className="grid grid-cols-4 gap-2">
            {NAV_ITEMS.slice(0, 7).map((item) => (
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
            
            {/* More button if there are more than 7 items */}
            {NAV_ITEMS.length > 7 && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMoreOpen(!mobileMoreOpen);
                }}
                className={`flex flex-col items-center justify-center p-2 rounded-lg text-center transition-colors ${
                  mobileMoreOpen ? "bg-white/30" : "hover:bg-white/10"
                }`}
              >
                <MoreHorizontal className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium leading-tight">Diğer</span>
              </button>
            )}
          </div>
          
          {/* Expanded More Menu */}
          {mobileMoreOpen && NAV_ITEMS.length > 7 && (
            <div className="mt-2 pt-2 border-t border-white/20">
              <div className="grid grid-cols-4 gap-2">
                {NAV_ITEMS.slice(7).map((item) => (
                  <Link 
                    key={item.path} 
                    to={item.path} 
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileMoreOpen(false);
                    }} 
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-center relative bg-white/10 ${
                      location.pathname === item.path ? "bg-white/30 ring-2 ring-white/50" : "hover:bg-white/20"
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
            </div>
          )}
          
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
          companySwitcher={
            accessibleCompanies.length > 1 ? (
              <CompanySwitcher
                companies={accessibleCompanies}
                currentCompanyId={activeCompanyId}
                onSwitch={handleCompanySwitch}
                collapsed={sidebarCollapsed}
              />
            ) : null
          }
        />

        {/* Main Content */}
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'} lg:mt-14`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              {/* Sipariş Yönetimi varsayılan sayfa */}
              <Route index element={<SiparisYonetimiPage companyId={activeCompanyId} adminName={user.name || user.username} isSuperAdmin={isSuperAdmin} />} />
              <Route path="siparis-yonetimi" element={<SiparisYonetimiPage companyId={activeCompanyId} adminName={user.name || user.username} isSuperAdmin={isSuperAdmin} />} />
              <Route path="gecmis-siparisler" element={<GecmisSiparislerPage companyId={activeCompanyId} isSuperAdmin={isSuperAdmin} adminName={user.name || user.username} />} />
              <Route path="iptal-siparisler" element={<IptalSiparislerPage companyId={activeCompanyId} isSuperAdmin={isSuperAdmin} />} />
              <Route path="guncel-durum" element={<GuncelDurumPage companyId={activeCompanyId} />} />
              <Route path="restoranlar" element={<RestoranlarPage companyId={activeCompanyId} />} />
              {(isSuperAdmin || permissions.vardiya) && (
                <Route path="vardiyalar" element={<VardiyaPage companyId={activeCompanyId} />} />
              )}
              {(isSuperAdmin || permissions.muhasebe) && (
                <Route path="muhasebe" element={<MuhasebePage companyId={activeCompanyId} adminId={user.id} adminName={user.name || user.username} companyLogo={company?.logo_url} companyName={company?.name} isSuperAdmin={isSuperAdmin} />} />
              )}
              {(isSuperAdmin || permissions.zimmet) && (
                <Route path="zimmet" element={<ZimmetPage />} />
              )}
              {(isSuperAdmin || permissions.market) && (
                <Route path="jetpuan" element={<JetPuanMarketPage companyId={activeCompanyId} />} />
              )}
              {(isSuperAdmin || permissions.akademi) && (
                <Route path="akademi" element={<AkademiPage companyId={activeCompanyId} companyName={company?.name} />} />
              )}
              {(isSuperAdmin || permissions.kuryeler) && (
                <Route path="kuryeler" element={<KuryelerPage companyId={activeCompanyId} />} />
              )}
              {isSuperAdmin && (
                <Route path="yoneticiler" element={<YoneticilerPage companyId={activeCompanyId} />} />
              )}
              {(isSuperAdmin || permissions.sistem) && (
                <Route path="sistem" element={<SistemPage companyId={activeCompanyId} />} />
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
