import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Package, Plus, Search, Settings, Trash2, User, History, 
  AlertTriangle, XCircle, ArrowLeftRight, Pencil, FileCheck, Calendar, CheckCircle2
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ZimmetPage() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const { company_id: companyId, id: adminId, username: adminName } = user;

  // State
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("products"); // products | mali_bellek | logs
  const [loading, setLoading] = useState(true);

  // Mali Bellek states
  const [maliBellekData, setMaliBellekData] = useState([]);
  const [maliBellekLoading, setMaliBellekLoading] = useState(false);
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    // Default: geçen ay
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  });
  const [maliBellekAllLogs, setMaliBellekAllLogs] = useState([]);

  // Filter states - Ürünler sekmesi
  const [filterAssigned, setFilterAssigned] = useState(false); // Zimmetliler
  const [filterAvailable, setFilterAvailable] = useState(false); // Boştakiler
  const [filterDefective, setFilterDefective] = useState(false); // Arızalı
  const [filterLost, setFilterLost] = useState(false); // Kayıp

  // Filter states - Tüm Hareketler sekmesi
  const [logFilterAssigned, setLogFilterAssigned] = useState(false);
  const [logFilterReturned, setLogFilterReturned] = useState(false);
  const [logFilterDefective, setLogFilterDefective] = useState(false);
  const [logFilterDefectiveRemoved, setLogFilterDefectiveRemoved] = useState(false);
  const [logFilterLost, setLogFilterLost] = useState(false);
  const [logFilterLostRemoved, setLogFilterLostRemoved] = useState(false);
  const [logFilterDeleted, setLogFilterDeleted] = useState(false);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showEditProduct, setShowEditProduct] = useState(false);
  const [showProductTypes, setShowProductTypes] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: ""
  });
  const [editProduct, setEditProduct] = useState({
    id: "", name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: ""
  });
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeHasPos, setNewTypeHasPos] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [assignCourierId, setAssignCourierId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  const listRef = useRef(null);

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let result = [...products];
    
    // Text search - POS alanları dahil
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.serial_number?.toLowerCase().includes(q) ||
        p.pos_serial?.toLowerCase().includes(q) ||
        p.pos_terminal?.toLowerCase().includes(q) ||
        p.product_type_name?.toLowerCase().includes(q) ||
        p.assigned_to_courier_name?.toLowerCase().includes(q)
      );
    }
    
    // Checkbox filters
    if (filterAssigned) {
      result = result.filter(p => p.assigned_to_courier_id);
    }
    if (filterAvailable) {
      result = result.filter(p => !p.assigned_to_courier_id);
    }
    if (filterDefective) {
      result = result.filter(p => p.is_defective);
    }
    if (filterLost) {
      result = result.filter(p => p.is_lost);
    }
    
    // Sort: Zimmetli olanlar önce, sonra alfabetik
    result.sort((a, b) => {
      // Önce zimmetli olanlar
      const aAssigned = a.assigned_to_courier_id ? 0 : 1;
      const bAssigned = b.assigned_to_courier_id ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      
      // Sonra alfabetik
      return (a.name || "").localeCompare(b.name || "", 'tr');
    });
    
    return result;
  }, [products, searchQuery, filterAssigned, filterAvailable, filterDefective, filterLost]);

  // Filtered logs - POS alanları dahil
  const filteredLogs = useMemo(() => {
    let result = [...logs];
    
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.product_name?.toLowerCase().includes(q) ||
        l.courier_name?.toLowerCase().includes(q) ||
        l.admin_name?.toLowerCase().includes(q) ||
        l.details?.serial_number?.toLowerCase().includes(q) ||
        l.details?.pos_serial?.toLowerCase().includes(q) ||
        l.details?.pos_terminal?.toLowerCase().includes(q)
      );
    }
    
    // Checkbox filters - herhangi biri aktifse sadece o türleri göster
    const anyLogFilterActive = logFilterAssigned || logFilterReturned || logFilterDefective || 
      logFilterDefectiveRemoved || logFilterLost || logFilterLostRemoved || logFilterDeleted;
    
    if (anyLogFilterActive) {
      result = result.filter(l => {
        if (logFilterAssigned && l.action === 'assigned') return true;
        if (logFilterReturned && l.action === 'returned') return true;
        if (logFilterDefective && l.action === 'product_updated' && l.details?.changes?.includes('Arızalı')) return true;
        if (logFilterDefectiveRemoved && l.action === 'product_updated' && l.details?.changes?.includes('Arıza kaldırıldı')) return true;
        if (logFilterLost && l.action === 'product_updated' && l.details?.changes?.includes('Kayıp')) return true;
        if (logFilterLostRemoved && l.action === 'product_updated' && l.details?.changes?.includes('Kayıp kaldırıldı')) return true;
        if (logFilterDeleted && l.action === 'product_deleted') return true;
        return false;
      });
    }
    
    return result;
  }, [logs, searchQuery, logFilterAssigned, logFilterReturned, logFilterDefective, 
      logFilterDefectiveRemoved, logFilterLost, logFilterLostRemoved, logFilterDeleted]);

  // Fetch data
  const fetchProducts = async (append = false) => {
    try {
      const skip = append ? products.length : 0;
      const res = await axios.get(`${API}/companies/${companyId}/products?skip=${skip}&limit=50`);
      if (append) {
        setProducts(prev => [...prev, ...res.data.products]);
      } else {
        setProducts(res.data.products);
      }
      setTotalProducts(res.data.total_count);
      setHasMoreProducts(res.data.has_more);
    } catch (err) {
      toast.error("Ürünler yüklenemedi");
    }
  };

  const fetchProductTypes = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/product-types`);
      setProductTypes(res.data);
    } catch (err) {}
  };

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data.filter(c => !c.is_archived));
    } catch (err) {}
  };

  const fetchLogs = async (append = false) => {
    try {
      const skip = append ? logs.length : 0;
      const res = await axios.get(`${API}/companies/${companyId}/zimmet-logs?skip=${skip}&limit=10`);
      if (append) {
        setLogs(prev => [...prev, ...res.data.logs]);
      } else {
        setLogs(res.data.logs);
      }
      setTotalLogs(res.data.total_count);
      setHasMoreLogs(res.data.has_more);
    } catch (err) {}
  };

  const fetchProductHistory = async (productId) => {
    try {
      const res = await axios.get(`${API}/products/${productId}/history`);
      setProductHistory(res.data);
    } catch (err) {}
  };

  // Mali Bellek functions
  const fetchMaliBellek = async () => {
    if (!companyId) return;
    setMaliBellekLoading(true);
    try {
      const res = await axios.get(`${API}/companies/${companyId}/mali-bellek?year_month=${selectedYearMonth}`);
      // Sıralama: Alınanlar üstte, sonra alfabetik
      const sorted = (res.data.products || []).sort((a, b) => {
        const aCollected = a.mali_bellek?.is_collected ? 1 : 0;
        const bCollected = b.mali_bellek?.is_collected ? 1 : 0;
        if (bCollected !== aCollected) return bCollected - aCollected; // Alınanlar üstte
        return a.name.localeCompare(b.name, 'tr'); // Alfabetik
      });
      setMaliBellekData(sorted);
      
      // Ay bazında tüm logları getir
      const logsRes = await axios.get(`${API}/companies/${companyId}/mali-bellek-logs?year_month=${selectedYearMonth}`);
      setMaliBellekAllLogs(logsRes.data || []);
    } catch (err) {
      toast.error("Mali bellek verileri yüklenemedi");
    } finally {
      setMaliBellekLoading(false);
    }
  };

  const toggleMaliBellek = async (productId) => {
    try {
      await axios.post(`${API}/mali-bellek/${productId}/toggle?year_month=${selectedYearMonth}`, {
        admin_id: adminId,
        admin_name: adminName
      });
      fetchMaliBellek();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  // Ay seçenekleri (son 24 ay)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 1; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  }, []);

  useEffect(() => {
    if (companyId) {
      Promise.all([fetchProducts(), fetchProductTypes(), fetchCouriers(), fetchLogs()])
        .finally(() => setLoading(false));
    }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === "mali_bellek" && companyId) {
      fetchMaliBellek();
    }
  }, [activeTab, selectedYearMonth, companyId]);

  useEffect(() => {
    if (selectedProduct) {
      fetchProductHistory(selectedProduct.id);
    }
  }, [selectedProduct]);

  // Handlers
  const handleAddProductType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await axios.post(`${API}/companies/${companyId}/product-types`, {
        name: newTypeName.trim(),
        has_pos_fields: newTypeHasPos
      });
      toast.success("Ürün tipi eklendi");
      setNewTypeName("");
      setNewTypeHasPos(false);
      fetchProductTypes();
    } catch (err) {
      toast.error("Eklenemedi");
    }
  };

  const handleEditProductType = async () => {
    if (!editingType || !editingType.name.trim()) return;
    try {
      await axios.put(`${API}/product-types/${editingType.id}`, {
        name: editingType.name.trim(),
        has_pos_fields: editingType.has_pos_fields
      });
      toast.success("Ürün tipi güncellendi");
      setEditingType(null);
      fetchProductTypes();
    } catch (err) {
      toast.error("Güncellenemedi");
    }
  };

  const handleDeleteProductType = async (typeId) => {
    if (!window.confirm("Bu ürün tipini silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/product-types/${typeId}`);
      toast.success("Silindi");
      fetchProductTypes();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silinemedi");
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name.trim() || !newProduct.product_type_id) {
      toast.error("Ürün adı ve tipi gerekli");
      return;
    }
    try {
      await axios.post(`${API}/companies/${companyId}/products?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, newProduct);
      toast.success("Ürün eklendi");
      setShowAddProduct(false);
      setNewProduct({ name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: "" });
      fetchProducts();
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Eklenemedi");
    }
  };

  const openEditProduct = (product) => {
    setEditProduct({
      id: product.id,
      name: product.name,
      product_type_id: product.product_type_id,
      serial_number: product.serial_number || "",
      pos_serial: product.pos_serial || "",
      pos_terminal: product.pos_terminal || "",
      notes: product.notes || ""
    });
    setShowEditProduct(true);
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();
    if (!editProduct.name.trim() || !editProduct.product_type_id) {
      toast.error("Ürün adı ve tipi gerekli");
      return;
    }
    try {
      await axios.put(`${API}/products/${editProduct.id}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, {
        name: editProduct.name,
        product_type_id: editProduct.product_type_id,
        serial_number: editProduct.serial_number,
        pos_serial: editProduct.pos_serial,
        pos_terminal: editProduct.pos_terminal,
        notes: editProduct.notes
      });
      toast.success("Ürün güncellendi");
      setShowEditProduct(false);
      fetchProducts();
      fetchLogs();
      // Refresh selected product if it was the edited one
      if (selectedProduct?.id === editProduct.id) {
        const updated = await axios.get(`${API}/products/${editProduct.id}`);
        setSelectedProduct(updated.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncellenemedi");
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/products/${productId}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`);
      toast.success("Ürün silindi");
      if (selectedProduct?.id === productId) setSelectedProduct(null);
      fetchProducts();
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silinemedi");
    }
  };

  const handleAssign = async () => {
    if (!assignCourierId || !selectedProduct) return;
    const courier = couriers.find(c => c.id === assignCourierId);
    if (!courier) return;

    try {
      await axios.post(`${API}/products/${selectedProduct.id}/assign`, {
        courier_id: assignCourierId,
        courier_name: courier.name,
        admin_id: adminId,
        admin_name: adminName,
        notes: assignNotes
      });
      toast.success(`${selectedProduct.name} → ${courier.name}'a zimmetlendi`);
      setShowAssignModal(false);
      setAssignCourierId("");
      setAssignNotes("");
      fetchProducts();
      fetchLogs();
      // Refresh selected product
      const updated = await axios.get(`${API}/products/${selectedProduct.id}`);
      setSelectedProduct(updated.data);
      fetchProductHistory(selectedProduct.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Zimmetlenemedi");
    }
  };

  const handleReturn = async () => {
    if (!selectedProduct) return;
    try {
      await axios.post(`${API}/products/${selectedProduct.id}/return`, {
        admin_id: adminId,
        admin_name: adminName,
        notes: returnNotes
      });
      toast.success("Zimmet geri alındı");
      setShowReturnModal(false);
      setReturnNotes("");
      fetchProducts();
      fetchLogs();
      // Refresh selected product
      const updated = await axios.get(`${API}/products/${selectedProduct.id}`);
      setSelectedProduct(updated.data);
      fetchProductHistory(selectedProduct.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Geri alınamadı");
    }
  };

  const handleToggleDefective = async (product) => {
    try {
      await axios.put(`${API}/products/${product.id}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, {
        is_defective: !product.is_defective
      });
      toast.success(product.is_defective ? "Arıza kaldırıldı" : "Arızalı olarak işaretlendi");
      fetchProducts();
      fetchLogs();
      if (selectedProduct?.id === product.id) {
        setSelectedProduct({ ...selectedProduct, is_defective: !product.is_defective });
      }
    } catch (err) {
      toast.error("Güncellenemedi");
    }
  };

  const handleToggleLost = async (product) => {
    try {
      await axios.put(`${API}/products/${product.id}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, {
        is_lost: !product.is_lost
      });
      toast.success(product.is_lost ? "Kayıp kaldırıldı" : "Kayıp olarak işaretlendi");
      fetchProducts();
      fetchLogs();
      if (selectedProduct?.id === product.id) {
        setSelectedProduct({ ...selectedProduct, is_lost: !product.is_lost });
      }
    } catch (err) {
      toast.error("Güncellenemedi");
    }
  };

  const loadMoreProducts = async () => {
    if (loadingMore || !hasMoreProducts) return;
    setLoadingMore(true);
    await fetchProducts(true);
    setLoadingMore(false);
  };

  const loadMoreLogs = async () => {
    if (loadingMore || !hasMoreLogs) return;
    setLoadingMore(true);
    await fetchLogs(true);
    setLoadingMore(false);
  };

  // Helpers
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const getActionLabel = (action, details) => {
    // Ürün güncellendi durumunda detayları göster
    if (action === 'product_updated' && details?.changes) {
      return details.changes;
    }
    
    const labels = {
      'assigned': 'Zimmetlendi',
      'returned': 'Geri Alındı',
      'product_created': 'Ürün Oluşturuldu',
      'product_updated': 'Güncellendi',
      'product_deleted': 'Ürün Silindi'
    };
    return labels[action] || action;
  };

  const getActionColor = (action, details) => {
    if (action === 'assigned') return 'text-blue-600 bg-blue-100';
    if (action === 'returned') return 'text-orange-600 bg-orange-100';
    if (action === 'product_created') return 'text-green-600 bg-green-100';
    if (action === 'product_deleted') return 'text-red-600 bg-red-100';
    if (action === 'product_updated') {
      // Duruma göre renk
      if (details?.changes?.includes('Arızalı')) return 'text-yellow-600 bg-yellow-100';
      if (details?.changes?.includes('Kayıp')) return 'text-red-600 bg-red-100';
      if (details?.changes?.includes('kaldırıldı')) return 'text-green-600 bg-green-100';
      return 'text-purple-600 bg-purple-100';
    }
    return 'text-slate-600 bg-slate-100';
  };

  const selectedType = productTypes.find(t => t.id === newProduct.product_type_id);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Yükleniyor...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Zimmet Yönetimi</h2>
          <p className="text-sm text-muted-foreground">{totalProducts} ürün kayıtlı</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowProductTypes(true)}>
            <Settings className="w-4 h-4 mr-1" /> Ürün Tipleri
          </Button>
          <Button size="sm" onClick={() => setShowAddProduct(true)}>
            <Plus className="w-4 h-4 mr-1" /> Yeni Ürün
          </Button>
        </div>
      </div>

      {/* Tabs - Muhasebe ile aynı stil */}
      <div className="relative mb-4">
        <div className="overflow-x-auto scrollbar-hide scroll-smooth">
          <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
            <button
              onClick={() => setActiveTab("products")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "products" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-products"
            >
              <Package className="w-4 h-4" /> Ürünler
            </button>
            <button
              onClick={() => setActiveTab("mali_bellek")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "mali_bellek" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-mali-bellek"
            >
              <FileCheck className="w-4 h-4" /> Mali Bellek
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "logs" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-logs"
            >
              <History className="w-4 h-4" /> Tüm Hareketler
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === "mali_bellek" ? (
        /* Mali Bellek Tab Content - Grid layout: Sol POS listesi, Sağ Loglar */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sol Panel - POS Listesi */}
          <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
            <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Select value={selectedYearMonth} onValueChange={setSelectedYearMonth}>
                    <SelectTrigger className="w-44 h-8 text-sm">
                      <SelectValue placeholder="Ay Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-600 font-medium">
                    {maliBellekData.filter(p => p.mali_bellek?.is_collected).length} Alındı
                  </span>
                  <span className="text-orange-600 font-medium">
                    {maliBellekData.filter(p => !p.mali_bellek?.is_collected).length} Alınmadı
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {maliBellekLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">Yükleniyor...</div>
              ) : maliBellekData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <FileCheck className="w-12 h-12 mb-2 opacity-30" />
                  <p>POS cihazı bulunamadı</p>
                  <p className="text-xs">Önce Ürünler sekmesinden POS cihazı ekleyin</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {maliBellekData.map((product) => (
                    <div key={product.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <div className="text-[10px] text-slate-400 space-y-0.5">
                          {product.pos_serial && <p>POS SN: {product.pos_serial}</p>}
                          {product.pos_terminal && <p>Terminal: {product.pos_terminal}</p>}
                        </div>
                        {product.assigned_to_courier_name && (
                          <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> {product.assigned_to_courier_name}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleMaliBellek(product.id)}
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          product.mali_bellek?.is_collected
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        }`}
                      >
                        {product.mali_bellek?.is_collected ? (
                          <><CheckCircle2 className="w-3 h-3" /> Alındı</>
                        ) : (
                          <><XCircle className="w-3 h-3" /> Alınmadı</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sağ Panel - Ay Bazında Tüm Loglar */}
          <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
            <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <History className="w-4 h-4" /> İşlem Geçmişi
                </h3>
                <span className="text-xs text-muted-foreground">{maliBellekAllLogs.length} kayıt</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {maliBellekAllLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <History className="w-12 h-12 mb-2 opacity-30" />
                  <p>Bu dönem için işlem kaydı yok</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {maliBellekAllLogs.map((log) => (
                    <div key={log.id} className="p-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              log.action === 'collected' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {log.action === 'collected' ? 'Alındı' : 'Kaldırıldı'}
                            </span>
                            <span className="text-xs font-medium truncate">{log.product_name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {log.pos_serial && <span>POS SN: {log.pos_serial} </span>}
                            {log.pos_terminal && <span>| Terminal: {log.pos_terminal}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString('tr-TR', { 
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </p>
                          <p className="text-[10px] text-slate-500">{log.admin_name}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "logs" ? (
      /* Tüm Hareketler - Tek sütun, tam genişlik */
      <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
        <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Ürün, kurye veya admin ara..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {filteredLogs.length} / {totalLogs}
            </span>
          </div>
          {/* Filter checkboxes */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterAssigned" checked={logFilterAssigned} onCheckedChange={setLogFilterAssigned} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterAssigned" className="text-xs text-blue-600 cursor-pointer">Zimmetlendi</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterReturned" checked={logFilterReturned} onCheckedChange={setLogFilterReturned} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterReturned" className="text-xs text-orange-600 cursor-pointer">Geri Alındı</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterDefective" checked={logFilterDefective} onCheckedChange={setLogFilterDefective} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterDefective" className="text-xs text-yellow-600 cursor-pointer">Arızalı</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterDefectiveRemoved" checked={logFilterDefectiveRemoved} onCheckedChange={setLogFilterDefectiveRemoved} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterDefectiveRemoved" className="text-xs text-green-600 cursor-pointer">Arıza Kaldırıldı</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterLost" checked={logFilterLost} onCheckedChange={setLogFilterLost} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterLost" className="text-xs text-red-600 cursor-pointer">Kayıp</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterLostRemoved" checked={logFilterLostRemoved} onCheckedChange={setLogFilterLostRemoved} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterLostRemoved" className="text-xs text-teal-600 cursor-pointer">Kayıp Kaldırıldı</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="logFilterDeleted" checked={logFilterDeleted} onCheckedChange={setLogFilterDeleted} className="h-3.5 w-3.5" />
              <Label htmlFor="logFilterDeleted" className="text-xs text-slate-600 cursor-pointer">Silindi</Label>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <History className="w-12 h-12 mb-2 opacity-30" />
              <p>Hareket kaydı bulunamadı</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${getActionStyle(log.action, log.details)}`}>
                        {getActionLabel(log.action, log.details)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{log.product_name}</p>
                        {log.courier_name && (
                          <p className="text-xs text-blue-600 flex items-center gap-1">
                            <User className="w-3 h-3" /> {log.courier_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-slate-500">{log.admin_name}</p>
                    </div>
                  </div>
                  {/* Detaylar */}
                  <div className="mt-1 text-[10px] text-slate-400">
                    {log.details?.product_type && <span>Tip: {log.details.product_type} </span>}
                    {log.details?.serial_number && <span>SN: {log.details.serial_number} </span>}
                    {log.details?.pos_serial && <span>POS SN: {log.details.pos_serial} </span>}
                    {log.details?.pos_terminal && <span>Terminal: {log.details.pos_terminal} </span>}
                    {log.details?.changes && <span className="text-slate-500">{log.details.changes}</span>}
                    {log.details?.notes && <span className="italic">"{log.details.notes}"</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMoreLogs && (
            <div className="p-3 text-center">
              <Button variant="outline" size="sm" onClick={loadMoreLogs}>
                Daha Fazla Yükle ({totalLogs - logs.length} kaldı)
              </Button>
            </div>
          )}
        </div>
      </div>
      ) : (
      /* Ürünler - İki sütunlu */
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Panel - List */}
        <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
          <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0 space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Ürün, tip, kurye veya seri no ara..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {filteredProducts.length} / {totalProducts}
              </span>
            </div>
            {/* Filter checkboxes - only for products tab */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <Checkbox 
                  id="filterAssigned" 
                  checked={filterAssigned} 
                  onCheckedChange={setFilterAssigned}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="filterAssigned" className="text-xs text-blue-600 cursor-pointer">Zimmetliler</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox 
                  id="filterAvailable" 
                  checked={filterAvailable} 
                  onCheckedChange={setFilterAvailable}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="filterAvailable" className="text-xs text-green-600 cursor-pointer">Boştakiler</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox 
                  id="filterDefective" 
                  checked={filterDefective} 
                  onCheckedChange={setFilterDefective}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="filterDefective" className="text-xs text-yellow-600 cursor-pointer">Arızalı</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox 
                  id="filterLost" 
                  checked={filterLost} 
                  onCheckedChange={setFilterLost}
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="filterLost" className="text-xs text-red-600 cursor-pointer">Kayıp</Label>
              </div>
            </div>
          </div>
                  />
                  <Label htmlFor="logFilterDeleted" className="text-xs text-slate-600 cursor-pointer">Silindi</Label>
                </div>
              </div>
            )}
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto">
            {activeTab === "products" ? (
              /* Products List */
              filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground p-8 text-center">
                  {searchQuery ? "Arama sonucu bulunamadı" : "Henüz ürün yok"}
                </p>
              ) : (
                <>
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                        selectedProduct?.id === product.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{product.name}</p>
                            {product.is_defective && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> Arızalı
                              </span>
                            )}
                            {product.is_lost && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex items-center gap-0.5">
                                <XCircle className="w-3 h-3" /> Kayıp
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{product.product_type_name}</p>
                          {/* Seri numaraları gösterimi */}
                          <div className="text-[10px] text-slate-400 space-y-0.5">
                            {product.serial_number && (
                              <p>SN: {product.serial_number}</p>
                            )}
                            {product.pos_serial && (
                              <p>Pos SN: {product.pos_serial}</p>
                            )}
                            {product.pos_terminal && (
                              <p>Pos Terminal: {product.pos_terminal}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          {product.assigned_to_courier_id ? (
                            <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              <User className="w-3 h-3" />
                              <span className="truncate max-w-[80px]">{product.assigned_to_courier_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Boşta</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMoreProducts && !searchQuery && (
                    <div className="text-center py-3">
                      <Button size="sm" variant="outline" onClick={loadMoreProducts} disabled={loadingMore} className="h-8 text-xs">
                        {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalProducts - products.length} kaldı)`}
                      </Button>
                    </div>
                  )}
                </>
              )
            ) : (
              /* Logs List */
              filteredLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-8 text-center">
                  {searchQuery ? "Arama sonucu bulunamadı" : "Henüz hareket yok"}
                </p>
              ) : (
                <>
                  {filteredLogs.map((log) => (
                    <div key={log.id} className="p-3 border-b border-slate-100 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getActionColor(log.action, log.details)}`}>
                              {getActionLabel(log.action, log.details)}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                          </div>
                          <p className="text-sm font-medium">{log.product_name}</p>
                          {log.courier_name && (
                            <p className="text-xs text-slate-600">
                              <User className="w-3 h-3 inline mr-1" />{log.courier_name}
                            </p>
                          )}
                          {/* Detaylar gösterimi */}
                          <div className="text-[10px] text-slate-400">
                            {log.details?.product_type && (
                              <span>Tip: {log.details.product_type} </span>
                            )}
                            {log.details?.serial_number && (
                              <span>SN: {log.details.serial_number} </span>
                            )}
                            {log.details?.pos_serial && (
                              <span>Pos SN: {log.details.pos_serial} </span>
                            )}
                            {log.details?.pos_terminal && (
                              <span>Pos Terminal: {log.details.pos_terminal}</span>
                            )}
                          </div>
                          {log.details?.notes && (
                            <p className="text-[10px] text-slate-500 italic">"{log.details.notes}"</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">{log.admin_name}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMoreLogs && !searchQuery && (
                    <div className="text-center py-3">
                      <Button size="sm" variant="outline" onClick={loadMoreLogs} disabled={loadingMore} className="h-8 text-xs">
                        {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalLogs - logs.length} kaldı)`}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
          {selectedProduct ? (
            <>
              {/* Product Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{selectedProduct.name}</h2>
                    <p className="text-sm text-muted-foreground">{selectedProduct.product_type_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedProduct.is_defective && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">Arızalı</span>
                      )}
                      {selectedProduct.is_lost && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Kayıp</span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedProduct(null)}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
                {/* Düzenle butonu */}
                <Button size="sm" variant="outline" onClick={() => openEditProduct(selectedProduct)} className="mt-2">
                  <Pencil className="w-4 h-4 mr-1" /> Düzenle
                </Button>
              </div>

              {/* Product Info */}
              <div className="p-4 border-b border-slate-200 space-y-2 shrink-0">
                {selectedProduct.serial_number && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Seri No:</span>
                    <span className="font-mono">{selectedProduct.serial_number}</span>
                  </div>
                )}
                {selectedProduct.pos_serial && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pos SN:</span>
                    <span className="font-mono">{selectedProduct.pos_serial}</span>
                  </div>
                )}
                {selectedProduct.pos_terminal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pos Terminal:</span>
                    <span className="font-mono">{selectedProduct.pos_terminal}</span>
                  </div>
                )}
                
                {/* Assignment Status */}
                <div className="pt-2 mt-2 border-t border-slate-100">
                  {selectedProduct.assigned_to_courier_id ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-600">
                        <User className="w-4 h-4" />
                        <span className="font-medium">{selectedProduct.assigned_to_courier_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {selectedProduct.assigned_at && formatDate(selectedProduct.assigned_at)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-green-600 font-medium">Boşta - Zimmetli değil</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-b border-slate-200 flex flex-wrap gap-2 shrink-0">
                {selectedProduct.assigned_to_courier_id ? (
                  <Button size="sm" variant="outline" onClick={() => setShowReturnModal(true)}>
                    <ArrowLeftRight className="w-4 h-4 mr-1" /> Geri Al
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setShowAssignModal(true)} disabled={selectedProduct.is_lost}>
                    <User className="w-4 h-4 mr-1" /> Zimmetle
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant={selectedProduct.is_defective ? "default" : "outline"}
                  onClick={() => handleToggleDefective(selectedProduct)}
                  className={selectedProduct.is_defective ? "bg-yellow-500 hover:bg-yellow-600" : ""}
                >
                  <AlertTriangle className="w-4 h-4 mr-1" /> 
                  {selectedProduct.is_defective ? "Arıza Kaldır" : "Arızalı"}
                </Button>
                <Button 
                  size="sm" 
                  variant={selectedProduct.is_lost ? "default" : "outline"}
                  onClick={() => handleToggleLost(selectedProduct)}
                  className={selectedProduct.is_lost ? "bg-red-500 hover:bg-red-600" : ""}
                >
                  <XCircle className="w-4 h-4 mr-1" /> 
                  {selectedProduct.is_lost ? "Kayıp Kaldır" : "Kayıp"}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => handleDeleteProduct(selectedProduct.id)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                  disabled={selectedProduct.assigned_to_courier_id}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* History */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-3 bg-slate-50 border-b border-slate-200 sticky top-0">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <History className="w-4 h-4" /> Ürün Hareketleri
                  </h3>
                </div>
                {productHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">Henüz geçmiş yok</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {productHistory.map((log) => (
                      <div key={log.id} className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getActionColor(log.action, log.details)}`}>
                            {getActionLabel(log.action, log.details)}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                        </div>
                        {log.courier_name && (
                          <p className="text-sm"><User className="w-3 h-3 inline mr-1" />{log.courier_name}</p>
                        )}
                        <p className="text-[10px] text-slate-500">Admin: {log.admin_name}</p>
                        {log.details?.notes && (
                          <p className="text-[10px] text-slate-400 italic mt-1">"{log.details.notes}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Package className="w-12 h-12 mb-2 opacity-30" />
              <p>Detay görmek için ürün seçin</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Product Types Modal */}
      <Dialog open={showProductTypes} onOpenChange={(open) => { setShowProductTypes(open); if (!open) setEditingType(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ürün Tipleri</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add new type */}
            <div className="flex gap-2">
              <Input
                placeholder="Yeni tip adı..."
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddProductType} disabled={!newTypeName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="hasPos" 
                checked={newTypeHasPos} 
                onCheckedChange={setNewTypeHasPos}
              />
              <Label htmlFor="hasPos" className="text-sm">POS Cihazı (Seri No + Terminal No alanları)</Label>
            </div>

            {/* Types list */}
            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
              {productTypes.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">Henüz ürün tipi yok</p>
              ) : (
                productTypes.map((type) => (
                  <div key={type.id} className="p-3">
                    {editingType?.id === type.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editingType.name}
                          onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                          className="h-8"
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id={`editHasPos-${type.id}`}
                            checked={editingType.has_pos_fields} 
                            onCheckedChange={(checked) => setEditingType({ ...editingType, has_pos_fields: checked })}
                          />
                          <Label htmlFor={`editHasPos-${type.id}`} className="text-xs">POS alanları</Label>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleEditProductType}>Kaydet</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingType(null)}>İptal</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{type.name}</p>
                          {type.has_pos_fields && (
                            <p className="text-xs text-muted-foreground">POS alanları aktif</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingType({ id: type.id, name: type.name, has_pos_fields: type.has_pos_fields })}>
                            <Pencil className="w-4 h-4 text-slate-500" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteProductType(type.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Product Modal */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Ürün Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="space-y-2">
              <Label>Ürün Adı *</Label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="Örn: POS Cihazı #1"
              />
            </div>
            <div className="space-y-2">
              <Label>Ürün Tipi *</Label>
              <Select 
                value={newProduct.product_type_id} 
                onValueChange={(v) => setNewProduct({ ...newProduct, product_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tip seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {productTypes.length === 0 && (
                <p className="text-xs text-orange-600">Önce ürün tipi oluşturun</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Seri Numarası</Label>
              <Input
                value={newProduct.serial_number}
                onChange={(e) => setNewProduct({ ...newProduct, serial_number: e.target.value })}
                placeholder="Opsiyonel"
              />
            </div>
            {selectedType?.has_pos_fields && (
              <>
                <div className="space-y-2">
                  <Label>POS Cihazı Seri No</Label>
                  <Input
                    value={newProduct.pos_serial}
                    onChange={(e) => setNewProduct({ ...newProduct, pos_serial: e.target.value })}
                    placeholder="POS seri numarası"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Banka Terminal No</Label>
                  <Input
                    value={newProduct.pos_terminal}
                    onChange={(e) => setNewProduct({ ...newProduct, pos_terminal: e.target.value })}
                    placeholder="Terminal numarası"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Notlar</Label>
              <Input
                value={newProduct.notes}
                onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })}
                placeholder="Opsiyonel notlar"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddProduct(false)}>İptal</Button>
              <Button type="submit">Ekle</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={showEditProduct} onOpenChange={setShowEditProduct}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ürünü Düzenle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditProduct} className="space-y-4">
            <div className="space-y-2">
              <Label>Ürün Adı *</Label>
              <Input
                value={editProduct.name}
                onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                placeholder="Ürün adı"
              />
            </div>
            <div className="space-y-2">
              <Label>Ürün Tipi *</Label>
              <Select 
                value={editProduct.product_type_id} 
                onValueChange={(v) => setEditProduct({ ...editProduct, product_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tip seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Seri Numarası</Label>
              <Input
                value={editProduct.serial_number}
                onChange={(e) => setEditProduct({ ...editProduct, serial_number: e.target.value })}
                placeholder="Opsiyonel"
              />
            </div>
            {productTypes.find(t => t.id === editProduct.product_type_id)?.has_pos_fields && (
              <>
                <div className="space-y-2">
                  <Label>Pos SN</Label>
                  <Input
                    value={editProduct.pos_serial}
                    onChange={(e) => setEditProduct({ ...editProduct, pos_serial: e.target.value })}
                    placeholder="POS seri numarası"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pos Terminal</Label>
                  <Input
                    value={editProduct.pos_terminal}
                    onChange={(e) => setEditProduct({ ...editProduct, pos_terminal: e.target.value })}
                    placeholder="Terminal numarası"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Notlar</Label>
              <Input
                value={editProduct.notes}
                onChange={(e) => setEditProduct({ ...editProduct, notes: e.target.value })}
                placeholder="Opsiyonel notlar"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditProduct(false)}>İptal</Button>
              <Button type="submit">Kaydet</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ürünü Zimmetle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>{selectedProduct?.name}</strong> ürününü kime zimmetlemek istiyorsunuz?
            </p>
            <div className="space-y-2">
              <Label>Kurye Seçin *</Label>
              <Select value={assignCourierId} onValueChange={setAssignCourierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kurye seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {couriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Not (Opsiyonel)</Label>
              <Input
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Zimmet notu..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>İptal</Button>
            <Button onClick={handleAssign} disabled={!assignCourierId}>Zimmetle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Modal */}
      <Dialog open={showReturnModal} onOpenChange={setShowReturnModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zimmeti Geri Al</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>{selectedProduct?.name}</strong> ürününü <strong>{selectedProduct?.assigned_to_courier_name}</strong>'dan geri almak istediğinize emin misiniz?
            </p>
            <div className="space-y-2">
              <Label>Not (Opsiyonel)</Label>
              <Input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Geri alma notu..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnModal(false)}>İptal</Button>
            <Button onClick={handleReturn} variant="destructive">Geri Al</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
