import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut } from "lucide-react";

export default function RestaurantMobileNav({ 
  user, 
  restaurant,
  companyLogo,
  navItems, 
  onLogout,
  badges = {}
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-primary text-white flex items-center justify-between px-3 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 flex-shrink-0" data-testid="mobile-menu-btn">
            <Menu className="w-6 h-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-primary text-white border-none">
          <div className="p-4 border-b border-white/20">
            <div className="flex items-center gap-3">
              {companyLogo && (
                <img 
                  src={companyLogo} 
                  alt="Logo" 
                  className="w-7 h-7 rounded object-contain bg-white/10"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="font-heading text-base font-bold truncate">{restaurant?.name || "Restoran"}</h1>
                <p className="text-white/60 text-[11px]">Restoran Paneli</p>
              </div>
            </div>
            <p className="text-white/80 text-xs font-mono mt-2 truncate">{user?.name}</p>
          </div>
          
          <nav className="flex-1 py-2">
            {navItems.filter(item => !item.hidden).map((item) => (
              <Link 
                key={item.path} 
                to={item.path}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors relative ${location.pathname === item.path || (item.key === 'anasayfa' && ['/restoran', '/restoran/gecmis-siparisler', '/restoran/iptal-siparisler'].includes(location.pathname)) ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"}`} 
                data-testid={`restaurant-mobile-nav-${item.key}`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
                {badges[item.key] > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center">
                    {badges[item.key] > 99 ? '99+' : badges[item.key]}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          
          <div className="absolute bottom-0 left-0 right-0 border-t border-white/20 p-2">
            <Button 
              variant="ghost" 
              onClick={() => {
                setOpen(false);
                onLogout();
              }} 
              className="w-full text-white hover:bg-white/10 font-semibold text-sm py-3 justify-start px-4" 
              data-testid="restaurant-mobile-logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Orta: Logo ve Restoran Adı */}
      <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
        {companyLogo && (
          <img 
            src={companyLogo} 
            alt="Logo" 
            className="w-6 h-6 rounded object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <span className="font-heading text-base font-bold truncate">{restaurant?.name || "Restoran"}</span>
      </div>
      
      <div className="w-10 flex-shrink-0" /> {/* Spacer for balance */}
    </header>
  );
}
