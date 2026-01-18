import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ShoppingBag, 
  Coins, 
  History, 
  ShoppingCart,
  Package,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Clock,
  ImageIcon,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TABS = [
  { key: "market", label: "Market", icon: ShoppingBag },
  { key: "orders", label: "Siparişlerim", icon: Package },
  { key: "history", label: "Puan Geçmişi", icon: History },
];

export default function CourierJetPuanPage({ courierId }) {
  const [activeTab, setActiveTab] = useState("market");
  const [balance, setBalance] = useState(0);
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);
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
      toast.error(err.response?.data?.detail || "Sipariş oluşturulamadı");
    }
  };

  return (
    <div className="space-y-4" data-testid="courier-jetpuan-page">
      {/* Balance Card */}
      <div className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
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

      {/* Alt Sekmeler - Muhasebe ile aynı tasarım */}
      <div className="relative">
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
                data-testid={`courier-jetpuan-tab-${tab.key}`}
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

      {/* Tab İçeriği */}
      <div>
        {activeTab === "market" && <MarketTab courierId={courierId} onAddToCart={addToCart} cart={cart} />}
        {activeTab === "history" && <HistoryTab courierId={courierId} />}
        {activeTab === "orders" && <OrdersTab courierId={courierId} />}
      </div>

      {/* Cart Modal */}
      <Dialog open={showCartModal} onOpenChange={setShowCartModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Sepetim ({cartItemCount} ürün)
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product_name}</p>
                  <p className="text-sm text-amber-600 font-semibold">{item.price} JP</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-8 w-8"
                    onClick={() => updateCartQuantity(item.product_id, -1)}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center font-semibold">{item.quantity}</span>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-8 w-8"
                    onClick={() => updateCartQuantity(item.product_id, 1)}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                    onClick={() => removeFromCart(item.product_id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium">Toplam:</span>
              <span className="text-2xl font-bold text-amber-600">{cartTotal} JP</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Bakiyeniz:</span>
              <span className={balance >= cartTotal ? 'text-green-600' : 'text-red-600'}>
                {balance.toFixed(2)} JP
              </span>
            </div>
            {balance < cartTotal && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                Yetersiz bakiye! {(cartTotal - balance).toFixed(2)} JP daha gerekiyor.
              </p>
            )}
            <Button 
              onClick={handleCheckout} 
              disabled={balance < cartTotal}
              className="w-full h-12 font-semibold bg-amber-600 hover:bg-amber-700"
              data-testid="checkout-btn"
            >
              Sipariş Ver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============ MARKET TAB ============
function MarketTab({ courierId, onAddToCart, cart }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        axios.get(`${API}/jetpuan/categories`),
        axios.get(`${API}/jetpuan/products`)
      ]);
      setCategories(catRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      toast.error("Ürünler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredProducts = selectedCategory === "all"
    ? products
    : products.filter(p => p.category_id === selectedCategory);

  const getCartQuantity = (productId) => {
    const item = cart.find(i => i.product_id === productId);
    return item ? item.quantity : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={selectedCategory === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory("all")}
          className="flex-shrink-0"
        >
          Tümü
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.id)}
            className="flex-shrink-0"
          >
            {cat.name}
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Bu kategoride ürün bulunmuyor
          </div>
        ) : (
          filteredProducts.map((product) => {
            const cartQty = getCartQuantity(product.id);
            const isOutOfStock = product.stock <= 0;
            const isMaxInCart = cartQty >= product.stock;

            return (
              <div 
                key={product.id} 
                className={`border-2 bg-white overflow-hidden ${isOutOfStock ? 'opacity-60' : 'border-border'}`}
              >
                <div className="aspect-square bg-slate-100 flex items-center justify-center relative">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                      style={{ maxWidth: '500px', maxHeight: '500px' }}
                    />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-muted-foreground opacity-50" />
                  )}
                  {isOutOfStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-red-600 text-white px-3 py-1 text-sm font-semibold rounded">
                        Tükendi
                      </span>
                    </div>
                  )}
                  {cartQty > 0 && (
                    <div className="absolute top-2 right-2 bg-amber-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {cartQty}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs text-amber-600 font-medium">{product.category_name}</p>
                  <h4 className="font-semibold text-sm truncate">{product.name}</h4>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-lg font-bold text-primary">{product.price} JP</span>
                    <span className="text-xs text-muted-foreground">Stok: {product.stock}</span>
                  </div>
                  <Button
                    onClick={() => onAddToCart(product)}
                    disabled={isOutOfStock || isMaxInCart}
                    className="w-full mt-2 h-9 font-semibold bg-amber-600 hover:bg-amber-700"
                    size="sm"
                    data-testid={`add-to-cart-${product.id}`}
                  >
                    {isOutOfStock ? "Tükendi" : isMaxInCart ? "Maksimum" : "Sepete Ekle"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


// ============ HISTORY TAB ============
function HistoryTab({ courierId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/transactions/${courierId}`);
      setTransactions(res.data);
    } catch (err) {
      toast.error("Puan geçmişi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Henüz puan hareketi yok</p>
        </div>
      ) : (
        transactions.map((tx) => (
          <div key={tx.id} className="border-2 border-border bg-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                tx.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {tx.type === 'credit' ? (
                  <ArrowDown className="w-5 h-5 text-green-600" />
                ) : (
                  <ArrowUp className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{tx.description}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString('tr-TR')}
                </p>
              </div>
            </div>
            <span className={`text-lg font-bold ${
              tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
            }`}>
              {tx.type === 'credit' ? '+' : ''}{tx.amount.toFixed(2)} JP
            </span>
          </div>
        ))
      )}
    </div>
  );
}


// ============ ORDERS TAB ============
function OrdersTab({ courierId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/courier/${courierId}`);
      setOrders(res.data);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Henüz sipariş vermediniz</p>
        </div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className={`border-2 bg-white p-4 ${
            order.status === 'pending' ? 'border-amber-300' : 'border-green-300'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {order.status === 'pending' ? (
                  <Clock className="w-5 h-5 text-amber-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                <span className={`text-sm font-semibold ${
                  order.status === 'pending' ? 'text-amber-600' : 'text-green-600'
                }`}>
                  {order.status === 'pending' ? 'Hazırlanıyor' : 'Teslim Edildi'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString('tr-TR')}
              </span>
            </div>
            
            <div className="space-y-2 mb-3">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.product_name} x{item.quantity}</span>
                  <span className="font-medium">{item.total} JP</span>
                </div>
              ))}
            </div>
            
            <div className="pt-3 border-t border-border flex justify-between items-center">
              <span className="font-medium">Toplam:</span>
              <span className="text-xl font-bold text-amber-600">{order.total_points} JP</span>
            </div>
            
            {order.status === 'delivered' && order.delivered_at && (
              <p className="text-xs text-green-600 mt-2">
                Teslim: {new Date(order.delivered_at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
