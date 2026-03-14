import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Calculator, FileText, Link2, UtensilsCrossed, ClipboardList, Settings, AlertTriangle, Users } from "lucide-react";

import RestaurantSidebar from "@/components/restoran/RestaurantSidebar";
import RestaurantMobileNav from "@/components/restoran/RestaurantMobileNav";
import RestaurantAnasayfa from "./RestaurantAnasayfa";
import RestaurantMuhasebe from "./RestaurantMuhasebe";
import RestaurantRaporlar from "./RestaurantRaporlar";
import RestaurantEntegrasyonlar from "./RestaurantEntegrasyonlar";
import RestaurantUrunler from "./RestaurantUrunler";
import RestaurantMusteriler from "./RestaurantMusteriler";
import RestaurantAyarlar from "./RestaurantAyarlar";
import RestaurantGecmisSiparisler from "./RestaurantGecmisSiparisler";
import RestaurantIptalSiparisler from "./RestaurantIptalSiparisler";
import Footer from "@/components/Footer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Navigation Items
const NAV_ITEMS = [
  { key: "anasayfa", label: "Sipariş Yönetimi", icon: ClipboardList, path: "/restoran" },
  { key: "gecmis", label: "Teslim Edilen Siparişler", icon: ClipboardList, path: "/restoran/gecmis-siparisler", hidden: true },
  { key: "iptal", label: "İptal Siparişler", icon: ClipboardList, path: "/restoran/iptal-siparisler", hidden: true },
  { key: "raporlar", label: "Raporlar", icon: FileText, path: "/restoran/raporlar" },
  { key: "muhasebe", label: "Muhasebe", icon: Calculator, path: "/restoran/muhasebe" },
  { key: "urunler", label: "Ürünler", icon: UtensilsCrossed, path: "/restoran/urunler" },
  { key: "musteriler", label: "Müşteriler", icon: Users, path: "/restoran/musteriler" },
  { key: "entegrasyonlar", label: "Entegrasyonlar", icon: Link2, path: "/restoran/entegrasyonlar" },
  { key: "ayarlar", label: "Ayarlar", icon: Settings, path: "/restoran/ayarlar" },
];

export default function RestaurantDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState({});
  const [permissions, setPermissions] = useState({});
  const [showInvoiceWarning, setShowInvoiceWarning] = useState(false);
  const [missingInvoiceCount, setMissingInvoiceCount] = useState(0);
  const [missingInvoiceTotal, setMissingInvoiceTotal] = useState(0);
  const [warningCount, setWarningCount] = useState(0); // Kalan uyarı hakkı (10'dan geriye sayar)
  const [penaltyApplying, setPenaltyApplying] = useState(false);
  const invoiceWarningRef = useRef(null);
  const [isImpersonate, setIsImpersonate] = useState(false);
  const [impersonateError, setImpersonateError] = useState(false);
  const impersonateRef = useRef(false);

  // Derive currentPage from location
  const getCurrentPage = () => {
    const path = location.pathname;
    const item = NAV_ITEMS.find(n => n.path === path);
    return item?.key || "anasayfa";
  };
  
  const currentPage = getCurrentPage();

  // Get user from localStorage or impersonate token
  useEffect(() => {
    // Zaten impersonate modda ise tekrar init yapma
    if (impersonateRef.current) return;

    const params = new URLSearchParams(location.search);
    const impersonateToken = params.get("token");
    
    if (impersonateToken) {
      // Admin impersonate mode - localStorage'a dokunma
      impersonateRef.current = true;
      setIsImpersonate(true);
      axios.get(`${API}/restaurant-users/impersonate-verify/${impersonateToken}`)
        .then(res => {
          const userData = res.data;
          setUser(userData);
          setRestaurant({
            id: userData.restaurant_id,
            name: userData.restaurant_name,
            company_id: userData.company_id
          });
          if (userData.company_id) {
            axios.get(`${API}/companies/${userData.company_id}`)
              .then(r => setCompanyLogo(r.data.logo_url))
              .catch(() => {});
          }
        })
        .catch(() => {
          setImpersonateError(true);
        });
      return;
    }
    
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    if (!storedUser || storedUser.role !== "restaurant") {
      navigate("/");
      return;
    }
    setUser(storedUser);
    setRestaurant({
      id: storedUser.restaurant_id,
      name: storedUser.restaurant_name,
      company_id: storedUser.company_id
    });
    
    // Şirket logosunu çek
    if (storedUser.company_id) {
      axios.get(`${API}/companies/${storedUser.company_id}`)
        .then(res => setCompanyLogo(res.data.logo_url))
        .catch(() => {});
    }
  }, [navigate, location.search]);

  // Eksik fatura kontrolü
  const checkMissingInvoices = useCallback(async () => {
    if (!user?.restaurant_id) return;
    
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${user.restaurant_id}/issued`);
      const missingInvoices = res.data.filter(inv => !inv.invoice_uploaded);
      const missing = missingInvoices.length;
      const totalAmount = missingInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      
      setMissingInvoiceCount(missing);
      setMissingInvoiceTotal(totalAmount);
      
      // Uyarı sayacını localStorage'dan al
      const storedCount = localStorage.getItem(`invoice_warning_count_${user.restaurant_id}`);
      const currentCount = storedCount ? parseInt(storedCount) : 0;
      setWarningCount(currentCount);
      
      // Eksik fatura varsa ve 10 hakkı dolmamışsa modal göster
      // Sayfa refresh edilse bile modal açık kalmalı
      if (missing > 0 && currentCount < 10) {
        setShowInvoiceWarning(true);
        // Modal açıkken refresh edilirse tekrar açılması için localStorage'a kaydet
        localStorage.setItem(`invoice_warning_active_${user.restaurant_id}`, "true");
      }
    } catch (err) {
      console.error("Eksik fatura kontrolü başarısız:", err);
    }
  }, [user?.restaurant_id]);

  // Uyarıyı kapat ve sayacı artır
  const handleCloseWarning = async () => {
    if (!user?.restaurant_id) return;
    
    const newCount = warningCount + 1;
    setWarningCount(newCount);
    localStorage.setItem(`invoice_warning_count_${user.restaurant_id}`, newCount.toString());
    // Modal kapatıldığını kaydet
    localStorage.setItem(`invoice_warning_active_${user.restaurant_id}`, "false");
    
    // 10. kez kapatıldıysa ceza uygula
    if (newCount >= 10) {
      setPenaltyApplying(true);
      try {
        const res = await axios.post(`${API}/restaurant-panel-invoices/${user.restaurant_id}/invoice-penalty`);
        if (res.data.success) {
          toast.error(`Vergi yükümlülüğü bedeli uygulandı: ${res.data.penalty_amount.toFixed(2)} TL bakiyenize eklendi!`);
          // Sayacı sıfırla
          localStorage.setItem(`invoice_warning_count_${user.restaurant_id}`, "0");
          setWarningCount(0);
        }
      } catch (err) {
        toast.error("İşlem uygulanırken hata oluştu");
        console.error(err);
      } finally {
        setPenaltyApplying(false);
      }
    }
    
    setShowInvoiceWarning(false);
  };

  // İlk yüklemede ve 30 dakikada bir eksik fatura kontrolü + modal göster
  useEffect(() => {
    if (user?.restaurant_id) {
      checkMissingInvoices(); // Sayfa yüklendiğinde modal göster
      
      // 30 dakikada bir kontrol et ve modal göster
      invoiceWarningRef.current = setInterval(() => {
        checkMissingInvoices();
      }, 1800000); // 30 dakika = 1800000 ms
      
      return () => {
        if (invoiceWarningRef.current) {
          clearInterval(invoiceWarningRef.current);
        }
      };
    }
  }, [user?.restaurant_id, checkMissingInvoices]);

  // Fetch orders for this restaurant
  const fetchOrders = useCallback(async () => {
    if (!user?.restaurant_id) return;
    
    try {
      // Yeni merkezi endpoint kullan
      const res = await axios.get(`${API}/orders/v2/list`, {
        params: {
          panel: 'restaurant',
          restaurant_id: user.restaurant_id,
          limit: 200
        }
      });
      setOrders(res.data.orders || []);
      
      // Badges disabled - keeping code structure for future use
      setBadges({});
    } catch (err) {
      console.error("Siparişler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.restaurant_id]);

  // Fetch restaurant permissions
  const fetchPermissions = useCallback(async () => {
    if (!user?.restaurant_id) return;
    
    try {
      const res = await axios.get(`${API}/restaurant-permissions/${user.restaurant_id}`);
      setPermissions(res.data.permissions || {});
      return res.data.permissions_updated_at;
    } catch (err) {
      console.error("İzinler yüklenemedi:", err);
      return null;
    }
  }, [user?.restaurant_id]);

  // İzin değişikliği kontrolü için ref
  const permissionsUpdatedAtRef = useRef(null);

  // İzin değişikliği kontrol fonksiyonu
  const checkPermissionsUpdate = useCallback(async () => {
    if (!user?.restaurant_id) return;
    
    try {
      const res = await axios.get(`${API}/restaurant-permissions/${user.restaurant_id}`);
      const newUpdatedAt = res.data.permissions_updated_at;
      
      // İlk yüklemede sadece kaydet
      if (permissionsUpdatedAtRef.current === null) {
        permissionsUpdatedAtRef.current = newUpdatedAt;
        return;
      }
      
      // Değişiklik varsa sayfayı yenile
      if (newUpdatedAt && newUpdatedAt !== permissionsUpdatedAtRef.current) {
        window.location.reload();
      }
    } catch (err) {
      // Sessizce hata yut
    }
  }, [user?.restaurant_id]);

  useEffect(() => {
    if (user?.restaurant_id) {
      fetchOrders();
      fetchPermissions().then(updatedAt => {
        permissionsUpdatedAtRef.current = updatedAt;
      });
      // Polling every 5 seconds for orders
      const orderInterval = setInterval(fetchOrders, 5000);
      // Polling every 10 seconds for permission changes
      const permissionInterval = setInterval(checkPermissionsUpdate, 10000);
      return () => {
        clearInterval(orderInterval);
        clearInterval(permissionInterval);
      };
    }
  }, [user?.restaurant_id, fetchOrders, fetchPermissions, checkPermissionsUpdate]);

  const handleLogout = () => {
    if (isImpersonate) return; // Impersonate modda çıkış yapma
    localStorage.removeItem("user");
    navigate("/");
  };

  // Update order status
  const handleUpdateOrderStatus = async (orderId, newStatus, preparationTime = null) => {
    try {
      const payload = { status: newStatus };
      if (preparationTime) {
        payload.preparation_time = preparationTime;
      }
      await axios.put(`${API}/orders/${orderId}/status`, payload);
      // Bildirim kapatıldı - kullanıcı isteği
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Assign courier to order
  const handleAssignCourier = async (orderId, courierId) => {
    if (!user?.restaurant_id) return;
    
    try {
      await axios.post(`${API}/orders/restaurant/${user.restaurant_id}/assign/${orderId}`, {
        courier_id: courierId
      });
      toast.success("Kurye atandı");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye atanamadı");
    }
  };

  if (impersonateError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-muted-foreground">Bağlantı süresi dolmuş veya geçersiz.</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "anasayfa":
        return (
          <RestaurantAnasayfa 
            orders={orders} 
            loading={loading}
            onUpdateStatus={handleUpdateOrderStatus}
            onAssignCourier={handleAssignCourier}
            onRefresh={fetchOrders}
            restaurantId={user?.restaurant_id}
            restaurantName={restaurant?.name}
            permissions={permissions}
          />
        );
      case "gecmis":
        return <RestaurantGecmisSiparisler restaurantId={user?.restaurant_id} />;
      case "iptal":
        return <RestaurantIptalSiparisler restaurantId={user?.restaurant_id} />;
      case "muhasebe":
        return <RestaurantMuhasebe restaurantId={user?.restaurant_id} restaurantName={restaurant?.name} />;
      case "raporlar":
        return <RestaurantRaporlar restaurantId={user?.restaurant_id} companyId={restaurant?.company_id} />;
      case "entegrasyonlar":
        return <RestaurantEntegrasyonlar restaurantId={user?.restaurant_id} />;
      case "urunler":
        return <RestaurantUrunler restaurantId={user?.restaurant_id} />;
      case "musteriler":
        return <RestaurantMusteriler restaurantId={user?.restaurant_id} />;
      case "ayarlar":
        return <RestaurantAyarlar restaurantId={user?.restaurant_id} restaurantName={restaurant?.name} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100" data-testid="restaurant-dashboard">
      {/* Desktop Sidebar */}
      <RestaurantSidebar
        user={user}
        restaurant={restaurant}
        navItems={NAV_ITEMS}
        onLogout={handleLogout}
        badges={badges}
        companyLogo={companyLogo}
      />

      {/* Mobile Navigation */}
      <RestaurantMobileNav
        user={user}
        restaurant={restaurant}
        companyLogo={companyLogo}
        navItems={NAV_ITEMS}
        onLogout={handleLogout}
        badges={badges}
      />

      {/* Main Content */}
      <main className="pt-14 lg:pt-16 min-h-screen flex flex-col">
        <div className="p-3 sm:p-4 lg:p-6 flex-1 overflow-x-hidden">
          {renderPage()}
        </div>
        <Footer />
      </main>

      {/* Eksik Fatura Uyarı Modalı */}
      <Dialog open={showInvoiceWarning} onOpenChange={() => {}}>
        <DialogContent className="max-w-xl p-0 overflow-hidden [&>button]:hidden">
          <div className="bg-red-600 p-6 text-center">
            <AlertTriangle className="w-16 h-16 text-white mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              DİKKAT!
            </h2>
            <p className="text-red-100 text-lg">
              Yüklenmemiş Fatura Uyarısı
            </p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-lg font-semibold mb-4">
              {missingInvoiceCount} adet yüklenmemiş, eksik faturanız var!
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 text-sm font-medium mb-2">
                ⚠️ Süresi dolmuş faturalar için bakiyenize, fatura tutarının <strong>%40'ı</strong> kadar vergi yükümlülüğü bedeli eklenecektir!
              </p>
              <p className="text-red-900 text-sm font-bold">
                Bu uyarı <strong>{10 - warningCount}</strong> kez daha gösterilecek ve %40 vergi yükümlülüğü bedeli ({(missingInvoiceTotal * 0.40).toFixed(2)} TL) otomatik olarak bakiyenize eklenecektir!
              </p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-blue-800 text-sm">
                Eksik Faturanızı, <strong>Muhasebe Sekmesi → Faturalar</strong> kısmından yükleyebilirsiniz.
              </p>
            </div>
            
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 mb-6">
              <p className="text-gray-600 text-xs">
                ℹ️ Bu uyarı size <strong>30 dakikada bir</strong> gösterilecektir.
              </p>
            </div>
            
            <Button 
              onClick={handleCloseWarning}
              disabled={penaltyApplying}
              className="w-full h-12 text-lg font-semibold"
            >
              {penaltyApplying ? "İşlem yapılıyor..." : `Uyarıyı Kapat (${10 - warningCount} hak kaldı)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
