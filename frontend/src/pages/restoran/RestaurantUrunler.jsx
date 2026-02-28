import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, Link, Download, Trash2, Package, FolderOpen, Check, AlertCircle,
  Plus, Pencil, X, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantUrunler({ restaurantId }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);
  const [savedProducts, setSavedProducts] = useState({ categories: [], products: [] });
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  
  // CRUD States
  const [categoryDialog, setCategoryDialog] = useState({ open: false, mode: 'create', data: null });
  const [productDialog, setProductDialog] = useState({ open: false, mode: 'create', data: null });
  const [deleteItemDialog, setDeleteItemDialog] = useState({ open: false, type: null, item: null });
  const [expandedCategories, setExpandedCategories] = useState({});
  const [menuImportOpen, setMenuImportOpen] = useState(false);

  // Form States
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', category_id: '' });

  // Kayıtlı ürünleri yükle
  const loadSavedProducts = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/products/restaurant/${restaurantId}`);
      setSavedProducts(res.data);
      // Kategorileri default olarak kapalı tut
      setExpandedCategories({});
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadSavedProducts();
  }, [loadSavedProducts]);

  // URL'den menü çek
  const handleScrape = async () => {
    if (!url.trim()) {
      toast.error("Lütfen bir URL girin");
      return;
    }

    if (!url.includes("tgoyemek.com")) {
      toast.error("Sadece TGO Yemek URL'leri desteklenmektedir");
      return;
    }

    setScraping(true);
    setScrapedData(null);

    try {
      const res = await axios.post(`${API}/products/scrape`, {
        url: url.trim(),
        restaurant_id: restaurantId
      });
      setScrapedData(res.data);
      toast.success(`${res.data.total_products} ürün bulundu!`);
    } catch (err) {
      const message = err.response?.data?.detail || "Menü çekilemedi";
      toast.error(message);
    } finally {
      setScraping(false);
    }
  };

  // Ürünleri kaydet
  const handleSave = async () => {
    if (!scrapedData || !scrapedData.products.length) return;

    setSaving(true);
    try {
      const res = await axios.post(`${API}/products/save`, {
        restaurant_id: restaurantId,
        products: scrapedData.products
      });
      toast.success(res.data.message);
      setScrapedData(null);
      setUrl("");
      setConfirmDialog(false);
      loadSavedProducts();
    } catch (err) {
      const message = err.response?.data?.detail || "Ürünler kaydedilemedi";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Tüm ürünleri sil
  const handleDeleteAll = async () => {
    try {
      const res = await axios.delete(`${API}/products/restaurant/${restaurantId}`);
      toast.success(`${res.data.deleted_products} ürün silindi`);
      setDeleteDialog(false);
      loadSavedProducts();
    } catch (err) {
      toast.error("Ürünler silinemedi");
    }
  };

  // =====================
  // CATEGORY CRUD
  // =====================
  
  const openCategoryDialog = (mode, category = null) => {
    setCategoryForm({ name: category?.name || '' });
    setCategoryDialog({ open: true, mode, data: category });
  };

  const handleCategorySubmit = async () => {
    if (!categoryForm.name.trim()) {
      toast.error("Kategori adı gerekli");
      return;
    }

    try {
      if (categoryDialog.mode === 'create') {
        await axios.post(`${API}/products/categories`, {
          name: categoryForm.name.trim(),
          restaurant_id: restaurantId
        });
        toast.success("Kategori oluşturuldu");
      } else {
        await axios.put(`${API}/products/categories/${categoryDialog.data.id}`, {
          name: categoryForm.name.trim()
        });
        toast.success("Kategori güncellendi");
      }
      setCategoryDialog({ open: false, mode: 'create', data: null });
      loadSavedProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleDeleteCategory = async () => {
    try {
      await axios.delete(`${API}/products/categories/${deleteItemDialog.item.id}`);
      toast.success("Kategori silindi");
      setDeleteItemDialog({ open: false, type: null, item: null });
      loadSavedProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silinemedi");
    }
  };

  // Kategori sıralaması değiştir
  const moveCategoryOrder = async (categoryId, direction) => {
    const categories = [...savedProducts.categories];
    const index = categories.findIndex(c => c.id === categoryId);
    
    if (direction === 'up' && index > 0) {
      [categories[index], categories[index - 1]] = [categories[index - 1], categories[index]];
    } else if (direction === 'down' && index < categories.length - 1) {
      [categories[index], categories[index + 1]] = [categories[index + 1], categories[index]];
    } else {
      return;
    }
    
    // Optimistic UI update
    setSavedProducts(prev => ({ ...prev, categories }));
    
    // Backend'e yeni sıralamayı gönder
    const categoryOrders = categories.map((c, i) => ({ id: c.id, order: i }));
    
    try {
      await axios.put(`${API}/products/categories/reorder`, {
        restaurant_id: restaurantId,
        category_orders: categoryOrders
      });
      toast.success("Sıralama güncellendi");
    } catch (err) {
      toast.error("Sıralama kaydedilemedi");
      loadSavedProducts(); // Hata durumunda orijinal veriyi yükle
    }
  };

  // =====================
  // PRODUCT CRUD
  // =====================
  
  const openProductDialog = (mode, product = null, categoryId = null) => {
    setProductForm({
      name: product?.name || '',
      description: product?.description || '',
      price: product?.price?.toString() || '',
      category_id: product?.category_id || categoryId || ''
    });
    setProductDialog({ open: true, mode, data: product });
  };

  const handleProductSubmit = async () => {
    if (!productForm.name.trim()) {
      toast.error("Ürün adı gerekli");
      return;
    }
    if (!productForm.price || isNaN(parseFloat(productForm.price))) {
      toast.error("Geçerli bir fiyat girin");
      return;
    }
    if (!productForm.category_id) {
      toast.error("Kategori seçin");
      return;
    }

    try {
      if (productDialog.mode === 'create') {
        await axios.post(`${API}/products/items`, {
          name: productForm.name.trim(),
          description: productForm.description.trim() || null,
          price: parseFloat(productForm.price),
          category_id: productForm.category_id,
          restaurant_id: restaurantId
        });
        toast.success("Ürün oluşturuldu");
      } else {
        await axios.put(`${API}/products/items/${productDialog.data.id}`, {
          name: productForm.name.trim(),
          description: productForm.description.trim() || null,
          price: parseFloat(productForm.price),
          category_id: productForm.category_id
        });
        toast.success("Ürün güncellendi");
      }
      setProductDialog({ open: false, mode: 'create', data: null });
      loadSavedProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleDeleteProduct = async () => {
    try {
      await axios.delete(`${API}/products/items/${deleteItemDialog.item.id}`);
      toast.success("Ürün silindi");
      setDeleteItemDialog({ open: false, type: null, item: null });
      loadSavedProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silinemedi");
    }
  };

  // Kategoriye göre ürünleri grupla
  const groupProductsByCategory = (products, categories) => {
    const groups = {};
    categories.forEach(cat => {
      groups[cat.id] = {
        category: cat,
        products: products.filter(p => p.category_id === cat.id)
      };
    });
    return groups;
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0
    }).format(price);
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="restaurant-urunler">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900">Ürünler</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Menü ve ürün yönetimi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openCategoryDialog('create')} data-testid="add-category-btn">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Kategori Ekle</span>
            <span className="sm:hidden">Kategori</span>
          </Button>
          <Button size="sm" onClick={() => openProductDialog('create')} data-testid="add-product-btn">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Ürün Ekle</span>
            <span className="sm:hidden">Ürün</span>
          </Button>
        </div>
      </div>

      {/* URL Import Card - Collapsible */}
      <Collapsible open={menuImportOpen} onOpenChange={setMenuImportOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-slate-50">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Menü Çek
                </div>
                {menuImportOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {/* TGO Yemek Alt Kartı */}
              <Card className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">TGO Yemek</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="https://tgoyemek.com/restoranlar/..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={scraping}
                        data-testid="scrape-url-input"
                      />
                    </div>
                    <Button 
                      onClick={handleScrape} 
                      disabled={scraping || !url.trim()}
                      data-testid="scrape-button"
                    >
                      {scraping ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Çekiliyor...
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4 mr-2" />
                          Menü Çek
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    TGO Yemek restoran sayfası URL'sini girin. Örnek: https://tgoyemek.com/restoranlar/XXXXXX
                  </p>
                </CardContent>
              </Card>
              
              {/* İleride eklenecek platformlar için yer tutucu */}
              {/* 
              <Card className="border-dashed opacity-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Yemeksepeti (Yakında)</CardTitle>
                </CardHeader>
              </Card>
              */}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Scraped Results */}
      {scrapedData && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-green-800">
                <Check className="w-5 h-5" />
                Çekilen Menü: {scrapedData.restaurant_name}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="secondary">{scrapedData.categories.length} Kategori</Badge>
                <Badge variant="secondary">{scrapedData.total_products} Ürün</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-96 overflow-y-auto">
              {scrapedData.categories.map((category) => {
                const categoryProducts = scrapedData.products.filter(p => p.category === category);
                return (
                  <div key={category} className="mb-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      {category}
                      <Badge variant="outline">{categoryProducts.length}</Badge>
                    </h4>
                    <div className="pl-6 space-y-1">
                      {categoryProducts.slice(0, 3).map((product, idx) => (
                        <div key={idx} className="text-sm flex justify-between">
                          <span>{product.name}</span>
                          <span className="font-medium">{formatPrice(product.price)}</span>
                        </div>
                      ))}
                      {categoryProducts.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{categoryProducts.length - 3} ürün daha...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setScrapedData(null)}>
                İptal
              </Button>
              <Button onClick={() => setConfirmDialog(true)} data-testid="save-products-button">
                <Check className="w-4 h-4 mr-2" />
                Ürünleri Kaydet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Products */}
      <Card className="overflow-hidden">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              Kayıtlı Ürünler
            </CardTitle>
            {savedProducts.products.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setDeleteDialog(true)}
                data-testid="delete-all-button"
              >
                <Trash2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Tümünü Sil</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedProducts.products.length === 0 && savedProducts.categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">Henüz ürün yok</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-sm px-4">
                Yukarıdaki butonlarla manuel ürün ekleyebilir veya TGO Yemek'ten menü çekebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 mb-3 sm:mb-4">
                <Badge variant="secondary" className="text-xs">{savedProducts.categories_count} Kategori</Badge>
                <Badge variant="secondary" className="text-xs">{savedProducts.products_count} Ürün</Badge>
              </div>
              
              {Object.entries(groupProductsByCategory(savedProducts.products, savedProducts.categories)).map(([catId, group], catIndex, catArray) => (
                <Collapsible 
                  key={catId} 
                  open={expandedCategories[catId]} 
                  onOpenChange={() => toggleCategory(catId)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-2 sm:p-3 hover:bg-slate-50 cursor-pointer gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                          {expandedCategories[catId] ? (
                            <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          )}
                          <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="font-medium text-sm sm:text-base truncate">{group.category.name}</span>
                          <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">{group.products.length}</Badge>
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Sıralama butonları - mobilde gizle */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveCategoryOrder(catId, 'up')}
                            disabled={catIndex === 0}
                            title="Yukarı taşı"
                            className="hidden sm:flex text-muted-foreground hover:text-slate-900 h-7 w-7 p-0"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveCategoryOrder(catId, 'down')}
                            disabled={catIndex === catArray.length - 1}
                            title="Aşağı taşı"
                            className="hidden sm:flex text-muted-foreground hover:text-slate-900 h-7 w-7 p-0"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <div className="hidden sm:block w-px h-5 bg-slate-200 mx-0.5" />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openProductDialog('create', null, catId)}
                            title="Bu kategoriye ürün ekle"
                            className="h-7 w-7 p-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openCategoryDialog('edit', group.category)}
                            className="h-7 w-7 p-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                            onClick={() => setDeleteItemDialog({ open: true, type: 'category', item: group.category })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {/* Mobil için kart görünümü */}
                      <div className="sm:hidden border-t divide-y">
                        {group.products.map((product) => (
                          <div key={product.id} className="p-3 flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{product.name}</p>
                              {product.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                              )}
                              <p className="font-semibold text-sm text-primary mt-1">{formatPrice(product.price)}</p>
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openProductDialog('edit', product)}
                                className="h-7 w-7 p-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                                onClick={() => setDeleteItemDialog({ open: true, type: 'product', item: product })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Desktop için tablo görünümü */}
                      <div className="hidden sm:block">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[30%]">Ürün Adı</TableHead>
                              <TableHead className="w-[40%] text-left">Açıklama</TableHead>
                              <TableHead className="w-[15%] text-right">Fiyat</TableHead>
                              <TableHead className="w-[15%]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.products.map((product) => (
                              <TableRow key={product.id}>
                                <TableCell className="font-medium truncate">{product.name}</TableCell>
                                <TableCell className="text-left text-muted-foreground text-sm truncate">
                                  {product.description || "-"}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {formatPrice(product.price)}
                                </TableCell>
                                <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openProductDialog('edit', product)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => setDeleteItemDialog({ open: true, type: 'product', item: product })}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {group.products.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                Bu kategoride ürün yok
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      </div>
                      {/* Mobil boş durum */}
                      {group.products.length === 0 && (
                        <div className="sm:hidden p-4 text-center text-muted-foreground text-sm border-t">
                          Bu kategoride ürün yok
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Save Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Ürünleri Kaydet
            </DialogTitle>
            <DialogDescription>
              {savedProducts.products.length > 0 ? (
                <>
                  <span className="text-amber-600 font-medium">Dikkat:</span> Mevcut {savedProducts.products.length} ürün silinecek ve 
                  yeni çekilen {scrapedData?.total_products} ürün kaydedilecek.
                </>
              ) : (
                <>
                  {scrapedData?.total_products} ürün ve {scrapedData?.categories.length} kategori kaydedilecek.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                "Kaydet"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirm Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Tüm Ürünleri Sil
            </DialogTitle>
            <DialogDescription>
              Bu işlem geri alınamaz. {savedProducts.products_count} ürün ve {savedProducts.categories_count} kategori kalıcı olarak silinecek.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll}>
              Evet, Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(open) => setCategoryDialog({ ...categoryDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryDialog.mode === 'create' ? 'Yeni Kategori' : 'Kategori Düzenle'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="category-name">Kategori Adı</Label>
              <Input
                id="category-name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                placeholder="Örn: Tatlılar, İçecekler"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog({ open: false, mode: 'create', data: null })}>
              İptal
            </Button>
            <Button onClick={handleCategorySubmit}>
              {categoryDialog.mode === 'create' ? 'Oluştur' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={productDialog.open} onOpenChange={(open) => setProductDialog({ ...productDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {productDialog.mode === 'create' ? 'Yeni Ürün' : 'Ürün Düzenle'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="product-name">Ürün Adı *</Label>
              <Input
                id="product-name"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder="Örn: Waffle"
              />
            </div>
            <div>
              <Label htmlFor="product-description">Açıklama</Label>
              <Textarea
                id="product-description"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                placeholder="Örn: Çikolata, muz, çilek ile"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="product-price">Fiyat (TL) *</Label>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="product-category">Kategori *</Label>
              <Select
                value={productForm.category_id}
                onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {savedProducts.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savedProducts.categories.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Önce bir kategori oluşturmalısınız
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog({ open: false, mode: 'create', data: null })}>
              İptal
            </Button>
            <Button onClick={handleProductSubmit} disabled={savedProducts.categories.length === 0}>
              {productDialog.mode === 'create' ? 'Oluştur' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <Dialog open={deleteItemDialog.open} onOpenChange={(open) => setDeleteItemDialog({ ...deleteItemDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              {deleteItemDialog.type === 'category' ? 'Kategori Sil' : 'Ürün Sil'}
            </DialogTitle>
            <DialogDescription>
              {deleteItemDialog.type === 'category' ? (
                <>
                  <strong>"{deleteItemDialog.item?.name}"</strong> kategorisi ve içindeki tüm ürünler silinecek. Bu işlem geri alınamaz.
                </>
              ) : (
                <>
                  <strong>"{deleteItemDialog.item?.name}"</strong> ürünü silinecek. Bu işlem geri alınamaz.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemDialog({ open: false, type: null, item: null })}>
              İptal
            </Button>
            <Button 
              variant="destructive" 
              onClick={deleteItemDialog.type === 'category' ? handleDeleteCategory : handleDeleteProduct}
            >
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
