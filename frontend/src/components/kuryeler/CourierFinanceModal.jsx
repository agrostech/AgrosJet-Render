import { useState, useEffect } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Banknote, Wallet, Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function CourierFinanceModal({ open, onOpenChange, courier, companyId }) {
  const [activeTab, setActiveTab] = useState("delivery");
  const [loading, setLoading] = useState(false);
  const [deliveryData, setDeliveryData] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  
  useEffect(() => {
    if (open && courier) {
      loadData();
    }
  }, [open, courier]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/finance-logs?company_id=${companyId}`);
      setDeliveryData(res.data.delivery);
      setCollectionData(res.data.collection);
    } catch (err) {
      setDeliveryData(null);
      setCollectionData(null);
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
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!courier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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

          {/* Taşıma Finansı - Teslim edilen siparişler ve kazançlar */}
          <TabsContent value="delivery" className="mt-4 space-y-4">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                Yükleniyor...
              </div>
            ) : (
              <>
                {/* Özet */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium mb-1">Teslim Edilen</p>
                    <p className="text-lg font-bold text-blue-700">
                      {deliveryData?.total_orders || 0} sipariş
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-600 font-medium mb-1">Toplam Kazanç</p>
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(deliveryData?.total_earning)}
                    </p>
                  </div>
                </div>

                {/* Paket başı ücret bilgisi */}
                {deliveryData?.fee_per_package > 0 && (
                  <div className="p-2 bg-slate-100 rounded text-center text-sm">
                    Paket başı: <strong>{formatCurrency(deliveryData.fee_per_package)}</strong>
                  </div>
                )}

                {/* Sipariş Listesi */}
                {deliveryData?.orders?.length > 0 ? (
                  <div className="border rounded-lg">
                    <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
                      <Package className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium">Teslim Edilen Siparişler</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {deliveryData.orders.map((o, idx) => (
                        <div key={o.id || idx} className="p-3 border-b last:border-b-0 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{o.restaurant_name}</p>
                            <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(o.delivered_at)}</p>
                          </div>
                          <p className="text-sm font-bold text-green-600">
                            +{formatCurrency(o.courier_earning)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground border rounded-lg">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Henüz teslim edilen sipariş yok</p>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tahsilat Finansı - Nakit siparişler */}
          <TabsContent value="collection" className="mt-4 space-y-4">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                Yükleniyor...
              </div>
            ) : (
              <>
                {/* Özet */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-600 font-medium mb-1">Nakit Tahsilat</p>
                    <p className="text-lg font-bold text-red-700">
                      {formatCurrency(collectionData?.total_cash)}
                    </p>
                    <p className="text-xs text-red-500">{collectionData?.cash_orders || 0} sipariş</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-600 font-medium mb-1">Online Ödeme</p>
                    <p className="text-lg font-bold text-purple-700">
                      {formatCurrency(collectionData?.total_online)}
                    </p>
                    <p className="text-xs text-purple-500">{collectionData?.online_orders || 0} sipariş</p>
                  </div>
                </div>

                {/* Nakit Sipariş Listesi */}
                {collectionData?.orders?.length > 0 ? (
                  <div className="border rounded-lg">
                    <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
                      <Banknote className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium">Nakit Siparişler</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {collectionData.orders.map((o, idx) => (
                        <div key={o.id || idx} className="p-3 border-b last:border-b-0 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{o.restaurant_name}</p>
                            <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(o.delivered_at)}</p>
                          </div>
                          <p className="text-sm font-bold text-red-600">
                            {formatCurrency(o.total_amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground border rounded-lg">
                    <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nakit sipariş yok</p>
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
