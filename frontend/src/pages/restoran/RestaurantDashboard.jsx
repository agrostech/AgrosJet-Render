import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Home, Calculator, FileText, Link2, Package, ClipboardList, Truck, CheckCircle, XCircle } from "lucide-react";

import RestaurantSidebar from "@/components/restoran/RestaurantSidebar";
import RestaurantMobileNav from "@/components/restoran/RestaurantMobileNav";
import RestaurantAnasayfa from "./RestaurantAnasayfa";
import RestaurantMuhasebe from "./RestaurantMuhasebe";
import RestaurantRaporlar from "./RestaurantRaporlar";
import RestaurantEntegrasyonlar from "./RestaurantEntegrasyonlar";
import RestaurantUrunler from "./RestaurantUrunler";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Navigation Items
const NAV_ITEMS = [
  { key: "anasayfa", label: "Anasayfa", icon: Home, path: "/restoran" },
  { key: "muhasebe", label: "Muhasebe", icon: Calculator, path: "/restoran/muhasebe" },
  { key: "raporlar", label: "Raporlar", icon: FileText, path: "/restoran/raporlar" },
  { key: "entegrasyonlar", label: "Entegrasyonlar", icon: Link2, path: "/restoran/entegrasyonlar" },
  { key: "urunler", label: "Ürünler", icon: Package, path: "/restoran/urunler" },
];

export default function RestaurantDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [badges, setBadges] = useState({});

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
  }, [navigate]);

  // Fetch orders for this restaurant
  const fetchOrders = useCallback(async () => {
    if (!user?.restaurant_id) return;
    
    try {
      const res = await axios.get(`${API}/orders/restaurant/${user.restaurant_id}`);
      setOrders(res.data);
      
      // Calculate badges
      const pending = res.data.filter(o => o.status === "pending" || o.status === "preparing").length;
      const onTheWay = res.data.filter(o => o.status === "on_the_way").length;
      
      setBadges({
        anasayfa: pending,
        // Add more badges as needed
      });
    } catch (err) {
      console.error("Siparişler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.restaurant_id]);

  useEffect(() => {
    if (user?.restaurant_id) {
      fetchOrders();
      // Polling every 30 seconds
      const interval = setInterval(fetchOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.restaurant_id, fetchOrders]);

  // Handle page navigation
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/restoran" || path === "/restoran/") {
      setCurrentPage("anasayfa");
    } else if (path.includes("/muhasebe")) {
      setCurrentPage("muhasebe");
    } else if (path.includes("/raporlar")) {
      setCurrentPage("raporlar");
    } else if (path.includes("/entegrasyonlar")) {
      setCurrentPage("entegrasyonlar");
    } else if (path.includes("/urunler")) {
      setCurrentPage("urunler");
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  // Update order status
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.put(`${API}/orders/${orderId}/status`, { status: newStatus });
      toast.success("Sipariş durumu güncellendi");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
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
            onRefresh={fetchOrders}
          />
        );
      case "muhasebe":
        return <RestaurantMuhasebe restaurantId={user?.restaurant_id} />;
      case "raporlar":
        return <RestaurantRaporlar restaurantId={user?.restaurant_id} />;
      case "entegrasyonlar":
        return <RestaurantEntegrasyonlar restaurantId={user?.restaurant_id} />;
      case "urunler":
        return <RestaurantUrunler restaurantId={user?.restaurant_id} />;
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
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onLogout={handleLogout}
        badges={badges}
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
      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'} pt-14 lg:pt-0`}>
        <div className="p-4 lg:p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
