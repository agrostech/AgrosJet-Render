import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Package, Search, ChevronLeft, ChevronRight, CheckCircle, ClipboardList, XCircle, Phone, Eye } from "lucide-react";
import OrderDetailModal from "@/components/restoran/OrderDetailModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantGecmisSiparisler({ restaurantId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter states
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [courierNameFilter, setCourierNameFilter] = useState("all");
  const [couriers, setCouriers] = useState([]);
  const [availableCouriers, setAvailableCouriers] = useState([]); // Bu restoran için teslimatta bulunan kuryeler
  
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

  // Fetch and filter orders
  const fetchAndFilterOrders = useCallback(async (filters) => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      // Yeni merkezi endpoint kullan
      const res = await axios.get(`${API}/orders/v2/list`, {
        params: {
          panel: 'restaurant',
          restaurant_id: restaurantId,
          status: 'delivered',
          limit: 500
        }
      });
      let result = res.data.orders || [];
      
      // Courier/Delivery type filter
      if (filters.courier === "company") {
        // Kurye şirketi teslimatı: is_restaurant_delivery false veya undefined ve courier_id var
        result = result.filter(o => !o.is_restaurant_delivery);
      } else if (filters.courier === "restaurant") {
        // Restoran teslimatı: is_restaurant_delivery true
        result = result.filter(o => o.is_restaurant_delivery === true);
      }
      
      // Kurye adı filtresi
      if (filters.courierName !== "all") {
        result = result.filter(o => o.courier_id === filters.courierName);
      }
      
      // Bu restoran için teslimatta bulunan kuryeleri çıkar (alfabetik sıralı)
      const courierMap = new Map();
      res.data.orders?.forEach(o => {
        if (o.courier_id && o.courier_name && !o.is_restaurant_delivery) {
          courierMap.set(o.courier_id, o.courier_name);
        }
      });
      const uniqueCouriers = Array.from(courierMap, ([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setAvailableCouriers(uniqueCouriers);
      
      // Payment method filter
      if (filters.payment !== "all") {
        if (filters.payment === "online") {
          // Online: online + online_meal_card
          result = result.filter(o => o.payment_method === "online" || o.payment_method === "online_meal_card");
        } else {
          result = result.filter(o => o.payment_method === filters.payment);
        }
      }
      
      // Date range filter
      if (filters.startDateTime && filters.endDateTime) {
        const start = new Date(filters.startDateTime);
        const end = new Date(filters.endDateTime);
        
        result = result.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= start && orderDate <= end;
        });
      }
      
      setFilteredOrders(result);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Handle filter button click
  const handleFilter = () => {
    setCurrentPage(1);
    fetchAndFilterOrders({
      courier: courierFilter,
      courierName: courierNameFilter,
      payment: paymentFilter,
      startDateTime,
      endDateTime
    });
  };

  // Fetch couriers and company name, then load orders
  useEffect(() => {
    const fetchData = async () => {
      if (!restaurantId || initialized) return;
      try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        if (user.company_id) {
          // Fetch couriers
          const couriersRes = await axios.get(`${API}/companies/${user.company_id}/couriers`);
          setCouriers(couriersRes.data || []);
          
          // Fetch company info (name + opening/closing times)
          const companyRes = await axios.get(`${API}/companies/${user.company_id}`);
          const company = companyRes.data;
          setCompanyName(company?.name || "Şirket");
          
          // Set company settings and update default dates
          const settings = {
            opening_time: company?.opening_time || "09:00",
            closing_time: company?.closing_time || "23:00"
          };
          setCompanySettings(settings);
          
          // Update date filters with company times and fetch orders
          const defaults = getDefaultDates(settings);
          setStartDateTime(defaults.startDateTime);
          setEndDateTime(defaults.endDateTime);
          
          // Initial order fetch
          fetchAndFilterOrders({
            courier: "all",
            courierName: "all",
            payment: "all",
            startDateTime: defaults.startDateTime,
            endDateTime: defaults.endDateTime
          });
          setInitialized(true);
        }
      } catch (err) {
        console.error("Data fetch error:", err);
      }
    };
    fetchData();
  }, [restaurantId, initialized, fetchAndFilterOrders, getDefaultDates]);

  // Remove old initial load - merged into fetchData above

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clearFilters = () => {
    setCourierFilter("all");
    setCourierNameFilter("all");
    setPaymentFilter("all");
    const defaults = getDefaultDates();
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    setCurrentPage(1);
    fetchAndFilterOrders({
      courier: "all",
      courierName: "all",
      payment: "all",
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
  };

  // Pagination logic with search
  const searchedOrders = useMemo(() => {
    if (!searchQuery.trim()) return filteredOrders;
    
    const query = searchQuery.toLowerCase().trim();
    return filteredOrders.filter(order => {
      const searchableFields = [
        order.customer_name,
        order.customer_phone,
        order.courier_name,
        order.delivery_address,
        order.total_amount?.toString(),
        order.order_number
      ].filter(Boolean);
      
      return searchableFields.some(field => 
        field.toLowerCase().includes(query)
      );
    });
  }, [filteredOrders, searchQuery]);

  const totalItems = searchedOrders.length;
  const totalPages = itemsPerPage === "all" ? 1 : Math.ceil(totalItems / itemsPerPage);
  
  const paginatedOrders = useMemo(() => {
    if (itemsPerPage === "all") return searchedOrders;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return searchedOrders.slice(start, end);
  }, [searchedOrders, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value === "all" ? "all" : parseInt(value));
    setCurrentPage(1);
  };
  
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const getPaymentLabel = (order) => {
    const method = order.payment_method;
    switch (method) {
      case 'cash': return 'Nakit';
      case 'card': return 'Kredi Kartı';
      case 'meal_card': 
        // Sodexo, Ticket, Multinet vb. göster
        const cardType = order.meal_card_type || order.card_brand || '';
        if (cardType.toLowerCase().includes('sodexo')) return 'Sodexo';
        if (cardType.toLowerCase().includes('ticket')) return 'Ticket';
        if (cardType.toLowerCase().includes('multinet')) return 'Multinet';
        if (cardType.toLowerCase().includes('setcard')) return 'Setcard';
        return cardType || 'Yemek Kartı';
      case 'online': return 'Online';
      case 'online_meal_card': return 'Online Yemek Kartı';
      default: return method || '-';
    }
  };

  // Mesafe ve ücretlendirme bilgisi
  const getDeliveryFeeInfo = (order) => {
    const distance = order.distance_km || order.distance || order.delivery_distance || 0;
    const deliveryFee = order.courier_fee || order.delivery_fee || 0;
    const deliveryFeeVat = order.delivery_fee_vat || order.courier_fee_vat || (deliveryFee * 0.10) || 0;
    const posCommission = order.pos_commission || 0;
    const isCard = order.payment_method === 'card';
    
    return { distance, deliveryFee, deliveryFeeVat, posCommission, isCard };
  };

  // Kurye/Teslimat bilgisini göster
  const getDeliveryInfo = (order) => {
    // Kurye atanmışsa kurye ismini göster
    if (order.courier_name) {
      return order.courier_name;
    }
    if (order.courier_id) {
      const courier = couriers.find(c => c.id === order.courier_id);
      return courier?.name || "Kurye";
    }
    // Restoran kendi teslimat yaptıysa
    if (order.is_restaurant_delivery) {
      return "Restoran";
    }
    // Kurye yoksa ama teslim edildiyse, şirket kuryeleri teslim etmiştir
    if (order.status === "delivered") {
      return companyName || "Şirket";
    }
    return "-";
  };

  const handleSubPageChange = (value) => {
    if (value === 'aktif') navigate('/restoran');
    else if (value === 'gecmis') navigate('/restoran/gecmis-siparisler');
    else if (value === 'iptal') navigate('/restoran/iptal-siparisler');
  };

  return (
    <div className="space-y-4">
      {/* Header with Sub-tabs */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900">Sipariş Yönetimi</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Teslim edilen siparişler</p>
          </div>
        </div>
        
        {/* Alt Sekmeler - Mobilde yatay scroll */}
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex gap-1 border-b min-w-max sm:min-w-0">
            <button
              onClick={() => handleSubPageChange('aktif')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Aktif
            </button>
            <button
              onClick={() => handleSubPageChange('gecmis')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 border-primary text-primary transition-colors whitespace-nowrap"
            >
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Teslim Edilen
            </button>
            <button
              onClick={() => handleSubPageChange('iptal')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              İptal
            </button>
          </div>
        </div>
      </div>

      {/* Compact Filters */}
      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Courier / Delivery Type */}
            <div className="min-w-[100px] flex-1 max-w-[140px] sm:max-w-[180px]">
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Teslimat</Label>
              <Select value={courierFilter} onValueChange={setCourierFilter}>
                <SelectTrigger className="h-7 sm:h-8 text-[11px] sm:text-xs">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="company">{companyName || "Kurye Şirketi"}</SelectItem>
                  <SelectItem value="restaurant">Restoran</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Courier Name Filter */}
            <div className="min-w-[100px] flex-1 max-w-[140px] sm:max-w-[180px]">
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Kurye</Label>
              <Select value={courierNameFilter} onValueChange={setCourierNameFilter}>
                <SelectTrigger className="h-7 sm:h-8 text-[11px] sm:text-xs">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {availableCouriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Payment */}
            <div className="min-w-[80px] flex-1 max-w-[110px] sm:max-w-[140px]">
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Ödeme</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-7 sm:h-8 text-[11px] sm:text-xs">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="cash">Nakit</SelectItem>
                  <SelectItem value="card">Kart</SelectItem>
                  <SelectItem value="meal_card">Yemek Kartı</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Start Date */}
            <div className="min-w-[130px] flex-1 max-w-[160px] sm:max-w-[180px]">
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input 
                type="datetime-local" 
                value={startDateTime} 
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-7 sm:h-8 text-[11px] sm:text-xs"
              />
            </div>
            
            {/* End Date */}
            <div className="min-w-[130px] flex-1 max-w-[160px] sm:max-w-[180px]">
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">Bitiş</Label>
              <Input 
                type="datetime-local" 
                value={endDateTime} 
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-7 sm:h-8 text-[11px] sm:text-xs"
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="h-7 sm:h-8 w-7 sm:w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Temizle"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button 
                onClick={handleFilter} 
                disabled={loading}
                size="sm"
                className="h-7 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-xs gap-1"
              >
                {loading ? (
                  <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                )}
                <span className="hidden sm:inline">Filtrele</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Teslim Edilen Siparişler ({searchedOrders.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Ara..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="h-7 w-[150px] pl-7 text-xs"
                />
              </div>
              <span className="text-xs text-muted-foreground">Göster:</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="all">Tümü</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : searchedOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{searchQuery ? "Aramayla eşleşen sipariş bulunamadı" : "Teslim edilmiş sipariş bulunamadı"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-primary">
                      <th className="text-left p-2 font-bold text-xs w-[90px]">Tarih</th>
                      <th className="text-left p-2 font-bold text-xs w-[120px]">Müşteri</th>
                      <th className="text-left p-2 font-bold text-xs">Adres</th>
                      <th className="text-left p-2 font-bold text-xs w-[70px]">Tutar</th>
                      <th className="text-left p-2 font-bold text-xs w-[130px]">Ödeme</th>
                      <th className="text-left p-2 font-bold text-xs w-[140px]">Mesafe / Ücret</th>
                      <th className="text-left p-2 font-bold text-xs w-[90px]">Kurye</th>
                      <th className="text-center p-2 font-bold text-xs w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => {
                      const feeInfo = getDeliveryFeeInfo(order);
                      return (
                        <tr 
                          key={order.id}
                          className="border-b hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-2 text-xs whitespace-nowrap">
                            {formatDate(order.delivered_at || order.created_at)}
                          </td>
                          <td className="p-2">
                            <div className="truncate max-w-[120px]">
                              <span className="text-xs font-medium">{order.customer_name || "-"}</span>
                              {order.customer_phone && (
                                <div className="text-xs text-muted-foreground font-mono truncate">{order.customer_phone}</div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-xs" title={order.delivery_address}>
                            <div className="line-clamp-2">{order.delivery_address || "-"}</div>
                          </td>
                          <td className="p-2 text-xs font-semibold whitespace-nowrap">
                            {order.total_amount?.toFixed(2) || "0.00"} ₺
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">
                              {getPaymentLabel(order)}
                            </Badge>
                          </td>
                          <td className="p-2 text-xs">
                            <div className="space-y-0.5">
                              <div>{feeInfo.distance.toFixed(1)} km</div>
                              <div className="text-muted-foreground">
                                {feeInfo.deliveryFee.toFixed(2)}₺ + {feeInfo.deliveryFeeVat.toFixed(2)}₺ KDV
                              </div>
                              {feeInfo.isCard && feeInfo.posCommission > 0 && (
                                <div className="text-orange-600">POS: {feeInfo.posCommission.toFixed(2)}₺</div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-xs truncate max-w-[90px]">
                            {getDeliveryInfo(order)}
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedOrder(order)}
                              className="h-7 w-7 p-0"
                              title="Detay"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems} sipariş
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="h-7 w-7 p-0 text-xs"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
