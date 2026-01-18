import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useZimmetData(companyId, adminId, adminName) {
  // Core data states
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
  const [loading, setLoading] = useState(true);

  // Fetch functions
  const fetchProducts = useCallback(async (append = false) => {
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
  }, [companyId, products.length]);

  const fetchProductTypes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/product-types`);
      setProductTypes(res.data);
    } catch (err) {}
  }, [companyId]);

  const fetchCouriers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data.filter(c => !c.is_archived));
    } catch (err) {}
  }, [companyId]);

  const fetchLogs = useCallback(async (append = false) => {
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
  }, [companyId, logs.length]);

  const fetchProductHistory = useCallback(async (productId) => {
    try {
      const res = await axios.get(`${API}/products/${productId}/history`);
      setProductHistory(res.data);
    } catch (err) {}
  }, []);

  // Load more functions
  const loadMoreProducts = useCallback(async () => {
    if (loadingMore || !hasMoreProducts) return;
    setLoadingMore(true);
    await fetchProducts(true);
    setLoadingMore(false);
  }, [loadingMore, hasMoreProducts, fetchProducts]);

  const loadMoreLogs = useCallback(async () => {
    if (loadingMore || !hasMoreLogs) return;
    setLoadingMore(true);
    await fetchLogs(true);
    setLoadingMore(false);
  }, [loadingMore, hasMoreLogs, fetchLogs]);

  // Product type handlers
  const handleAddProductType = useCallback(async (name, hasPos) => {
    if (!name.trim()) return;
    try {
      await axios.post(`${API}/companies/${companyId}/product-types`, {
        name: name.trim(),
        has_pos_fields: hasPos
      });
      toast.success("Ürün tipi eklendi");
      fetchProductTypes();
      return true;
    } catch (err) {
      toast.error("Eklenemedi");
      return false;
    }
  }, [companyId, fetchProductTypes]);

  const handleEditProductType = useCallback(async (typeId, name, hasPos) => {
    if (!name.trim()) return;
    try {
      await axios.put(`${API}/product-types/${typeId}`, {
        name: name.trim(),
        has_pos_fields: hasPos
      });
      toast.success("Ürün tipi güncellendi");
      fetchProductTypes();
      return true;
    } catch (err) {
      toast.error("Güncellenemedi");
      return false;
    }
  }, [fetchProductTypes]);

  const handleDeleteProductType = useCallback(async (typeId) => {
    if (!window.confirm("Bu ürün tipini silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/product-types/${typeId}`);
      toast.success("Silindi");
      fetchProductTypes();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silinemedi");
    }
  }, [fetchProductTypes]);

  // Product handlers
  const handleAddProduct = useCallback(async (productData) => {
    if (!productData.name.trim() || !productData.product_type_id) {
      toast.error("Ürün adı ve tipi gerekli");
      return false;
    }
    try {
      await axios.post(`${API}/companies/${companyId}/products?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, productData);
      toast.success("Ürün eklendi");
      fetchProducts();
      fetchLogs();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Eklenemedi");
      return false;
    }
  }, [companyId, adminId, adminName, fetchProducts, fetchLogs]);

  const handleEditProduct = useCallback(async (productId, productData) => {
    if (!productData.name.trim() || !productData.product_type_id) {
      toast.error("Ürün adı ve tipi gerekli");
      return false;
    }
    try {
      await axios.put(`${API}/products/${productId}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`, productData);
      toast.success("Ürün güncellendi");
      fetchProducts();
      fetchLogs();
      
      // Refresh selected product if it was the edited one
      if (selectedProduct?.id === productId) {
        const updated = await axios.get(`${API}/products/${productId}`);
        setSelectedProduct(updated.data);
      }
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncellenemedi");
      return false;
    }
  }, [adminId, adminName, fetchProducts, fetchLogs, selectedProduct?.id]);

  const handleDeleteProduct = useCallback(async (productId) => {
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
  }, [adminId, adminName, selectedProduct?.id, fetchProducts, fetchLogs]);

  // Assignment handlers
  const handleAssign = useCallback(async (product, courierId, notes) => {
    if (!courierId || !product) return false;
    const courier = couriers.find(c => c.id === courierId);
    if (!courier) return false;

    try {
      await axios.post(`${API}/products/${product.id}/assign`, {
        courier_id: courierId,
        courier_name: courier.name,
        admin_id: adminId,
        admin_name: adminName,
        notes
      });
      toast.success(`${product.name} → ${courier.name}'a zimmetlendi`);
      fetchProducts();
      fetchLogs();
      
      // Refresh selected product
      const updated = await axios.get(`${API}/products/${product.id}`);
      setSelectedProduct(updated.data);
      fetchProductHistory(product.id);
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Zimmetlenemedi");
      return false;
    }
  }, [couriers, adminId, adminName, fetchProducts, fetchLogs, fetchProductHistory]);

  const handleReturn = useCallback(async (product, notes) => {
    if (!product) return false;
    try {
      await axios.post(`${API}/products/${product.id}/return`, {
        admin_id: adminId,
        admin_name: adminName,
        notes
      });
      toast.success("Zimmet geri alındı");
      fetchProducts();
      fetchLogs();
      
      // Refresh selected product
      const updated = await axios.get(`${API}/products/${product.id}`);
      setSelectedProduct(updated.data);
      fetchProductHistory(product.id);
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Geri alınamadı");
      return false;
    }
  }, [adminId, adminName, fetchProducts, fetchLogs, fetchProductHistory]);

  // Toggle handlers
  const handleToggleDefective = useCallback(async (product) => {
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
  }, [adminId, adminName, fetchProducts, fetchLogs, selectedProduct]);

  const handleToggleLost = useCallback(async (product) => {
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
  }, [adminId, adminName, fetchProducts, fetchLogs, selectedProduct]);

  // Initial data load
  useEffect(() => {
    if (companyId) {
      Promise.all([fetchProducts(), fetchProductTypes(), fetchCouriers(), fetchLogs()])
        .finally(() => setLoading(false));
    }
  }, [companyId]);

  // Fetch product history when selected
  useEffect(() => {
    if (selectedProduct) {
      fetchProductHistory(selectedProduct.id);
    }
  }, [selectedProduct, fetchProductHistory]);

  return {
    // Data
    products,
    productTypes,
    couriers,
    logs,
    totalProducts,
    totalLogs,
    hasMoreProducts,
    hasMoreLogs,
    loadingMore,
    selectedProduct,
    setSelectedProduct,
    productHistory,
    loading,
    // Fetch functions
    fetchProducts,
    fetchProductTypes,
    fetchLogs,
    // Load more
    loadMoreProducts,
    loadMoreLogs,
    // Product type handlers
    handleAddProductType,
    handleEditProductType,
    handleDeleteProductType,
    // Product handlers
    handleAddProduct,
    handleEditProduct,
    handleDeleteProduct,
    // Assignment handlers
    handleAssign,
    handleReturn,
    // Toggle handlers
    handleToggleDefective,
    handleToggleLost,
  };
}
