import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Package, Search, ChevronLeft, ChevronRight, Pencil, Loader2 } from "lucide-react";
import { PaymentBadge } from "@/components/shared/PaymentDetailPopover";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GecmisSiparislerPage({ companyId, onOrderSelect, isSuperAdmin = false, adminId, adminName }) {
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  
  // Fee edit modal state
  const [editingOrder, setEditingOrder] = useState(null);
  const [editFees, setEditFees] = useState({ courier_fee: 0, restaurant_fee: 0, restaurant_kdv: 0, pos_commission: 0 });
  const [savingFees, setSavingFees] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter states
  const [restaurants, setRestaurants] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [company, setCompany] = useState(null);
  
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  
  // Applied filter values (set only when filter button is clicked)
  const [appliedRestaurantFilter, setAppliedRestaurantFilter] = useState("all");
  const [appliedCourierFilter, setAppliedCourierFilter] = useState("all");
  const [appliedSourceFilter, setAppliedSourceFilter] = useState("all");
  
  // Date filters with defaults
  const getDefaultDates = useCallback((companyData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = companyData?.opening_time || "06:00";
    const closingTime = companyData?.closing_time || "06:00";
    
    // Format: YYYY-MM-DDTHH:MM
    const startDateTime = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}T${openingTime}`;
    const endDateTime = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T${closingTime}`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Fetch and filter orders - called on button click or initial load
  const fetchAndFilterOrders = useCallback(async (filters) => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Yeni merkezi endpoint kullan
      const params = {
        panel: 'admin',
        company_id: companyId,
        status: 'delivered',
        limit: 500,
        date_from: filters.startDateTime,
        date_to: filters.endDateTime
      };
      
      // Source filtresi varsa ekle
      if (filters.source && filters.source !== "all") {
        params.source = filters.source;
      }
      
      const res = await axios.get(`${API}/orders/v2/list`, { params });
      let result = res.data.orders || [];
      
      // Restaurant filter
      if (filters.restaurant !== "all") {
        result = result.filter(o => o.restaurant_id === filters.restaurant);
      }
      
      // Courier filter
      if (filters.courier !== "all") {
        result = result.filter(o => o.courier_id === filters.courier);
      }
      
      // Payment method filter
      if (filters.payment !== "all") {
        result = result.filter(o => o.payment_method === filters.payment);
      }
      
      setFilteredOrders(result);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Handle filter button click
  const handleFilter = async () => {
    setCurrentPage(1);
    setAppliedRestaurantFilter(restaurantFilter);
    setAppliedCourierFilter(courierFilter);
    setAppliedSourceFilter(sourceFilter);
    
    fetchAndFilterOrders({
      restaurant: restaurantFilter,
      courier: courierFilter,
      payment: paymentFilter,
      source: sourceFilter,
      startDateTime,
      endDateTime
    });
  };

  // Fetch restaurants and couriers separately 
  useEffect(() => {
    const fetchFiltersData = async () => {
      if (!companyId) return;
      try {
        const [restaurantsRes, couriersRes] = await Promise.all([
          axios.get(`${API}/restaurants/${companyId}`),
          axios.get(`${API}/companies/${companyId}/couriers`)
        ]);
        console.log("Restaurants loaded:", restaurantsRes.data);
        console.log("Couriers loaded:", couriersRes.data);
        setRestaurants(restaurantsRes.data || []);
        setCouriers(couriersRes.data || []);
      } catch (err) {
        console.error("Filters data fetch error:", err);
      }
    };
    fetchFiltersData();
  }, [companyId]);

  // Initial load: fetch company and orders
  useEffect(() => {
    const initializeData = async () => {
      if (!companyId || initialized) return;
      
      try {
        // Fetch company first
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        setCompany(companyRes.data);
        
        // Set default dates
        const defaults = getDefaultDates(companyRes.data);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);
        
        // Auto-filter with defaults on first load
        await fetchAndFilterOrders({
          restaurant: "all",
          courier: "all",
          payment: "all",
          source: "all",
          startDateTime: defaults.startDateTime,
          endDateTime: defaults.endDateTime
        });
        
        setInitialized(true);
      } catch (err) {
        console.error("Initialization error:", err);
        setLoading(false);
      }
    };
    
    initializeData();
  }, [companyId, initialized, getDefaultDates, fetchAndFilterOrders]);

  // Mesafe hesaplama (Haversine formula)
  const calculateDistance = (order) => {
    if (!order.restaurant_location || !order.delivery_location) return null;
    
    const R = 6371; // Dünya yarıçapı km
    const lat1 = order.restaurant_location.latitude || order.restaurant_location.lat;
    const lon1 = order.restaurant_location.longitude || order.restaurant_location.lng;
    const lat2 = order.delivery_location.latitude || order.delivery_location.lat;
    const lon2 = order.delivery_location.longitude || order.delivery_location.lng;
    
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

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
    setRestaurantFilter("all");
    setCourierFilter("all");
    setPaymentFilter("all");
    const defaults = getDefaultDates(company);
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    setCurrentPage(1);
    // Auto-filter with cleared defaults
    fetchAndFilterOrders({
      restaurant: "all",
      courier: "all",
      payment: "all",
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
  };

  // Fee editing functions (Super Admin only)
  const handleOpenFeeEdit = (order, e) => {
    e.stopPropagation();
    setEditingOrder(order);
    setEditFees({
      courier_fee: order.courier_fee || 0,
      restaurant_fee: order.restaurant_fee || 0,
      restaurant_kdv: order.restaurant_kdv || 0,
      pos_commission: order.pos_commission || 0
    });
  };

  const handleSaveFees = async () => {
    if (!editingOrder) return;
    
    setSavingFees(true);
    try {
      await axios.put(`${API}/orders/${editingOrder.id}/fees`, {
        courier_fee: parseFloat(editFees.courier_fee) || 0,
        restaurant_fee: parseFloat(editFees.restaurant_fee) || 0,
        restaurant_kdv: parseFloat(editFees.restaurant_kdv) || 0,
        pos_commission: parseFloat(editFees.pos_commission) || 0,
        admin_id: adminId,
        admin_name: adminName
      });
      
      // Update local state
      setFilteredOrders(prev => prev.map(o => 
        o.id === editingOrder.id 
          ? { 
              ...o, 
              courier_fee: parseFloat(editFees.courier_fee), 
              restaurant_fee: parseFloat(editFees.restaurant_fee),
              restaurant_kdv: parseFloat(editFees.restaurant_kdv),
              pos_commission: parseFloat(editFees.pos_commission)
            }
          : o
      ));
      
      toast.success("Ücretler güncellendi");
      setEditingOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setSavingFees(false);
    }
  };

  // Pagination logic with search
  const searchedOrders = useMemo(() => {
    if (!searchQuery.trim()) return filteredOrders;
    
    const query = searchQuery.toLowerCase().trim();
    return filteredOrders.filter(order => {
      const searchableFields = [
        order.restaurant_name,
        order.customer_name,
        order.customer_phone,
        order.courier_name,
        order.delivery_address,
        order.payment_method === 'cash' ? 'nakit' : order.payment_method === 'card' ? 'kart' : order.payment_method === 'meal_card' ? 'yemek kartı' : order.payment_method === 'mixed' ? 'parçalı' : 'online',
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

  return (
    <div className="space-y-4">
      {/* Compact Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Restaurant */}
            <div className="min-w-[120px] flex-1 max-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Restoran</Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {restaurants.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
            
            {/* Source - Sipariş Kanalı */}
            <div className="min-w-[100px] flex-1 max-w-[140px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Kanal</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="source-filter">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="adisyo">Adisyo</SelectItem>
                  <SelectItem value="getir">Getir</SelectItem>
                  <SelectItem value="trendyol">Trendyol</SelectItem>
                  <SelectItem value="yemeksepeti">Yemeksepeti</SelectItem>
                  <SelectItem value="migros">Migros</SelectItem>
                  <SelectItem value="manual">Manuel</SelectItem>
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
                data-testid="filter-orders-btn"
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
            <CardTitle className="text-base">Teslim Edilen Siparişler ({searchedOrders.length})</CardTitle>
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
                      <th className="text-left p-2 font-bold text-xs">Restoran</th>
                      <th className="text-left p-2 font-bold text-xs">Müşteri</th>
                      <th className="text-left p-2 font-bold text-xs">Tarih</th>
                      <th className="text-left p-2 font-bold text-xs">Adres</th>
                      <th className="text-left p-2 font-bold text-xs">Mesafe</th>
                      <th className="text-left p-2 font-bold text-xs">Tutar</th>
                      <th className="text-left p-2 font-bold text-xs">Ödeme</th>
                      <th className="text-left p-2 font-bold text-xs">Kurye</th>
                      {isSuperAdmin && <th className="text-right p-2 font-bold text-xs">Ücretler</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => (
                      <tr 
                        key={order.id}
                        className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => onOrderSelect && onOrderSelect(order)}
                      >
                        <td className="p-2">
                          <span className="font-medium text-xs">{order.restaurant_name || "-"}</span>
                        </td>
                        <td className="p-2">
                          <div>
                            <span className="text-xs">{order.customer_name || "-"}</span>
                            {order.customer_phone && (
                              <div className="text-xs text-muted-foreground font-mono">{order.customer_phone}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="p-2 text-xs max-w-[150px]" title={order.delivery_address}>
                          <div className="line-clamp-2">{order.delivery_address || "-"}</div>
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap">
                          {order.distance_km ? `${order.distance_km.toFixed(1)} km` : (() => {
                            const dist = calculateDistance(order);
                            return dist ? `${dist.toFixed(1)} km` : "-";
                          })()}
                        </td>
                        <td className="p-2 text-xs font-semibold whitespace-nowrap">
                          {order.total_amount?.toFixed(2) || "0.00"} ₺
                        </td>
                        <td className="p-2">
                          <PaymentBadge 
                            paymentMethod={order.payment_method}
                            paymentMethodDetail={order.payment_method_detail}
                            paymentDetails={order.payment_details}
                            totalAmount={order.total_amount}
                            showAmount={false}
                          />
                        </td>
                        <td className="p-2 text-xs">
                          {order.courier_name || "-"}
                        </td>
                        {isSuperAdmin && (
                          <td className="p-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="text-xs space-y-0.5">
                                {order.courier_id && (
                                  <div className="font-medium">
                                    <span className="text-foreground">Kurye Hakediş:</span>{" "}
                                    <span style={{color: '#dc2626'}}>{order.courier_fee ? `${order.courier_fee.toFixed(2)}₺` : "-"}</span>
                                  </div>
                                )}
                                <div className="font-medium">
                                  <span className="text-foreground">Taşıma Bedeli:</span>{" "}
                                  <span style={{color: '#16a34a'}}>{order.restaurant_fee ? `${order.restaurant_fee.toFixed(2)}₺` : "-"}</span>
                                </div>
                                {order.restaurant_kdv > 0 && (
                                  <div className="font-medium">
                                    <span className="text-foreground">Taşıma Bedeli KDV:</span>{" "}
                                    <span style={{color: '#16a34a'}}>{order.restaurant_kdv.toFixed(2)}₺</span>
                                  </div>
                                )}
                                {order.pos_commission > 0 && (
                                  <div className="font-medium">
                                    <span className="text-foreground">POS Komisyonu:</span>{" "}
                                    <span style={{color: '#16a34a'}}>{order.pos_commission.toFixed(2)}₺</span>
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-slate-100"
                                onClick={(e) => handleOpenFeeEdit(order, e)}
                                data-testid={`edit-fees-btn-${order.id}`}
                              >
                                <Pencil className="w-3 h-3 text-slate-500" />
                              </Button>
                            </div>
                          </td>
                        )}
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

      {/* Fee Edit Modal - Super Admin Only */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sipariş Ücretlerini Düzenle</DialogTitle>
          </DialogHeader>
          
          {editingOrder && (
            <div className="space-y-4 py-4">
              <div className="text-sm text-muted-foreground mb-4">
                <div><strong>Restoran:</strong> {editingOrder.restaurant_name}</div>
                <div><strong>Kurye:</strong> {editingOrder.courier_name || "-"}</div>
                <div><strong>Sipariş Tutarı:</strong> {editingOrder.total_amount?.toFixed(2)}₺</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="courier_fee" style={{color: '#dc2626'}}>Kurye Hakediş (₺)</Label>
                  <Input
                    id="courier_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFees.courier_fee}
                    onChange={(e) => setEditFees(prev => ({ ...prev, courier_fee: e.target.value }))}
                    className="mt-1"
                    data-testid="courier-fee-input"
                  />
                </div>
                <div>
                  <Label htmlFor="restaurant_fee" style={{color: '#16a34a'}}>Taşıma Bedeli (₺)</Label>
                  <Input
                    id="restaurant_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFees.restaurant_fee}
                    onChange={(e) => setEditFees(prev => ({ ...prev, restaurant_fee: e.target.value }))}
                    className="mt-1"
                    data-testid="restaurant-fee-input"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="restaurant_kdv" style={{color: '#16a34a'}}>Taşıma Bedeli KDV (₺)</Label>
                <Input
                  id="restaurant_kdv"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editFees.restaurant_kdv}
                  onChange={(e) => setEditFees(prev => ({ ...prev, restaurant_kdv: e.target.value }))}
                  className="mt-1"
                  data-testid="restaurant-kdv-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Taşıma bedeline ek olarak hesaplanan KDV tutarı
                </p>
              </div>
              
              <div>
                <Label htmlFor="pos_commission" style={{color: '#16a34a'}}>POS Komisyonu (₺)</Label>
                <Input
                  id="pos_commission"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editFees.pos_commission}
                  onChange={(e) => setEditFees(prev => ({ ...prev, pos_commission: e.target.value }))}
                  className="mt-1"
                  data-testid="pos-commission-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Kredi kartı ödemeli siparişler için POS komisyonu
                </p>
              </div>
              
              <p className="text-xs text-muted-foreground">
                * Bu değişiklik haftalık hakediş hesaplamalarına yansıyacaktır.
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)}>
              İptal
            </Button>
            <Button onClick={handleSaveFees} disabled={savingFees} data-testid="save-fees-btn">
              {savingFees ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
