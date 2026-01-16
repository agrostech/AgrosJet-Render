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
  AlertTriangle, XCircle, ArrowLeftRight, ChevronRight, Filter
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
  const [activeTab, setActiveTab] = useState("products"); // products | logs
  const [loading, setLoading] = useState(true);

  // Filter states
  const [filterAssigned, setFilterAssigned] = useState(false); // Zimmetliler
  const [filterAvailable, setFilterAvailable] = useState(false); // Boştakiler
  const [filterDefective, setFilterDefective] = useState(false); // Arızalı
  const [filterLost, setFilterLost] = useState(false); // Kayıp

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showProductTypes, setShowProductTypes] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: ""
  });
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeHasPos, setNewTypeHasPos] = useState(false);
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
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(l => 
      l.product_name?.toLowerCase().includes(q) ||
      l.courier_name?.toLowerCase().includes(q) ||
      l.admin_name?.toLowerCase().includes(q) ||
      l.details?.serial_number?.toLowerCase().includes(q) ||
      l.details?.pos_serial?.toLowerCase().includes(q) ||
      l.details?.pos_terminal?.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

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

  useEffect(() => {
    if (companyId) {
      Promise.all([fetchProducts(), fetchProductTypes(), fetchCouriers(), fetchLogs()])
        .finally(() => setLoading(false));
    }
  }, [companyId]);

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
          <h1 className="text-xl font-bold text-slate-800">Zimmet Yönetimi</h1>
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "products" 
              ? "border-blue-500 text-blue-600" 
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Package className="w-4 h-4 inline mr-1" /> Ürünler
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "logs" 
              ? "border-blue-500 text-blue-600" 
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <History className="w-4 h-4 inline mr-1" /> Tüm Hareketler
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Panel - List */}
        <div className="border-2 border-border bg-white h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
          <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0 space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder={activeTab === "products" ? "Ürün, tip veya kurye ara..." : "Ürün, kurye veya admin ara..."} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {activeTab === "products" ? `${filteredProducts.length} / ${totalProducts}` : `${logs.length} / ${totalLogs}`}
              </span>
            </div>
            {/* Filter checkboxes - only for products tab */}
            {activeTab === "products" && (
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
                              <p>POS: {product.pos_serial}</p>
                            )}
                            {product.pos_terminal && (
                              <p>Terminal: {product.pos_terminal}</p>
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
                          {/* Seri numaraları gösterimi */}
                          <div className="text-[10px] text-slate-400">
                            {log.details?.serial_number && (
                              <span>SN: {log.details.serial_number} </span>
                            )}
                            {log.details?.pos_serial && (
                              <span>POS: {log.details.pos_serial} </span>
                            )}
                            {log.details?.pos_terminal && (
                              <span>Terminal: {log.details.pos_terminal}</span>
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
                    <span className="text-muted-foreground">POS Seri No:</span>
                    <span className="font-mono">{selectedProduct.pos_serial}</span>
                  </div>
                )}
                {selectedProduct.pos_terminal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Terminal No:</span>
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

      {/* Product Types Modal */}
      <Dialog open={showProductTypes} onOpenChange={setShowProductTypes}>
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
                  <div key={type.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{type.name}</p>
                      {type.has_pos_fields && (
                        <p className="text-xs text-muted-foreground">POS alanları aktif</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteProductType(type.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
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
