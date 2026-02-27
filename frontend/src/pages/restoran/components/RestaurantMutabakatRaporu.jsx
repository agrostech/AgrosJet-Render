import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, FileText, Package, TrendingUp, Banknote } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatMoney(val) {
  if (val === null || val === undefined) return "0,00 ₺";
  return val.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default function RestaurantMutabakatRaporu({ restaurantId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [initialized, setInitialized] = useState(false);
  
  // Company settings for default times
  const [companySettings, setCompanySettings] = useState({ opening_time: "09:00", closing_time: "23:00" });
  
  // Date filters
  const getDefaultDates = useCallback((settings) => {
    const s = settings || { opening_time: "09:00", closing_time: "23:00" };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = s.opening_time || "09:00";
    const closingTime = s.closing_time || "23:00";
    
    const startDateTime = `${today.toISOString().split('T')[0]}T${openingTime}`;
    const endDateTime = `${tomorrow.toISOString().split('T')[0]}T${closingTime}`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Türkiye saati formatında tarih string'i oluştur
  const formatDateTurkey = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    // datetime-local input formatı: "2026-02-26T09:00"
    return `${dateTimeStr}:00+03:00`;
  };

  // Veri çek
  const fetchData = useCallback(async (params = {}) => {
    const start = params.startDateTime || startDateTime;
    const end = params.endDateTime || endDateTime;
    
    if (!start || !end || !restaurantId) return;
    
    setLoading(true);
    try {
      const res = await axios.post(`${API}/restoran-mutabakat/restaurant/${restaurantId}`, {
        start_datetime: formatDateTurkey(start),
        end_datetime: formatDateTurkey(end)
      });
      setData(res.data);
    } catch (err) {
      console.error("Mütabakat verisi alınamadı:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, startDateTime, endDateTime]);

  // Şirket ayarlarını al ve ilk veriyi çek
  useEffect(() => {
    const initData = async () => {
      if (!companyId || initialized) return;
      
      try {
        // Şirket ayarlarını al
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        const company = companyRes.data;
        
        const settings = {
          opening_time: company?.opening_time || "09:00",
          closing_time: company?.closing_time || "23:00"
        };
        setCompanySettings(settings);
        
        // Varsayılan tarihleri ayarla
        const defaults = getDefaultDates(settings);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);
        
        // İlk veriyi çek
        await fetchData({
          startDateTime: defaults.startDateTime,
          endDateTime: defaults.endDateTime
        });
        
        setInitialized(true);
      } catch (err) {
        console.error("Şirket ayarları alınamadı:", err);
      }
    };
    
    initData();
  }, [companyId, initialized, getDefaultDates]);

  // Filtrele butonu
  const handleFilter = () => {
    fetchData();
  };

  // Temizle
  const clearFilters = () => {
    const defaults = getDefaultDates(companySettings);
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    fetchData({
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
  };

  return (
    <div className="space-y-4" data-testid="restaurant-mutabakat-raporu">
      {/* Compact Filters - Teslim Edilen Siparişler ile aynı tasarım */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Start Date */}
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input 
                type="datetime-local" 
                value={startDateTime} 
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            
            {/* End Date */}
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Bitiş</Label>
              <Input 
                type="datetime-local" 
                value={endDateTime} 
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-1.5">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Temizle"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button 
                onClick={handleFilter} 
                disabled={loading}
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    Rapor Getir
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Sonuçlar */}
      {!loading && data && (
        <div className="space-y-4">
          {/* Özet Kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-2 border-blue-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Package className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sipariş Sayısı</p>
                    <p className="text-lg font-bold">{data.order_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-green-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Toplam Ciro</p>
                    <p className="text-lg font-bold">{formatMoney(data.total_amount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-amber-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Banknote className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Toplam Kesinti</p>
                    <p className="text-lg font-bold">{formatMoney(data.total_fee)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-purple-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Tutar</p>
                    <p className="text-lg font-bold">{formatMoney(data.net_amount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detay Tablosu */}
          {data.orders && data.orders.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Sipariş No</th>
                        <th className="text-left p-3 font-medium">Tarih</th>
                        <th className="text-left p-3 font-medium">Kurye</th>
                        <th className="text-left p-3 font-medium">Ödeme</th>
                        <th className="text-right p-3 font-medium">Tutar</th>
                        <th className="text-right p-3 font-medium">Kesinti</th>
                        <th className="text-right p-3 font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order, idx) => (
                        <tr key={order.id || idx} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-medium">{order.order_number || '-'}</td>
                          <td className="p-3 text-muted-foreground">
                            {order.delivered_at ? new Date(order.delivered_at).toLocaleString('tr-TR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </td>
                          <td className="p-3">{order.courier_name || '-'}</td>
                          <td className="p-3">
                            {order.payment_method === 'cash' ? 'Nakit' :
                             order.payment_method === 'card' ? 'Kart' :
                             order.payment_method === 'meal_card' ? 'Yemek Kartı' :
                             order.payment_method === 'online' ? 'Online' : '-'}
                          </td>
                          <td className="p-3 text-right">{formatMoney(order.total_amount)}</td>
                          <td className="p-3 text-right text-red-600">{formatMoney(order.fee)}</td>
                          <td className="p-3 text-right font-medium">{formatMoney(order.net_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Veri yoksa */}
          {(!data.orders || data.orders.length === 0) && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Bu tarih aralığında sipariş bulunamadı</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* İlk yükleme */}
      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Tarih aralığı seçip "Rapor Getir" butonuna tıklayın</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
