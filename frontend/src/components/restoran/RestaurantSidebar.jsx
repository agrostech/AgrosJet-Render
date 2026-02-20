import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function RestaurantSidebar({ 
  user, 
  restaurant,
  navItems, 
  onLogout,
  badges = {}
}) {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white z-40 w-48">
      <div className="p-3 border-b border-white/20 flex-shrink-0">
        <h1 className="font-heading text-base font-bold truncate">{restaurant?.name || "Restoran"}</h1>
        <p className="text-white/60 text-xs mt-0.5">Restoran Paneli</p>
        <p className="text-white/80 text-xs font-mono mt-0.5 truncate">Kullanıcı: {user?.name}</p>
      </div>
      
      <nav className="flex-1 py-2 overflow-y-auto min-h-0">
        {navItems.map((item) => (
          <Link 
            key={item.path} 
            to={item.path} 
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors relative ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"}`} 
            data-testid={`restaurant-nav-${item.key}`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
            {badges[item.key] > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center ml-auto">
                {badges[item.key] > 99 ? '99+' : badges[item.key]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      
      <div className="border-t border-white/20 flex-shrink-0">
        <Button 
          variant="ghost" 
          onClick={onLogout} 
          className="w-full text-white hover:bg-white/10 font-semibold text-sm py-2 justify-start px-3" 
          data-testid="restaurant-logout-btn"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="ml-2">Çıkış Yap</span>
        </Button>
      </div>
    </aside>
  );
}
