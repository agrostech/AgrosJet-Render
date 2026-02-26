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
    toast.success("Sepete eklendi");
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
      {/* Balance Card */}
      <div className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
              <Coins className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-700">JetPuan Bakiyem</p>
              <p className="text-3xl font-bold text-amber-800">{balance.toFixed(2)}</p>
            </div>
          </div>
          {cart.length > 0 && (
            <Button 
              onClick={() => setShowCartModal(true)} 
              className="bg-amber-600 hover:bg-amber-700 font-semibold"
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
