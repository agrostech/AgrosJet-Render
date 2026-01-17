import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft, ChevronRight, Settings } from "lucide-react";

export default function AdminSidebar({ 
  user, 
  company, 
  navItems, 
  sidebarCollapsed, 
  setSidebarCollapsed, 
  onProfileClick,
  onLogout 
}) {
  const location = useLocation();
  const isSuperAdmin = user?.role === "superadmin";

  return (
    <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
      <div className={`p-4 border-b border-white/20 ${sidebarCollapsed ? 'px-2' : ''}`}>
        {!sidebarCollapsed && (
          <>
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-8 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-lg font-bold truncate">{company?.name}</h1>
            )}
            <p className="text-white/60 text-xs mt-1">{isSuperAdmin ? "Süper Admin" : "Admin"}</p>
            <p className="text-white/80 text-xs font-mono mt-1 truncate">{user?.name}</p>
          </>
        )}
      </div>
      
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <Link 
            key={item.path} 
            to={item.path} 
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"} ${sidebarCollapsed ? 'justify-center px-2' : ''}`} 
            data-testid={`admin-nav-${item.key}`}
            title={sidebarCollapsed ? item.label : ''}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}
      </nav>
      
      <div className="border-t border-white/20">
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
