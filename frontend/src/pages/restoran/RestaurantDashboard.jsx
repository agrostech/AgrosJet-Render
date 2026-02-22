import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Calculator, FileText, Link2, UtensilsCrossed, ClipboardList, Settings } from "lucide-react";

import RestaurantSidebar from "@/components/restoran/RestaurantSidebar";
import RestaurantMobileNav from "@/components/restoran/RestaurantMobileNav";
import RestaurantAnasayfa from "./RestaurantAnasayfa";
import RestaurantMuhasebe from "./RestaurantMuhasebe";
import RestaurantRaporlar from "./RestaurantRaporlar";
import RestaurantEntegrasyonlar from "./RestaurantEntegrasyonlar";
import RestaurantUrunler from "./RestaurantUrunler";
import RestaurantAyarlar from "./RestaurantAyarlar";
import RestaurantGecmisSiparisler from "./RestaurantGecmisSiparisler";
import RestaurantIptalSiparisler from "./RestaurantIptalSiparisler";
import Footer from "@/components/Footer";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Navigation Items
const NAV_ITEMS = [
  { key: "anasayfa", label: "Sipariş Yönetimi", icon: ClipboardList, path: "/restoran" },
  { key: "gecmis", label: "Geçmiş Siparişler", icon: ClipboardList, path: "/restoran/gecmis-siparisler", hidden: true },
  { key: "iptal", label: "İptal Siparişler", icon: ClipboardList, path: "/restoran/iptal-siparisler", hidden: true },
  { key: "raporlar", label: "Raporlar", icon: FileText, path: "/restoran/raporlar" },
  { key: "muhasebe", label: "Muhasebe", icon: Calculator, path: "/restoran/muhasebe" },
  { key: "urunler", label: "Ürünler", icon: UtensilsCrossed, path: "/restoran/urunler" },
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

  // Derive currentPage from location
  const getCurrentPage = () => {
    const path = location.pathname;
    const item = NAV_ITEMS.find(n => n.path === path);
    return item?.key || "anasayfa";
  };
  
  const currentPage = getCurrentPage();

  // Get user from localStorage
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    if (!storedUser || storedUser.role !== "restaurant") {
      navigate("/");
      return;
    }
    setUser(storedUser);
    setRestaurant({
      id: storedUser.restaurant_id,
      name: storedUser.restaurant_name
    });
    
    // Şirket logosunu çek
    if (storedUser.company_id) {
      axios.get(`${API}/companies/${storedUser.company_id}`)
        .then(res => setCompanyLogo(res.data.logo_url))
        .catch(() => {});
    }
  }, [navigate]);

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
        return <RestaurantMuhasebe restaurantId={user?.restaurant_id} />;
      case "raporlar":
        return <RestaurantRaporlar restaurantId={user?.restaurant_id} />;
      case "entegrasyonlar":
        return <RestaurantEntegrasyonlar restaurantId={user?.restaurant_id} />;
      case "urunler":
        return <RestaurantUrunler restaurantId={user?.restaurant_id} />;
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
        navItems={NAV_ITEMS}
        onLogout={handleLogout}
        badges={badges}
      />

      {/* Main Content */}
      <main className="pt-16 lg:pt-16 min-h-screen flex flex-col">
        <div className="p-4 lg:p-6 flex-1">
          {renderPage()}
        </div>
        <Footer />
      </main>
    </div>
  );
}
