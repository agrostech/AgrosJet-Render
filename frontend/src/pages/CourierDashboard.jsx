import { useState, useEffect, useCallback } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, FileText } from "lucide-react";
import { useSessionCheck } from "@/hooks/useSessionCheck";
import CourierSidebar from "@/components/courier/CourierSidebar";

// Page components
import CourierVardiyalarPage from "./courier/CourierVardiyalarPage";
import CourierMuhasebePage from "./courier/CourierMuhasebePage";
import CourierZimmetPage from "./courier/CourierZimmetPage";
import CourierEvraklarPage from "./courier/CourierEvraklarPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BASE_NAV_ITEMS = [
  { path: "/courier", label: "Vardiyalarım", icon: Clock },
  { path: "/courier/muhasebe", label: "Muhasebe", icon: Calculator },
  { path: "/courier/zimmet", label: "Zimmetlerim", icon: Package },
];

const EVRAKLAR_NAV_ITEM = { path: "/courier/evraklar", label: "Evraklar", icon: FileText };

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyName, setCompanyName] = useState("");
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

  // Fetch company name
  const fetchCompanyName = useCallback(async (companyId) => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyName(res.data.name);
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
      fetchCompanyName(parsed.company_id);
    }
    if (parsed.id) {
      checkDocumentStatus(parsed.id);
    }
  }, [navigate, fetchCompanyName, checkDocumentStatus]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <span className="font-heading text-lg font-bold">{user.name}</span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          className="text-white hover:bg-white/10"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20">
          {navItems.map((item) => (
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
          >
            <LogOut className="w-5 h-5" />
            Çıkış
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
        />

        {/* Main Content */}
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'
        }`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<CourierVardiyalarPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="muhasebe" element={<CourierMuhasebePage courierId={user.id} courierName={user.name} />} />
              <Route path="zimmet" element={<CourierZimmetPage courierId={user.id} />} />
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
