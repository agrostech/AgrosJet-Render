import { useState, useEffect, useRef } from "react";
import { 
  ShoppingBag, 
  Tags, 
  Package, 
  ClipboardList, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";

// JetPuan components
import { OrdersTab, CategoriesTab, JetPuanProductsTab, SettingsTab, CourierPointsTab } from "@/components/jetpuan";

const TABS = [
  { key: "orders", label: "Siparişler", icon: ClipboardList },
  { key: "couriers", label: "Kurye Puanları", icon: Users },
  { key: "categories", label: "Kategoriler", icon: Tags },
  { key: "products", label: "Ürünler", icon: Package },
  { key: "settings", label: "Ayarlar", icon: Settings },
];

export default function JetPuanMarketPage({ companyId }) {
  const [activeTab, setActiveTab] = useState("orders");
  const tabsContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScrollArrows = () => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScrollArrows();
    window.addEventListener('resize', checkScrollArrows);
    return () => window.removeEventListener('resize', checkScrollArrows);
  }, []);

  const scrollTabs = (direction) => {
    if (tabsContainerRef.current) {
      const scrollAmount = 120;
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScrollArrows, 300);
    }
  };
  
  return (
    <div data-testid="jetpuan-market-page">
      <div className="mb-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">Market</h2>
        <p className="text-sm text-muted-foreground">Ürün ve sipariş yönetimi</p>
      </div>

      {/* Tab Navigation */}
      <div className="relative mb-4">
        {showLeftArrow && (
          <button 
            onClick={() => scrollTabs('left')}
            className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent pr-4 pl-1 flex items-center md:hidden"
          >
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </button>
        )}
        
        <div 
          ref={tabsContainerRef}
          onScroll={checkScrollArrows}
          className="overflow-x-auto scrollbar-hide scroll-smooth"
        >
          <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
                }`}
                data-testid={`jetpuan-tab-${tab.key}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {showRightArrow && (
          <button 
            onClick={() => scrollTabs('right')}
            className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent pl-4 pr-1 flex items-center md:hidden"
          >
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "orders" && <OrdersTab companyId={companyId} />}
        {activeTab === "couriers" && <CourierPointsTab companyId={companyId} />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "products" && <JetPuanProductsTab />}
        {activeTab === "settings" && <SettingsTab companyId={companyId} />}
      </div>
    </div>
  );
}
