import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Link, Download, Trash2, Package, FolderOpen, Check, AlertCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

  // Kayıtlı ürünleri yükle
  const loadSavedProducts = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/products/restaurant/${restaurantId}`);
      setSavedProducts(res.data);
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

  // Kategoriye göre ürünleri grupla
  const groupProductsByCategory = (products) => {
    const groups = {};
    products.forEach(p => {
      const cat = p.category_name || p.category || "Diğer";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
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

  return (
    <div className="space-y-6" data-testid="restaurant-urunler">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ürünler</h1>
        <p className="text-sm text-muted-foreground">Menü ve ürün yönetimi</p>
      </div>

      {/* URL Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="w-5 h-5" />
            TGO Yemek'ten Menü Çek
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="url" className="sr-only">TGO Yemek URL</Label>
              <Input
                id="url"
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
            TGO Yemek restoran sayfası URL'sini girin. Örnek: https://tgoyemek.com/restoranlar/125594
          </p>
        </CardContent>
      </Card>

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
            <Accordion type="multiple" className="w-full" defaultValue={scrapedData.categories}>
              {scrapedData.categories.map((category) => {
                const categoryProducts = scrapedData.products.filter(p => p.category === category);
                return (
                  <AccordionItem key={category} value={category}>
                    <AccordionTrigger className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        {category}
                        <Badge variant="outline" className="ml-2">{categoryProducts.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ürün Adı</TableHead>
                            <TableHead>Açıklama</TableHead>
                            <TableHead className="text-right">Fiyat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categoryProducts.map((product, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                                {product.description || "-"}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatPrice(product.price)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="w-5 h-5" />
              Kayıtlı Ürünler
            </CardTitle>
            {savedProducts.products.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setDeleteDialog(true)}
                data-testid="delete-all-button"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tümünü Sil
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedProducts.products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Henüz ürün yok</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Yukarıdaki alandan TGO Yemek linki ile menünüzü içe aktarabilirsiniz.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 mb-4">
                <Badge variant="secondary">{savedProducts.categories_count} Kategori</Badge>
                <Badge variant="secondary">{savedProducts.products_count} Ürün</Badge>
              </div>
              
              <Accordion type="multiple" className="w-full">
                {Object.entries(groupProductsByCategory(savedProducts.products)).map(([category, products]) => (
                  <AccordionItem key={category} value={category}>
                    <AccordionTrigger className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        {category}
                        <Badge variant="outline" className="ml-2">{products.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ürün Adı</TableHead>
                            <TableHead>Açıklama</TableHead>
                            <TableHead className="text-right">Fiyat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                                {product.description || "-"}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatPrice(product.price)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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

      {/* Delete Confirm Dialog */}
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
    </div>
  );
}
