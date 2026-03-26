import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function RestaurantSidebar({ 
  user, 
  restaurant,
  navItems, 
  onLogout,
  badges = {},
  companyLogo = null
}) {
  const location = useLocation();

  return (
    <header className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-primary text-white z-40 items-center px-4 shadow-lg">
      {/* Sol: Logo + Restoran Adı */}
      <div className="flex items-center gap-3 min-w-0">
        {companyLogo && (
          <>
            <img 
              src={companyLogo} 
              alt="Şirket" 
              className="h-10 object-contain"
            />
            <div className="w-px h-8 bg-white/30" />
          </>
        )}
        <div className="min-w-0">
          <h1 className="font-heading text-sm font-bold truncate">{restaurant?.name || "Restoran"}</h1>
          <p className="text-white/60 text-xs">Restoran Paneli</p>
        </div>
      </div>

      {/* Orta: Menü */}
      <nav className="flex-1 flex items-center justify-center gap-1">
        {navItems.filter(item => !item.hidden).map((item) => (
          <Link 
            key={item.path} 
            to={item.path} 
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors relative ${location.pathname === item.path || (item.key === 'anasayfa' && ['/restoran', '/restoran/gecmis-siparisler', '/restoran/iptal-siparisler'].includes(location.pathname)) ? "bg-white/20" : "hover:bg-white/10"}`} 
            data-testid={`restaurant-nav-${item.key}`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
            {badges[item.key] > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                {badges[item.key] > 99 ? '99+' : badges[item.key]}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Sağ: Kullanıcı + Çıkış */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-white/60 text-xs">Kullanıcı</p>
        </div>
        <div className="w-px h-8 bg-white/30" />
        <Button 
          variant="ghost" 
          onClick={onLogout} 
          className="text-white hover:bg-white/10 p-2" 
          data-testid="restaurant-logout-btn"
          title="Çıkış Yap"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
