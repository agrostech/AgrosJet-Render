import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, Users, UserCog, SlidersHorizontal, ShoppingBag, GraduationCap, User, Building2, Store, ClipboardList, Coins, AlertTriangle, Moon, Sun, BarChart3 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

// Page components
import VardiyaPage from "./VardiyaPage";
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
import RaporlarPage from "./admin/RaporlarPage";

// UI components
import AdminSidebar from "@/components/admin/AdminSidebar";
import ProfileModal from "@/components/admin/ProfileModal";
import CompanySwitcher from "@/components/admin/CompanySwitcher";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [badges, setBadges] = useState({});
  
  // Admin aktiflik durumu
  const [adminStatus, setAdminStatus] = useState("offline");
  const [linkedCourierStatus, setLinkedCourierStatus] = useState("offline");
  const [hasLinkedCourier, setHasLinkedCourier] = useState(false);
  
  // Multi-company state
  const [activeCompanyId, setActiveCompanyId] = useState(null);
  const [accessibleCompanies, setAccessibleCompanies] = useState([]);
  
  // Kontör durumu
  const [creditInfo, setCreditInfo] = useState({ credits: null, unlimited: false, allowed: true });

  // Fetch admin status
  const fetchAdminStatus = useCallback(async (adminId) => {
    if (!adminId) return;
    try {
      const res = await axios.get(`${API}/admins/${adminId}/status`);
      setAdminStatus(res.data.availability_status || "offline");
      setHasLinkedCourier(!!res.data.linked_courier_id);
      setLinkedCourierStatus(res.data.linked_courier_status || "offline");
    } catch (err) {
      console.error("Admin status fetch error:", err);
    }
  }, []);

  // Toggle admin status
  const handleToggleAdminStatus = async () => {
    if (!user?.id) return;
    try {
      const res = await axios.post(`${API}/admins/${user.id}/toggle-status`);
      setAdminStatus(res.data.new_status);
      toast.success(res.data.new_status === "active" ? "Aktif oldunuz" : "Pasif oldunuz");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum değiştirilemedi");
    }
  };

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

  // Kontör bilgisini çek
  const fetchCreditInfo = useCallback(async () => {
    try {
      const companyId = activeCompanyId;
      if (!companyId) return;
      
      const res = await axios.get(`${API}/credits/company/${companyId}/access`);
      setCreditInfo({
        credits: res.data.credits,
        unlimited: res.data.unlimited,
        allowed: res.data.allowed
      });
    } catch (err) {
      console.error("Credit info fetch error:", err);
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
    
    // Refresh badges and credit info for new company
    setTimeout(() => {
      fetchBadges();
      fetchCreditInfo();
    }, 100);
  }, [accessibleCompanies, fetchBadges, fetchCreditInfo]);

  useEffect(() => {
    // Check for company impersonate token
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateToken = urlParams.get("impersonate_token");
    
    if (impersonateToken) {
      // Verify impersonate token
      axios.get(`${API}/restaurant-users/company-impersonate-verify/${impersonateToken}`)
        .then(res => {
          const userData = res.data;
          localStorage.setItem("user", JSON.stringify(userData));
          setUser(userData);
          const companies = userData.accessible_companies || [];
          if (companies.length > 0) setAccessibleCompanies(companies);
          setActiveCompanyId(userData.company_id);
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => {
          navigate("/login");
        });
      return;
    }

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
    
    // Fetch admin status
    fetchAdminStatus(parsed.id);
    
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
    const permInterval = setInterval(checkPermissionUpdate, 5000);
    
    // Fetch badges initially and every 30 seconds
    fetchBadges();
    const badgeInterval = setInterval(fetchBadges, 30000);
    
    // Fetch credit info initially and every 60 seconds
    fetchCreditInfo();
    const creditInterval = setInterval(fetchCreditInfo, 60000);
    
    // Listen for badge refresh events
    const handleBadgeRefresh = () => fetchBadges();
    window.addEventListener('refreshBadges', handleBadgeRefresh);
    
    return () => {
      clearInterval(permInterval);
      clearInterval(badgeInterval);
      clearInterval(creditInterval);
      window.removeEventListener('refreshBadges', handleBadgeRefresh);
    };
  }, [navigate, fetchBadges, fetchCreditInfo]);

  // activeCompanyId değişince kontör bilgisini güncelle
  useEffect(() => {
    if (activeCompanyId) {
      fetchCreditInfo();
    }
  }, [activeCompanyId, fetchCreditInfo]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  // Kontör erişim kontrolü
  if (!creditInfo.allowed && !creditInfo.unlimited) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Erişim Kısıtlandı</h1>
          <p className="text-slate-600 mb-6">
            Yetersiz bakiye sebebiyle yönetim paneli erişiminiz kısıtlandı. 
            Bu süreçte operasyon sistem tarafından otomatik yürütülecektir.
          </p>
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-600 mb-2">Bakiye yüklemek için lütfen AgrosJet ile iletişime geçin:</p>
            <a href="tel:05393236232" className="text-lg font-bold text-primary hover:underline">
              0539 323 62 32
            </a>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user.role === "superadmin" || user.is_super_admin === true;
  const permissions = user.permissions || {};
  const company = user.company;

  // Menü öğeleri - sayfa bazlı izin kontrolü
  const allNavItems = [
    { path: "/admin", label: "Sipariş Yönetimi", icon: ClipboardList, key: "siparisler", permKey: null },
    { path: "/admin/vardiyalar", label: "Vardiya Yönetimi", icon: Clock, key: "vardiya", permKey: "vardiya" },
    { path: "/admin/muhasebe", label: "Muhasebe", icon: Calculator, key: "muhasebe", permKey: "muhasebe" },
    { path: "/admin/raporlar", label: "Raporlar", icon: BarChart3, key: "raporlar", permKey: "raporlar" },
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
    if (!item.permKey) return true; // Sipariş Yönetimi herkese açık
    if (isSuperAdmin) return true; // Superadmin her şeyi görür
    if (item.permKey === "yoneticiler") return false; // Yöneticiler sadece superadmin
    // Restoranlar tüm adminlere açık
    if (item.permKey === "restoranlar") return true;
    return permissions[item.permKey] === true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" data-testid="admin-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-slate-900 text-white p-3 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          className="text-white hover:bg-white/10 flex-shrink-0" 
          data-testid="admin-mobile-menu-btn"
        >
          <Menu className="w-6 h-6" />
        </Button>
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
          {/* Company Switcher for mobile - shows if multiple companies */}
          {accessibleCompanies.length > 1 ? (
            <CompanySwitcher
              companies={accessibleCompanies}
              currentCompanyId={activeCompanyId}
              onSwitch={handleCompanySwitch}
              collapsed={false}
            />
          ) : (
            // Single company - show logo and name together
            <div className="flex items-center gap-2">
              {(company?.logo_dark || company?.logo_url) && (
                <img src={company.logo_dark || company.logo_url} alt={company.name} className="h-12 object-contain" />
              )}
              <span className="font-heading text-sm font-bold truncate">{company?.name}</span>
            </div>
          )}
        </div>
        {/* Kontör Gösterimi */}
        <div className="flex items-center gap-2">
          {creditInfo.unlimited ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 rounded-md">
              <Coins className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-600">Sınırsız</span>
            </div>
          ) : creditInfo.credits !== null && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
              creditInfo.credits < 100 ? 'bg-red-100' : 
              creditInfo.credits < 500 ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              <Coins className={`w-4 h-4 ${
                creditInfo.credits < 100 ? 'text-red-600' : 
                creditInfo.credits < 500 ? 'text-orange-500' : 'text-green-600'
              }`} />
              <span className={`text-xs font-semibold ${
                creditInfo.credits < 100 ? 'text-red-600' : 
                creditInfo.credits < 500 ? 'text-orange-500' : 'text-green-600'
              }`}>
                {creditInfo.credits.toLocaleString('tr-TR')}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Sidebar - Slide from left like courier panel */}
      <div 
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Overlay */}
        <div 
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        />
        
        {/* Sidebar */}
        <nav 
          className={`absolute left-0 top-0 h-full w-64 bg-slate-900 text-white transform transition-transform duration-300 flex flex-col ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-white/20 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {(company?.logo_dark || company?.logo_url) && (
                <img 
                  src={company.logo_dark || company.logo_url} 
                  alt={company.name} 
                  className="w-14 h-14 rounded object-contain bg-white/10 p-1"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0">
                <span className="font-heading text-sm font-bold block leading-tight truncate">{company?.name}</span>
                <span className="text-[10px] text-white/70">{user?.name} • {isSuperAdmin ? "Süper Admin" : "Admin"}</span>
              </div>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 hover:bg-white/10 rounded flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Menu Items */}
          <div className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setMobileMenuOpen(false)} 
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                  location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
                {badges[item.key] > 0 && (
                  <span className="ml-auto w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badges[item.key] > 99 ? '99+' : badges[item.key]}
                  </span>
                )}
              </Link>
            ))}
          </div>
          
          {/* Bottom section */}
          <div className="p-3 border-t border-white/20 space-y-2">
            <button 
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              data-testid="mobile-dark-mode-toggle"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}
            </button>
            <button 
              onClick={() => {
                setMobileMenuOpen(false);
                setShowProfileModal(true);
              }} 
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              data-testid="admin-mobile-profile-btn"
            >
              <User className="w-4 h-4" />
              Profil Ayarları
            </button>
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors" 
              data-testid="admin-mobile-logout-btn"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          </div>
        </nav>
      </div>

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
          adminStatus={adminStatus}
          onToggleStatus={handleToggleAdminStatus}
          hasLinkedCourier={hasLinkedCourier}
          creditInfo={creditInfo}
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
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              {/* Sipariş Yönetimi varsayılan sayfa */}
              <Route index element={<SiparisYonetimiPage companyId={activeCompanyId} adminName={user.name || user.username} isSuperAdmin={isSuperAdmin} adminStatus={adminStatus} linkedCourierStatus={linkedCourierStatus} />} />
              <Route path="siparis-yonetimi" element={<SiparisYonetimiPage companyId={activeCompanyId} adminName={user.name || user.username} isSuperAdmin={isSuperAdmin} adminStatus={adminStatus} linkedCourierStatus={linkedCourierStatus} />} />
              <Route path="gecmis-siparisler" element={<GecmisSiparislerPage companyId={activeCompanyId} isSuperAdmin={isSuperAdmin} adminName={user.name || user.username} />} />
              <Route path="iptal-siparisler" element={<IptalSiparislerPage companyId={activeCompanyId} isSuperAdmin={isSuperAdmin} />} />
              <Route path="restoranlar" element={<RestoranlarPage companyId={activeCompanyId} />} />
              {(isSuperAdmin || permissions.vardiya) && (
                <Route path="vardiyalar" element={<VardiyaPage companyId={activeCompanyId} />} />
              )}
              {(isSuperAdmin || permissions.muhasebe) && (
                <Route path="muhasebe" element={<MuhasebePage companyId={activeCompanyId} adminId={user.id} adminName={user.name || user.username} companyLogo={company?.logo_dark || company?.logo_url} companyName={company?.name} isSuperAdmin={isSuperAdmin} />} />
              )}
              {(isSuperAdmin || permissions.raporlar) && (
                <Route path="raporlar" element={<RaporlarPage companyId={activeCompanyId} isSuperAdmin={isSuperAdmin} />} />
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
          <footer className="bg-white dark:bg-slate-800 border-t dark:border-slate-700 py-3 text-center text-xs text-muted-foreground">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
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
