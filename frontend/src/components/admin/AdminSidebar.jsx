import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft, ChevronRight, Settings, Power, Coins, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function AdminSidebar({ 
  user, 
  company, 
  navItems, 
  sidebarCollapsed, 
  setSidebarCollapsed, 
  onProfileClick,
  onLogout,
  badges = {},
  companySwitcher = null,
  adminStatus = "offline",
  onToggleStatus = null,
  hasLinkedCourier = false,
  creditInfo = { credits: null, unlimited: false }
}) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isSuperAdmin = user?.role === "superadmin";
  const isActive = adminStatus === "active";

  const getCreditColor = (credits, unlimited) => {
    if (unlimited) return { text: 'text-blue-400', bg: 'bg-blue-500/20' };
    if (credits < 100) return { text: 'text-red-400', bg: 'bg-red-500/20' };
    if (credits < 500) return { text: 'text-orange-400', bg: 'bg-orange-500/20' };
    return { text: 'text-green-400', bg: 'bg-green-500/20' };
  };

  return (
    <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
      <div className={`p-4 border-b border-white/20 ${sidebarCollapsed ? 'px-2 flex flex-col items-center' : ''}`}>
        {sidebarCollapsed ? (
          // Kapalı halde sadece logo ve kontör
          <>
            {company?.logo_url && (
              <img src={company.logo_url} alt={company.name} className="h-10 object-contain" />
            )}
            {/* Kontör - Kapalı */}
            {(creditInfo.unlimited || creditInfo.credits !== null) && (
              <div className={`mt-2 p-1.5 rounded ${getCreditColor(creditInfo.credits, creditInfo.unlimited).bg}`} title={creditInfo.unlimited ? 'Sınırsız Kontör' : `${creditInfo.credits} Kontör`}>
                <Coins className={`w-4 h-4 ${getCreditColor(creditInfo.credits, creditInfo.unlimited).text}`} />
              </div>
            )}
          </>
        ) : (
          <>
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-10 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-lg font-bold truncate">{company?.name}</h1>
            )}
            <p className="text-white/60 text-xs mt-1">{isSuperAdmin ? "Süper Admin" : "Admin"}</p>
            <p className="text-white/80 text-xs font-mono mt-1 truncate">{user?.name}</p>
            
            {/* Kontör - Açık */}
            {(creditInfo.unlimited || creditInfo.credits !== null) && (
              <div className={`mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md ${getCreditColor(creditInfo.credits, creditInfo.unlimited).bg}`}>
                <Coins className={`w-4 h-4 ${getCreditColor(creditInfo.credits, creditInfo.unlimited).text}`} />
                <span className={`text-xs font-semibold ${getCreditColor(creditInfo.credits, creditInfo.unlimited).text}`}>
                  {creditInfo.unlimited ? 'Sınırsız' : creditInfo.credits?.toLocaleString('tr-TR')}
                </span>
              </div>
            )}
          </>
        )}
      </div>
      
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <Link 
            key={item.path} 
            to={item.path} 
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors relative ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"} ${sidebarCollapsed ? 'justify-center px-2' : ''}`} 
            data-testid={`admin-nav-${item.key}`}
            title={sidebarCollapsed ? item.label : ''}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            {badges[item.key] > 0 && (
              <span className={`bg-orange-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center ${sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-auto'}`}>
                {badges[item.key] > 99 ? '99+' : badges[item.key]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      
      <div className="border-t border-white/20">
        {/* Admin Aktif/Pasif Toggle - sadece bağlı kurye varsa göster */}
        {hasLinkedCourier && onToggleStatus && (
          <div className={`border-b border-white/20 ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
            <Button 
              variant="ghost" 
              onClick={onToggleStatus}
              className={`w-full text-white font-semibold text-sm py-2 transition-colors ${
                isActive 
                  ? 'bg-green-500/30 hover:bg-green-500/40 border border-green-400' 
                  : 'hover:bg-white/10'
              } ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-3'}`}
              title={sidebarCollapsed ? (isActive ? 'Aktif - Tıkla pasif ol' : 'Pasif - Tıkla aktif ol') : ''}
            >
              <Power className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-green-400' : 'text-white/60'}`} />
              {!sidebarCollapsed && (
                <span className={`ml-2 ${isActive ? 'text-green-300' : ''}`}>
                  {isActive ? 'Aktif' : 'Pasif'}
                </span>
              )}
              {isActive && !sidebarCollapsed && (
                <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              )}
            </Button>
          </div>
        )}
        
        {/* Company Switcher - çıkış butonunun üstünde */}
        {companySwitcher && (
          <div className={`border-b border-white/20 ${sidebarCollapsed ? 'p-1' : 'p-2'}`}>
            {companySwitcher}
          </div>
        )}
        <Button 
          variant="ghost" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
          className={`w-full justify-center text-white hover:bg-white/10 py-2 ${sidebarCollapsed ? '' : 'justify-end pr-4'}`}
          data-testid="sidebar-toggle-btn"
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
        <Button 
          variant="ghost" 
          onClick={toggleTheme} 
          className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
          data-testid="dark-mode-toggle"
          title={sidebarCollapsed ? (theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod') : ''}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!sidebarCollapsed && <span className="ml-2">{theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}</span>}
        </Button>
        <Button 
          variant="ghost" 
          onClick={onProfileClick} 
          className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
          data-testid="profile-btn"
          title={sidebarCollapsed ? 'Profil Ayarları' : ''}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span className="ml-2">Profil Ayarları</span>}
        </Button>
        <Button 
          variant="ghost" 
          onClick={onLogout} 
          className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
          data-testid="admin-logout-btn"
          title={sidebarCollapsed ? 'Çıkış Yap' : ''}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span className="ml-2">Çıkış Yap</span>}
        </Button>
      </div>
    </aside>
  );
}
