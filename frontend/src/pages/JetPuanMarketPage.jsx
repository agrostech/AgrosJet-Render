import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ShoppingBag, 
  Tags, 
  Package, 
  ClipboardList, 
  Settings,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  UserMinus,
  Search
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TABS = [
  { key: "orders", label: "Siparişler", icon: ClipboardList },
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
        <h2 className="font-heading text-xl font-bold tracking-tight">JetPuan Market</h2>
        <p className="text-sm text-muted-foreground">Ürün ve sipariş yönetimi</p>
      </div>

      {/* Alt Sekmeler - Muhasebe ile aynı tasarım */}
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

      {/* Tab İçeriği */}
      <div>
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "products" && <ProductsTab />}
        {activeTab === "settings" && <SettingsTab companyId={companyId} />}
      </div>
    </div>
  );
}


// ============ ORDERS TAB ============
function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/admin`);
      setOrders(res.data);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleDeliver = async (orderId) => {
    try {
      await axios.put(`${API}/jetpuan/orders/${orderId}/deliver`);
      toast.success("Sipariş teslim edildi");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm("Bu siparişi iptal etmek istediğinize emin misiniz? Puanlar iade edilecek.")) return;
    try {
      await axios.delete(`${API}/jetpuan/orders/${orderId}`);
      toast.success("Sipariş iptal edildi");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İptal başarısız");
    }
  };

  const filteredOrders = filterStatus === "all"
    ? orders
    : orders.filter(o => o.status === filterStatus);

  const pendingCount = orders.filter(o => o.status === "pending").length;

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Siparişler</h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
              {pendingCount} Bekliyor
            </span>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-10 border-2">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="pending">Bekliyor</SelectItem>
            <SelectItem value="delivered">Teslim Edildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            Sipariş bulunmuyor
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className={`border-2 bg-white p-4 ${order.status === 'pending' ? 'border-amber-300' : 'border-border'}`}>
              <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {order.status === 'pending' ? 'Bekliyor' : 'Teslim Edildi'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <p className="font-semibold">{order.courier_name}</p>
                  <p className="text-sm text-muted-foreground">{order.courier_phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{order.total_points} JP</p>
                  <p className="text-xs text-muted-foreground">{order.items.length} ürün</p>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex flex-wrap gap-2 mb-3">
                  {order.items.map((item, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 bg-slate-100 rounded">
                      {item.product_name} x{item.quantity}
                    </span>
                  ))}
                </div>
                
                {order.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleDeliver(order.id)} className="flex-1 h-9 font-semibold bg-green-600 hover:bg-green-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Teslim Et
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleCancel(order.id)} className="h-9 border-2 hover:bg-red-50 hover:text-red-600">
                      İptal Et
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ============ CATEGORIES TAB ============
function CategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: "" });

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/categories`);
      setCategories(res.data);
    } catch (err) {
      toast.error("Kategoriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: "" });
    setShowModal(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Kategori adı gerekli");
      return;
    }

    try {
      if (editingCategory) {
        await axios.put(`${API}/jetpuan/categories/${editingCategory.id}`, formData);
        toast.success("Kategori güncellendi");
      } else {
        await axios.post(`${API}/jetpuan/categories`, formData);
        toast.success("Kategori oluşturuldu");
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/jetpuan/categories/${categoryId}`);
      toast.success("Kategori silindi");
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Kategoriler ({categories.length})</h3>
        <Button onClick={openAddModal} className="font-semibold" data-testid="add-category-btn">
          <Plus className="w-4 h-4 mr-2" />
          Kategori Ekle
        </Button>
      </div>

      <div className="border-2 border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold">Kategori Adı</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                  Henüz kategori eklenmemiş
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id} className="border-b border-border">
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(cat)} className="h-8 px-3 border-2">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(cat.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Kategori Düzenle" : "Yeni Kategori"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Kategori Adı</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Elektronik"
                className="mt-1 h-11 border-2"
                data-testid="category-name-input"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold">
              {editingCategory ? "Güncelle" : "Oluştur"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============ PRODUCTS TAB ============
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: "", description: "", price: "", stock: "", category_id: "", image_url: ""
  });
  const [filterCategory, setFilterCategory] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/jetpuan/products`),
        axios.get(`${API}/jetpuan/categories`)
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ name: "", description: "", price: "", stock: "", category_id: "", image_url: "" });
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      stock: product.stock.toString(),
      category_id: product.category_id,
      image_url: product.image_url || ""
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.price || !formData.stock || !formData.category_id) {
      toast.error("Lütfen zorunlu alanları doldurun");
      return;
    }

    const payload = {
      ...formData,
      price: parseInt(formData.price),
      stock: parseInt(formData.stock)
    };

    try {
      if (editingProduct) {
        await axios.put(`${API}/jetpuan/products/${editingProduct.id}`, payload);
        toast.success("Ürün güncellendi");
      } else {
        await axios.post(`${API}/jetpuan/products`, payload);
        toast.success("Ürün oluşturuldu");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/jetpuan/products/${productId}`);
      toast.success("Ürün silindi");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  const filteredProducts = filterCategory === "all" 
    ? products 
    : products.filter(p => p.category_id === filterCategory);

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
        <h3 className="font-semibold text-sm sm:text-base">Ürünler ({filteredProducts.length})</h3>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="flex-1 sm:w-40 h-9 sm:h-10 border-2 text-xs sm:text-sm">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kategoriler</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openAddModal} className="font-semibold h-9 sm:h-10 text-xs sm:text-sm" data-testid="add-product-btn">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Ürün Ekle</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            Henüz ürün eklenmemiş
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div key={product.id} className="border-2 border-border bg-white overflow-hidden">
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div className={`flex-col items-center justify-center text-muted-foreground ${product.image_url ? 'hidden' : 'flex'}`}>
                  <ImageIcon className="w-8 h-8 sm:w-12 sm:h-12 mb-1 sm:mb-2 opacity-50" />
                  <span className="text-[10px] sm:text-xs">Görsel Yok</span>
                </div>
              </div>
              <div className="p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-amber-600 font-medium mb-0.5 sm:mb-1">{product.category_name}</p>
                <h4 className="font-semibold text-xs sm:text-base truncate">{product.name}</h4>
                <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 h-6 sm:h-8 hidden sm:block">{product.description}</p>
                <div className="flex items-center justify-between mt-1 sm:mt-2">
                  <span className="text-sm sm:text-lg font-bold text-primary">{product.price} JP</span>
                  <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {product.stock}
                  </span>
                </div>
                <div className="flex gap-1 sm:gap-2 mt-2 sm:mt-3">
                  <Button size="sm" variant="outline" onClick={() => openEditModal(product)} className="flex-1 h-7 sm:h-8 border-2 text-[10px] sm:text-xs px-1 sm:px-2">
                    <Pencil className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Düzenle</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(product.id)} className="h-7 sm:h-8 border-2 hover:bg-red-50 hover:text-red-600 px-1.5 sm:px-2">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Ürün Düzenle" : "Yeni Ürün"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Ürün Adı *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ürün adı"
                  className="mt-1 h-10 border-2"
                  data-testid="product-name-input"
                />
              </div>
              <div>
                <Label>Kategori *</Label>
                <Select value={formData.category_id} onValueChange={(val) => setFormData({ ...formData, category_id: val })}>
                  <SelectTrigger className="mt-1 h-10 border-2">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>JetPuan Fiyatı *</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="100"
                  className="mt-1 h-10 border-2"
                  data-testid="product-price-input"
                />
              </div>
              <div>
                <Label>Stok *</Label>
                <Input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="10"
                  className="mt-1 h-10 border-2"
                  data-testid="product-stock-input"
                />
              </div>
              <div>
                <Label>Görsel URL</Label>
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 h-10 border-2"
                  data-testid="product-image-input"
                />
              </div>
              <div className="col-span-2">
                <Label>Açıklama</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ürün açıklaması"
                  className="mt-1 border-2 min-h-[80px]"
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold">
              {editingProduct ? "Güncelle" : "Oluştur"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============ SETTINGS TAB ============
function SettingsTab({ companyId }) {
  const [settings, setSettings] = useState({ puan_per_100tl: 1.17 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Manuel puan ekleme/silme
  const [couriers, setCouriers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/settings`);
      setSettings(res.data);
    } catch (err) {
      toast.error("Ayarlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
    } catch (err) {
      console.error("Kuryeler yüklenemedi");
    }
  }, [companyId]);

  useEffect(() => {
    fetchSettings();
    fetchCouriers();
  }, [fetchSettings, fetchCouriers]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/jetpuan/settings`, settings);
      toast.success("Ayarlar kaydedildi");
    } catch (err) {
      toast.error("Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleManualPuan = async (isAdd) => {
    if (!selectedCourier || !manualAmount) {
      toast.error("Kurye ve miktar seçin");
      return;
    }
    
    const amount = parseFloat(manualAmount);
    if (amount <= 0) {
      toast.error("Miktar 0'dan büyük olmalı");
      return;
    }

    setManualLoading(true);
    try {
      if (isAdd) {
        await axios.post(`${API}/jetpuan/manual-credit/${selectedCourier}`, null, {
          params: {
            amount: amount,
            description: manualDescription || "Manuel puan ekleme"
          }
        });
        toast.success(`${amount} JP eklendi`);
      } else {
        await axios.post(`${API}/jetpuan/manual-debit/${selectedCourier}`, null, {
          params: {
            amount: amount,
            description: manualDescription || "Manuel puan silme"
          }
        });
        toast.success(`${amount} JP silindi`);
      }
      setManualAmount("");
      setManualDescription("");
      setSelectedCourier(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setManualLoading(false);
    }
  };

  const filteredCouriers = couriers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  if (loading) return <PageLoading />;

  const exampleHakedis = 100;
  const examplePoints = (exampleHakedis / 100) * settings.puan_per_100tl;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Puan Oranı Ayarı */}
      <div className="border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Puan Oranı Ayarı
        </h3>
        
        <div className="space-y-4">
          <div>
            <Label>Her 100 TL Hakediş İçin Kaç JetPuan?</Label>
            <Input
              type="number"
              step="0.01"
              value={settings.puan_per_100tl}
              onChange={(e) => setSettings({ ...settings, puan_per_100tl: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-11 border-2 text-lg font-mono"
              data-testid="puan-ratio-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Varsayılan: 1.17 (85&#39;te 1 oranı)
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">Örnek Hesaplama:</p>
            <p className="text-sm text-amber-700">
              {exampleHakedis} TL hakediş = <span className="font-bold">{examplePoints.toFixed(2)} JetPuan</span>
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full h-11 font-semibold">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* Manuel Puan Ekle/Sil */}
      <div className="border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Manuel JetPuan Ekle/Sil
        </h3>
        
        <div className="space-y-4">
          <div>
            <Label>Kurye Ara</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="İsim veya telefon..."
                className="h-10 border-2 pl-10"
              />
            </div>
          </div>

          {searchQuery && (
            <div className="max-h-32 overflow-y-auto border rounded-lg">
              {filteredCouriers.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">Kurye bulunamadı</p>
              ) : (
                filteredCouriers.slice(0, 5).map((courier) => (
                  <button
                    key={courier.id}
                    onClick={() => {
                      setSelectedCourier(courier.id);
                      setSearchQuery(courier.name);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      selectedCourier === courier.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <p className="font-medium">{courier.name}</p>
                    <p className="text-xs text-muted-foreground">{courier.phone}</p>
                  </button>
                ))
              )}
            </div>
          )}

          <div>
            <Label>JetPuan Miktarı</Label>
            <Input
              type="number"
              step="0.01"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder="10.00"
              className="mt-1 h-10 border-2"
            />
          </div>

          <div>
            <Label>Açıklama (Opsiyonel)</Label>
            <Input
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Bonus puan, düzeltme vb."
              className="mt-1 h-10 border-2"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => handleManualPuan(true)} 
              disabled={manualLoading || !selectedCourier || !manualAmount}
              className="flex-1 h-10 font-semibold bg-green-600 hover:bg-green-700"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Puan Ekle
            </Button>
            <Button 
              onClick={() => handleManualPuan(false)} 
              disabled={manualLoading || !selectedCourier || !manualAmount}
              variant="outline"
              className="flex-1 h-10 font-semibold border-2 hover:bg-red-50 hover:text-red-600"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              Puan Sil
            </Button>
          </div>
        </div>
      </div>

      {/* Bilgi Kutusu */}
      <div className="lg:col-span-2 border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-3">Puan Sistemi Nasıl Çalışır?</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Kuryeye hakediş girildiğinde otomatik olarak JetPuan yüklenir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Hakediş silindiğinde yüklenen JetPuan da otomatik silinir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Kuryeler puanlarını JetPuan Market&#39;te harcayabilir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Sipariş iptal edilirse puanlar iade edilir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Manuel olarak kuryeye puan ekleyebilir veya silebilirsiniz
          </li>
        </ul>
      </div>
    </div>
  );
}
