import { useState, useEffect, useCallback } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Plus, Pencil, Trash2, ImageIcon } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function JetPuanProductsTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: "", description: "", price: "", stock: "", category_id: "", image_url: ""
  });
  const [filterCategory, setFilterCategory] = useState("all");
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/jetpuan/products`),
        axios.get(`${API}/jetpuan/categories`)
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Veriler yüklenemedi");
      }
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
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "İşlem başarısız");
      }
    }
  };

  const handleDelete = async (productId) => {
    setPendingDeleteId(productId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/jetpuan/products/${pendingDeleteId}`);
      toast.success("Ürün silindi");
      fetchData();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Silme başarısız");
      }
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
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

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Ürün Silme"
        description="Bu ürünü silmek istediğinize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}
