import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft, ChevronRight, User } from "lucide-react";

export default function CourierSidebar({ 
  user, 
  navItems, 
  sidebarCollapsed, 
  setSidebarCollapsed, 
  onLogout 
}) {
  const location = useLocation();

  return (
    <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
      <div className={`p-4 border-b border-white/20 ${sidebarCollapsed ? 'px-2' : ''}`}>
        {!sidebarCollapsed && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
              <h1 className="font-heading text-lg font-bold truncate">{user?.name}</h1>
            </div>
            <p className="text-white/60 text-xs">Kurye Paneli</p>
          </>
        )}
        {sidebarCollapsed && (
          <div className="w-10 h-10 mx-auto rounded-lg bg-white/20 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
        )}
      </div>
      
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/courier" && location.pathname.startsWith(item.path));
          return (
            <Link 
              key={item.path} 
              to={item.path} 
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"
              } ${sidebarCollapsed ? 'justify-center px-2' : ''}`} 
              data-testid={`courier-nav-${item.label.toLowerCase()}`}
              title={sidebarCollapsed ? item.label : ''}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      
      <div className="border-t border-white/20">
        <Button 
          variant="ghost" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
          className={`w-full justify-center text-white hover:bg-white/10 py-2 ${sidebarCollapsed ? '' : 'justify-end pr-4'}`}
          data-testid="courier-sidebar-toggle-btn"
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
        <Button 
          variant="ghost" 
          onClick={onLogout} 
          className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
          data-testid="courier-logout-btn"
          title={sidebarCollapsed ? 'Çıkış Yap' : ''}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span className="ml-2">Çıkış Yap</span>}
        </Button>
      </div>
    </aside>
  );
}
