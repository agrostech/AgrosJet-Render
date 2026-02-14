import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Banknote, Save, Wallet, ArrowDownCircle, History, Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function CourierFinanceModal({ open, onOpenChange, courier, companyId }) {
  const [activeTab, setActiveTab] = useState("delivery");
  const [loading, setLoading] = useState(false);
  
  // Taşıma Finansı
  const [deliveryFee, setDeliveryFee] = useState("");
  
  // Tahsilat Finansı
  const [collectionData, setCollectionData] = useState(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
  const [collectionLoading, setCollectionLoading] = useState(false);
  
  // Load existing data
  useEffect(() => {
    if (open && courier) {
      loadFinanceData();
      loadCollectionData();
    }
  }, [open, courier]);

  const loadFinanceData = async () => {
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/finance`);
      if (res.data) {
        setDeliveryFee(res.data.delivery_fee_per_package?.toString() || "");
      }
    } catch (err) {
      setDeliveryFee("");
    }
  };

  const loadCollectionData = async () => {
    setCollectionLoading(true);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/collections?company_id=${companyId}`);
      setCollectionData(res.data);
    } catch (err) {
      setCollectionData(null);
    } finally {
      setCollectionLoading(false);
    }
  };

  const handleSaveDeliveryFinance = async () => {
    if (!deliveryFee || isNaN(parseFloat(deliveryFee))) {
      toast.error("Geçerli bir ücret girin");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/couriers/${courier.id}/finance`, {
        delivery_fee_per_package: parseFloat(deliveryFee),
        company_id: companyId
      });
      toast.success("Taşıma ücreti kaydedildi");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme hatası");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollection = async () => {
    if (!collectionAmount || isNaN(parseFloat(collectionAmount)) || parseFloat(collectionAmount) <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/couriers/${courier.id}/collections`, {
        amount: parseFloat(collectionAmount),
        note: collectionNote,
        company_id: companyId
      });
      toast.success("Tahsilat kaydedildi");
      setCollectionAmount("");
      setCollectionNote("");
      loadCollectionData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Tahsilat kaydedilemedi");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString('tr-TR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!courier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-green-600" />
            {courier.name} - Finans
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="delivery" className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Taşıma Finansı
            </TabsTrigger>
            <TabsTrigger value="collection" className="flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              Tahsilat Finansı
            </TabsTrigger>
          </TabsList>

          {/* Taşıma Finansı Sekmesi */}
          <TabsContent value="delivery" className="mt-4 space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border">
              <Label className="text-sm font-medium">Paket Başı Kurye Ücreti</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Her teslim edilen paket için kuryeye ödenecek ücret
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                  data-testid="courier-delivery-fee-input"
                />
                <span className="text-sm font-medium text-muted-foreground">₺</span>
              </div>
            </div>

            <Button 
              onClick={handleSaveDeliveryFinance} 
              disabled={loading}
              className="w-full"
              data-testid="save-courier-delivery-fee-btn"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </TabsContent>

          {/* Tahsilat Finansı Sekmesi */}
          <TabsContent value="collection" className="mt-4 space-y-4">
            {collectionLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                Yükleniyor...
              </div>
            ) : (
              <>
                {/* Özet Kartları */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-600 font-medium mb-1">Bekleyen Tahsilat</p>
                    <p className="text-lg font-bold text-red-700">
                      {formatCurrency(collectionData?.pending_total)}
                    </p>
                    <p className="text-xs text-red-500 mt-1">
                      {collectionData?.pending_orders?.length || 0} sipariş
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-600 font-medium mb-1">Tahsil Edilen</p>
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(collectionData?.collected_total)}
                    </p>
                  </div>
                </div>

                {/* Tahsilat Formu */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowDownCircle className="w-4 h-4 text-blue-600" />
                    <Label className="text-sm font-medium text-blue-800">Yeni Tahsilat</Label>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={collectionAmount}
                        onChange={(e) => setCollectionAmount(e.target.value)}
                        placeholder="Tutar"
                        className="flex-1 bg-white"
                        data-testid="courier-collection-amount-input"
                      />
                      <span className="text-sm font-medium text-muted-foreground">₺</span>
                    </div>
                    <Input
                      value={collectionNote}
                      onChange={(e) => setCollectionNote(e.target.value)}
                      placeholder="Not (opsiyonel)"
                      className="bg-white"
                      data-testid="courier-collection-note-input"
                    />
                    <Button 
                      onClick={handleAddCollection}
                      disabled={loading}
                      className="w-full"
                      data-testid="add-courier-collection-btn"
                    >
                      <Banknote className="w-4 h-4 mr-2" />
                      {loading ? "Kaydediliyor..." : "Tahsilat Ekle"}
                    </Button>
                  </div>
                </div>

                {/* Son İşlemler */}
                {collectionData?.collected_transactions?.length > 0 && (
                  <div className="border rounded-lg">
                    <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
                      <History className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium">Son Tahsilatlar</span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {collectionData.collected_transactions.slice(0, 10).map((t) => (
                        <div key={t.id} className="p-3 border-b last:border-b-0 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-green-700">
                              +{formatCurrency(t.amount)}
                            </p>
                            {t.note && (
                              <p className="text-xs text-muted-foreground">{t.note}</p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(t.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bekleyen Siparişler */}
                {collectionData?.pending_orders?.length > 0 && (
                  <div className="border rounded-lg">
                    <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
                      <Package className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium">
                        Bekleyen Nakit Siparişler ({collectionData.pending_orders.length})
                      </span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {collectionData.pending_orders.slice(0, 10).map((o) => (
                        <div key={o.id} className="p-3 border-b last:border-b-0 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{o.restaurant_name || "Restoran"}</p>
                            <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                          </div>
                          <p className="text-sm font-bold text-red-600">
                            {formatCurrency(o.total_amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
