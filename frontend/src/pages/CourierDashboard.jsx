import { useState, useEffect } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, User } from "lucide-react";
import { useSessionCheck } from "@/hooks/useSessionCheck";

// Page components
import CourierVardiyalarPage from "./courier/CourierVardiyalarPage";
import CourierMuhasebePage from "./courier/CourierMuhasebePage";
import CourierZimmetPage from "./courier/CourierZimmetPage";

const NAV_ITEMS = [
  { path: "/courier", label: "Vardiyalarım", icon: Clock },
  { path: "/courier/muhasebe", label: "Muhasebe", icon: Calculator },
  { path: "/courier/zimmet", label: "Zimmetlerim", icon: Package },
];

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-heading text-lg font-bold">Kurye Paneli</span>
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

      {/* Mobile Navigation */}
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
          >
            <LogOut className="w-5 h-5" />
            Çıkış
          </button>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:flex flex-col fixed h-screen bg-white border-r-2 border-border transition-all duration-300 z-40 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}>
          {/* User Info */}
          <div className="p-4 border-b-2 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              {!sidebarCollapsed && (
                <div className="overflow-hidden">
                  <h2 className="font-heading font-bold text-sm truncate">{user.name}</h2>
                  <p className="text-xs text-muted-foreground">Kurye</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== "/courier" && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${
                    isActive 
                      ? 'bg-primary text-white' 
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="p-2 border-t-2 border-border space-y-1">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-all text-sm font-medium ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              <Menu className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>Daralt</span>}
            </button>
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-all text-sm font-medium ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>Çıkış</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 p-4 md:p-6 pb-16 overflow-x-auto transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'
        }`}>
          <Routes>
            <Route index element={<CourierVardiyalarPage courierId={user.id} companyId={user.company_id} />} />
            <Route path="muhasebe" element={<CourierMuhasebePage courierId={user.id} courierName={user.name} />} />
            <Route path="zimmet" element={<CourierZimmetPage courierId={user.id} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
