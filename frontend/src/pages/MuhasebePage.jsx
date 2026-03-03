import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Building2, Wallet, History, FileText, FileSpreadsheet, ChevronLeft, ChevronRight, Receipt, BarChart3, Store, UserCog, Bike } from "lucide-react";
import KuryelerTab from "./muhasebe/KuryelerTab";
import IsletmelerTab from "./muhasebe/IsletmelerTab";
import CarilerTab from "./muhasebe/CarilerTab";
import HareketlerTab from "./muhasebe/HareketlerTab";
import FaturalarTab from "./muhasebe/FaturalarTab";
import IsletmeFaturalariTab from "./muhasebe/IsletmeFaturalariTab";
import HaftalikHakedisTab from "./muhasebe/HaftalikHakedisTab";
import GunlukMutabakatTab from "./muhasebe/GunlukMutabakatTab";
import YoneticiMutabakatTab from "./muhasebe/YoneticiMutabakatTab";
import RestoranMutabakatTab from "./muhasebe/RestoranMutabakatTab";
import RaporlarTab from "./muhasebe/RaporlarTab";

const TABS = [
  { key: "kuryeler", label: "Kuryeler", icon: Users },
  { key: "isletmeler", label: "Restoranlar", icon: Building2 },
  { key: "cariler", label: "Cariler", icon: Wallet },
  { key: "kurye-mutabakat", label: "Kurye Mütabakat", icon: Bike },
  { key: "restoran-mutabakat", label: "Restoran Mütabakat", icon: Store },
  { key: "yonetici-mutabakat", label: "Yönetici Mütabakat", icon: UserCog },
  { key: "haftalik-hakedis", label: "Haftalık Hakediş", icon: FileSpreadsheet },
  { key: "kurye-faturalari", label: "Kurye Faturaları", icon: Receipt },
  { key: "isletme-faturalari", label: "Restoran Faturaları", icon: Receipt },
  { key: "raporlar", label: "Raporlar", icon: BarChart3, superAdminOnly: true },
  { key: "hareketler", label: "Hareketler", icon: History },
];

const TAB_KEYS = TABS.map(t => t.key);

export default function MuhasebePage({ companyId, adminId, adminName, companyLogo, companyName, isSuperAdmin }) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // URL'den tab değerini al, geçerli değilse "kuryeler" kullan
  const tabFromUrl = searchParams.get("tab");
  const initialTab = TAB_KEYS.includes(tabFromUrl) ? tabFromUrl : "kuryeler";
  const [activeTab, setActiveTab] = useState(initialTab);
  const transactionRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Tab değiştiğinde URL'yi güncelle
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  // Mobilde seçim yapıldığında işlem geçmişine scroll
  const scrollToTransactions = () => {
    if (window.innerWidth < 768 && transactionRef.current) {
      setTimeout(() => {
        transactionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  // Tab scroll kontrolü
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
    <div data-testid="muhasebe-page">
      <h2 className="font-heading text-xl font-bold tracking-tight mb-4">Muhasebe</h2>
      
      {/* Alt Sekmeler - Kayar sekme */}
      <div className="relative mb-4">
        {/* Sol ok */}
        {showLeftArrow && (
          <button 
            onClick={() => scrollTabs('left')}
            className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent pr-4 pl-1 flex items-center md:hidden"
          >
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </button>
        )}
        
        {/* Sekmeler */}
        <div 
          ref={tabsContainerRef}
          onScroll={checkScrollArrows}
          className="overflow-x-auto scrollbar-hide scroll-smooth"
        >
          <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
            {TABS.filter(tab => !tab.superAdminOnly || isSuperAdmin).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
                }`}
                data-testid={`muhasebe-tab-${tab.key}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sağ ok */}
        {showRightArrow && (
          <button 
            onClick={() => scrollTabs('right')}
            className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent pl-4 pr-1 flex items-center md:hidden"
          >
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Tab İçeriği */}
      <div>
        {activeTab === "kuryeler" && <KuryelerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "isletmeler" && <IsletmelerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "cariler" && <CarilerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "kurye-faturalari" && <FaturalarTab companyId={companyId} adminId={adminId} adminName={adminName} isSuperAdmin={isSuperAdmin} />}
        {activeTab === "isletme-faturalari" && <IsletmeFaturalariTab companyId={companyId} adminId={adminId} adminName={adminName} isSuperAdmin={isSuperAdmin} />}
        {activeTab === "haftalik-hakedis" && <HaftalikHakedisTab companyId={companyId} />}
        {activeTab === "kurye-mutabakat" && <GunlukMutabakatTab companyId={companyId} adminId={adminId} adminName={adminName} isSuperAdmin={isSuperAdmin} />}
        {activeTab === "yonetici-mutabakat" && <YoneticiMutabakatTab companyId={companyId} currentUser={{ id: adminId, name: adminName, role: isSuperAdmin ? 'superadmin' : 'admin' }} />}
        {activeTab === "restoran-mutabakat" && <RestoranMutabakatTab companyId={companyId} />}
        {activeTab === "hareketler" && <HareketlerTab companyId={companyId} />}
        {activeTab === "raporlar" && isSuperAdmin && <RaporlarTab companyId={companyId} isSuperAdmin={isSuperAdmin} />}
      </div>
    </div>
  );
}
