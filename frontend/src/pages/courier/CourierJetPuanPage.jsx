import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { 
  ShoppingBag, 
  Coins, 
  History, 
  ShoppingCart,
  Package,
} from "lucide-react";
import { MarketTab, HistoryTab, OrdersTab, CartModal } from "@/components/courier/jetpuan";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TABS = [
  { key: "market", label: "Market", icon: ShoppingBag, color: "amber" },
  { key: "orders", label: "Siparişlerim", icon: Package, color: "blue" },
  { key: "history", label: "Puan Geçmişi", icon: History, color: "slate" },
];

export default function CourierJetPuanPage({ courierId }) {
  const [activeTab, setActiveTab] = useState("market");
  const [balance, setBalance] = useState(0);
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/balance/${courierId}`);
      setBalance(res.data.balance || 0);
    } catch (err) {
      console.error("Bakiye alınamadı");
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) fetchBalance();
  }, [courierId, fetchBalance]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.error("Maksimum stok miktarına ulaşıldı");
          return prev;
        }
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: 1,
        max_stock: product.stock,
        image_url: product.image_url
      }];
    });
  };

  const updateCartQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > item.max_stock) {
          toast.error("Maksimum stok miktarına ulaşıldı");
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Sepet boş");
      return;
    }
    if (cartTotal > balance) {
      toast.error("Yetersiz JetPuan bakiyesi");
      return;
    }

    try {
      await axios.post(`${API}/jetpuan/orders/${courierId}`, {
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      });
      toast.success("Sipariş oluşturuldu!");
      setCart([]);
      setShowCartModal(false);
      fetchBalance();
      setActiveTab("orders");
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Sipariş oluşturulamadı");
      }
    }
  };

  // Tab renk sınıfları
  const getTabClasses = (tab, isActive) => {
    const colorMap = {
      amber: {
        active: "bg-white text-amber-700 shadow-md border border-amber-200",
        badge: "bg-amber-100 text-amber-700"
      },
      blue: {
        active: "bg-white text-blue-700 shadow-md border border-blue-200",
        badge: "bg-blue-100 text-blue-700"
      },
      slate: {
        active: "bg-white text-slate-700 shadow-md border border-slate-300",
        badge: "bg-slate-200 text-slate-700"
      }
    };
    
    return colorMap[tab.color] || colorMap.slate;
  };

  return (
    <div className="space-y-4" data-testid="courier-jetpuan-page">
      {/* Balance Card - Elegant Design */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-amber-400 to-orange-400 shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBjeD0iMjAiIGN5PSIyMCIgcj0iMyIvPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
              <Coins className="w-7 h-7 text-white drop-shadow-sm" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80 tracking-wide">JetPuan Bakiyem</p>
              <p className="text-3xl font-bold text-white tracking-tight">{balance.toFixed(0)}<span className="text-lg font-normal text-white/70 ml-1">puan</span></p>
            </div>
          </div>
          {cart.length > 0 && (
            <Button 
              onClick={() => setShowCartModal(true)} 
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border-0 font-semibold text-sm h-10 px-4 rounded-xl shadow-md transition-all"
              data-testid="open-cart-btn"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Sepet ({cartItemCount})
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation - Atanmış/Yolda stili */}
      <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
        {TABS.map((tab) => {
          const colors = getTabClasses(tab, activeTab === tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? colors.active
                  : "text-slate-500 hover:text-slate-700"
              }`}
              data-testid={`courier-jetpuan-tab-${tab.key}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "market" && <MarketTab courierId={courierId} onAddToCart={addToCart} cart={cart} />}
        {activeTab === "history" && <HistoryTab courierId={courierId} />}
        {activeTab === "orders" && <OrdersTab courierId={courierId} />}
      </div>

      {/* Cart Modal */}
      <CartModal
        open={showCartModal}
        onOpenChange={setShowCartModal}
        cart={cart}
        balance={balance}
        cartTotal={cartTotal}
        cartItemCount={cartItemCount}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={handleCheckout}
      />
    </div>
  );
}
