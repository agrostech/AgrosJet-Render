import { useState, useEffect } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Banknote, Store, Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function RestaurantFinanceModal({ open, onOpenChange, restaurant, companyId }) {
  const [activeTab, setActiveTab] = useState("delivery");
  const [loading, setLoading] = useState(false);
  const [deliveryData, setDeliveryData] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  
  useEffect(() => {
    if (open && restaurant) {
      loadData();
    }
  }, [open, restaurant]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurants/${restaurant.id}/finance-logs?company_id=${companyId}`);
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

  if (!restaurant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-orange-600" />
            {restaurant.name} - Finans
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

          {/* Taşıma Finansı - Teslim edilen siparişler ve hizmet bedeli */}
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
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-xs text-orange-600 font-medium mb-1">Toplam Hizmet Bedeli</p>
                    <p className="text-lg font-bold text-orange-700">
                      {formatCurrency(deliveryData?.total_service_fee)}
                    </p>
                  </div>
                </div>

                {/* Paket başı ücret bilgisi */}
                {deliveryData?.fee_per_package > 0 && (
                  <div className="p-2 bg-slate-100 rounded text-center text-sm">
                    Paket başı hizmet bedeli: <strong>{formatCurrency(deliveryData.fee_per_package)}</strong>
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
                            <p className="text-sm font-medium">{o.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{o.courier_name || "Kurye"}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(o.delivered_at)}</p>
                          </div>
                          <p className="text-sm font-bold text-orange-600">
                            {formatCurrency(o.service_fee)}
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

          {/* Tahsilat Finansı - Ödeme türüne göre */}
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
                    <p className="text-xs text-red-600 font-medium mb-1">Nakit Satış</p>
                    <p className="text-lg font-bold text-red-700">
                      {formatCurrency(collectionData?.total_cash)}
                    </p>
                    <p className="text-xs text-red-500">{collectionData?.cash_orders || 0} sipariş</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-600 font-medium mb-1">Online Satış</p>
                    <p className="text-lg font-bold text-purple-700">
                      {formatCurrency(collectionData?.total_online)}
                    </p>
                    <p className="text-xs text-purple-500">{collectionData?.online_orders || 0} sipariş</p>
                  </div>
                </div>

                {/* Toplam */}
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-xs text-green-600 font-medium mb-1">Toplam Satış</p>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency((collectionData?.total_cash || 0) + (collectionData?.total_online || 0))}
                  </p>
                </div>

                {/* Sipariş Listesi */}
                {collectionData?.orders?.length > 0 ? (
                  <div className="border rounded-lg">
                    <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
                      <Banknote className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium">Tüm Siparişler</span>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto">
                      {collectionData.orders.map((o, idx) => (
                        <div key={o.id || idx} className="p-3 border-b last:border-b-0 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{o.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(o.delivered_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${o.is_cash ? 'text-red-600' : 'text-purple-600'}`}>
                              {formatCurrency(o.total_amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {o.is_cash ? 'Nakit' : 'Online'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground border rounded-lg">
                    <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Sipariş yok</p>
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
