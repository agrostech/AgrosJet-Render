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
  const [couriers, setCouriers] = useState([]);
  
  // Date filters
  const getDefaultDates = useCallback(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startDateTime = `${today.toISOString().split('T')[0]}T09:00`;
    const endDateTime = `${tomorrow.toISOString().split('T')[0]}T23:00`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Fetch and filter orders
  const fetchAndFilterOrders = useCallback(async (filters) => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/orders/restaurant/${restaurantId}?status=delivered`);
      let result = res.data || [];
      
      // Courier filter
      if (filters.courier !== "all") {
        result = result.filter(o => o.courier_id === filters.courier);
      }
      
      // Payment method filter
      if (filters.payment !== "all") {
        result = result.filter(o => o.payment_method === filters.payment);
      }
      
      // Date range filter
      if (filters.startDateTime && filters.endDateTime) {
        const start = new Date(filters.startDateTime);
        const end = new Date(filters.endDateTime);
        
        result = result.filter(o => {
          const orderDate = new Date(o.delivered_at || o.updated_at || o.created_at);
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
      payment: paymentFilter,
      startDateTime,
      endDateTime
    });
  };

  // Fetch couriers and company name
  useEffect(() => {
    const fetchData = async () => {
      if (!restaurantId) return;
      try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        if (user.company_id) {
          // Fetch couriers
          const couriersRes = await axios.get(`${API}/companies/${user.company_id}/couriers`);
          setCouriers(couriersRes.data || []);
          
          // Fetch company name
          const companyRes = await axios.get(`${API}/companies/${user.company_id}`);
          setCompanyName(companyRes.data?.name || "Şirket");
        }
      } catch (err) {
        console.error("Data fetch error:", err);
      }
    };
    fetchData();
  }, [restaurantId]);

  // Initial load
  useEffect(() => {
    if (!restaurantId || initialized) return;
    
    const defaults = getDefaultDates();
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    
    fetchAndFilterOrders({
      courier: "all",
      payment: "all",
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
    
    setInitialized(true);
  }, [restaurantId, initialized, getDefaultDates, fetchAndFilterOrders]);

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
    setPaymentFilter("all");
    const defaults = getDefaultDates();
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    setCurrentPage(1);
    fetchAndFilterOrders({
      courier: "all",
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

  const getPaymentLabel = (method) => {
    switch (method) {
      case 'cash': return 'Nakit';
      case 'card': return 'Kart';
      case 'meal_card': return 'Yemek Kartı';
      case 'online': return 'Online';
      default: return method || '-';
    }
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sipariş Yönetimi</h1>
            <p className="text-sm text-muted-foreground">Geçmiş siparişler</p>
          </div>
        </div>
        
        {/* Alt Sekmeler */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => handleSubPageChange('aktif')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Aktif Siparişler
          </button>
          <button
            onClick={() => handleSubPageChange('gecmis')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Geçmiş Siparişler
          </button>
          <button
            onClick={() => handleSubPageChange('iptal')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="w-4 h-4" />
            İptal Siparişler
          </button>
        </div>
      </div>

      {/* Compact Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Courier */}
            <div className="min-w-[120px] flex-1 max-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Kurye</Label>
              <Select value={courierFilter} onValueChange={setCourierFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {couriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Payment */}
            <div className="min-w-[100px] flex-1 max-w-[140px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Ödeme</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-8 text-xs">
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
            <div className="min-w-[140px] flex-1 max-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input 
                type="datetime-local" 
                value={startDateTime} 
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            
            {/* End Date */}
            <div className="min-w-[140px] flex-1 max-w-[180px]">
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
                  <Search className="w-3.5 h-3.5" />
                )}
                Filtrele
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
                      <th className="text-left p-2 font-bold text-xs w-[70px]">Ödeme</th>
                      <th className="text-left p-2 font-bold text-xs w-[90px]">Kurye</th>
                      <th className="text-center p-2 font-bold text-xs w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => (
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
                            {getPaymentLabel(order.payment_method)}
                          </Badge>
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
                    ))}
                  </tbody>
                </table>
              </div>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">
                            {getPaymentLabel(order.payment_method)}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs">
                          {getDeliveryInfo(order)}
                        </td>
                      </tr>
                    ))}
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
    </div>
  );
}
