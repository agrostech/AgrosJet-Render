import { useState, useEffect, useCallback } from "react";
import { useNavigate, Routes, Route, Link, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, FileText, ShoppingBag, GraduationCap, Bike, MoreHorizontal, ClipboardList } from "lucide-react";
import CourierSidebar from "@/components/courier/CourierSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Page components
import CourierVardiyalarPage from "./courier/CourierVardiyalarPage";
import CourierMuhasebePage from "./courier/CourierMuhasebePage";
import CourierZimmetPage from "./courier/CourierZimmetPage";
import CourierEvraklarPage from "./courier/CourierEvraklarPage";
import CourierMotosikletimPage from "./courier/CourierMotosikletimPage";
import CourierJetPuanPage from "./courier/CourierJetPuanPage";
import CourierAkademiPage from "./courier/CourierAkademiPage";
import CourierSiparisPage from "./courier/CourierSiparisPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Yeni sıralama
const BASE_NAV_ITEMS = [
  { path: "/courier", label: "Siparişler", icon: ClipboardList, key: "siparis" },
  { path: "/courier/vardiyalar", label: "Vardiyalarım", icon: Clock, key: "vardiya" },
  { path: "/courier/muhasebe", label: "Muhasebe", icon: Calculator, key: "muhasebe" },
  { path: "/courier/zimmet", label: "Zimmetlerim", icon: Package, key: "zimmet" },
  { path: "/courier/motosikletim", label: "Motosikletim", icon: Bike, key: "motosikletim" },
  { path: "/courier/akademi", label: "Akademi", icon: GraduationCap, key: "akademi" },
  { path: "/courier/jetpuan", label: "Market", icon: ShoppingBag, key: "jetpuan" },
  { path: "/courier/evraklar", label: "Evraklar", icon: FileText, key: "evraklar" },
];

// Mobil menüde gösterilecek maksimum sekme sayısı
const MOBILE_NAV_LIMIT = 6;

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [documentsComplete, setDocumentsComplete] = useState(true);
  const [maintenanceNotifications, setMaintenanceNotifications] = useState(0);
  const [navItems, setNavItems] = useState(BASE_NAV_ITEMS);

  // Fetch document status
  const checkDocumentStatus = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/documents/courier/${courierId}/status`);
      setDocumentsComplete(res.data.all_complete);
    } catch (err) {
      console.error("Evrak durumu alınamadı", err);
    }
  }, []);

  // Fetch maintenance notifications
  const checkMaintenanceNotifications = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/motorcycles/notifications/${courierId}/active`);
      setMaintenanceNotifications(res.data.total_count || 0);
    } catch (err) {
      console.error("Bakım bildirimleri alınamadı", err);
    }
  }, []);

  // Fetch company name and logo
  const fetchCompanyInfo = useCallback(async (companyId) => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyName(res.data.name);
      setCompanyLogo(res.data.logo_url || "");
    } catch (err) {
      console.error("Şirket bilgisi alınamadı", err);
    }
  }, []);

  // Check if courier is deactivated (forced logout)
  const checkCourierStatus = useCallback(async (courierId, companyId) => {
    try {
      const res = await axios.get(`${API}/auth/courier/${courierId}/check-status?company_id=${companyId}`);
      if (res.data.should_logout) {
        // Pasife alınmış, logout yap
        localStorage.removeItem("user");
        navigate("/login", { state: { message: res.data.reason || "Hesabınız pasif durumda" } });
      }
    } catch (err) {
      // Sessizce devam et
    }
  }, [navigate]);

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
    
    // Fetch additional data
    if (parsed.company_id) {
      fetchCompanyInfo(parsed.company_id);
    }
    if (parsed.id) {
      checkDocumentStatus(parsed.id);
      checkMaintenanceNotifications(parsed.id);
      
      // İlk kontrol
      checkCourierStatus(parsed.id, parsed.company_id);
      
      // Her 30 saniyede bir pasif durumunu kontrol et
      const intervalId = setInterval(() => {
        checkCourierStatus(parsed.id, parsed.company_id);
      }, 30000);
      
      return () => clearInterval(intervalId);
    }
  }, [navigate, fetchCompanyInfo, checkDocumentStatus, checkMaintenanceNotifications, checkCourierStatus]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {companyLogo ? (
            <img 
              src={companyLogo} 
              alt={companyName} 
              className="w-8 h-8 rounded-full object-cover bg-white"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : null}
          <div>
            <span className="font-heading text-base font-bold block leading-tight">{user.name}</span>
            {companyName && <span className="text-[10px] text-white/70">{companyName}</span>}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          className="text-white hover:bg-white/10"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Navigation - Grid Layout with overflow menu */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20 p-3">
          <div className="grid grid-cols-3 gap-2">
            {/* İlk 5 sekme */}
            {navItems.slice(0, MOBILE_NAV_LIMIT - 1).map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setMobileMenuOpen(false)} 
                className={`relative flex flex-col items-center justify-center p-3 rounded-lg text-center ${
                  location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {item.path === "/courier/motosikletim" && maintenanceNotifications > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-white text-primary text-[9px] font-bold rounded-full flex items-center justify-center">
                    {maintenanceNotifications}
                  </span>
                )}
              </Link>
            ))}
            
            {/* Diğer sekmeler için dropdown */}
            {navItems.length > MOBILE_NAV_LIMIT - 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`relative flex flex-col items-center justify-center p-3 rounded-lg text-center hover:bg-white/10 ${
                      navItems.slice(MOBILE_NAV_LIMIT - 1).some(item => location.pathname === item.path) ? "bg-white/20" : ""
                    }`}
                  >
                    <MoreHorizontal className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium leading-tight">Diğer</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {navItems.slice(MOBILE_NAV_LIMIT - 1).map((item) => (
                    <DropdownMenuItem key={item.path} asChild>
                      <Link 
                        to={item.path} 
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2 ${
                          location.pathname === item.path ? "bg-accent" : ""
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2 text-xs font-semibold bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <CourierSidebar
          user={user}
          navItems={navItems}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          onLogout={handleLogout}
          companyName={companyName}
          companyLogo={companyLogo}
          maintenanceNotifications={maintenanceNotifications}
        />

        {/* Main Content */}
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'
        }`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<CourierVardiyalarPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="muhasebe" element={<CourierMuhasebePage courierId={user.id} courierName={user.name} companyId={user.company_id} />} />
              <Route path="zimmet" element={<CourierZimmetPage courierId={user.id} />} />
              <Route path="motosikletim" element={<CourierMotosikletimPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="jetpuan" element={<CourierJetPuanPage courierId={user.id} />} />
              <Route path="akademi" element={<CourierAkademiPage companyId={user.company_id} />} />
              <Route path="evraklar" element={
                <CourierEvraklarPage 
                  courierId={user.id} 
                  companyId={user.company_id} 
                  companyName={companyName}
                />
              } />
            </Routes>
          </div>
          
          {/* Footer */}
          <footer className="bg-white border-t py-3 text-center text-xs text-muted-foreground">
            © 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.
          </footer>
        </main>
      </div>
    </div>
  );
}
