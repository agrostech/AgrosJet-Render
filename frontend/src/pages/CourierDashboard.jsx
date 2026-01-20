import { useState, useEffect, useCallback } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, FileText, ShoppingBag, GraduationCap } from "lucide-react";
import CourierSidebar from "@/components/courier/CourierSidebar";

// Page components
import CourierVardiyalarPage from "./courier/CourierVardiyalarPage";
import CourierMuhasebePage from "./courier/CourierMuhasebePage";
import CourierZimmetPage from "./courier/CourierZimmetPage";
import CourierEvraklarPage from "./courier/CourierEvraklarPage";
import CourierJetPuanPage from "./courier/CourierJetPuanPage";
import CourierAkademiPage from "./courier/CourierAkademiPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BASE_NAV_ITEMS = [
  { path: "/courier", label: "Vardiyalarım", icon: Clock },
  { path: "/courier/muhasebe", label: "Muhasebe", icon: Calculator },
  { path: "/courier/zimmet", label: "Zimmetlerim", icon: Package },
  { path: "/courier/jetpuan", label: "Market", icon: ShoppingBag },
  { path: "/courier/akademi", label: "Akademi", icon: GraduationCap },
];

const EVRAKLAR_NAV_ITEM = { path: "/courier/evraklar", label: "Evraklar", icon: FileText };

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [documentsComplete, setDocumentsComplete] = useState(true);
  const [navItems, setNavItems] = useState(BASE_NAV_ITEMS);

  useSessionCheck();

  // Fetch document status
  const checkDocumentStatus = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/documents/courier/${courierId}/status`);
      const isComplete = res.data.all_complete;
      setDocumentsComplete(isComplete);
      
      // Update nav items based on document status
      if (!isComplete) {
        setNavItems([...BASE_NAV_ITEMS, EVRAKLAR_NAV_ITEM]);
      } else {
        setNavItems(BASE_NAV_ITEMS);
        // If user is on evraklar page and documents are complete, redirect
        if (location.pathname === "/courier/evraklar") {
          navigate("/courier");
        }
      }
    } catch (err) {
      console.error("Evrak durumu alınamadı", err);
    }
  }, [location.pathname, navigate]);

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
    }
  }, [navigate, fetchCompanyInfo, checkDocumentStatus]);

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

      {/* Mobile Navigation - Grid Layout */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20 p-3">
          <div className="grid grid-cols-3 gap-2">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setMobileMenuOpen(false)} 
                className={`flex flex-col items-center justify-center p-3 rounded-lg text-center ${
                  location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            ))}
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
