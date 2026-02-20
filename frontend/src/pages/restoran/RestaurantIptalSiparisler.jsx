import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Package, Search, ChevronLeft, ChevronRight, XCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantIptalSiparisler({ restaurantId }) {
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter states
  const [paymentFilter, setPaymentFilter] = useState("all");
  
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
      const res = await axios.get(`${API}/restaurant/orders/${restaurantId}?status=cancelled`);
      let result = res.data || [];
      
      // Payment method filter
      if (filters.payment !== "all") {
        result = result.filter(o => o.payment_method === filters.payment);
      }
      
      // Date range filter
      if (filters.startDateTime && filters.endDateTime) {
        const start = new Date(filters.startDateTime);
        const end = new Date(filters.endDateTime);
        
        result = result.filter(o => {
          const orderDate = new Date(o.cancelled_at || o.updated_at || o.created_at);
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
      payment: paymentFilter,
      startDateTime,
      endDateTime
    });
  };

  // Initial load
  useEffect(() => {
    if (!restaurantId || initialized) return;
    
    const defaults = getDefaultDates();
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    
    fetchAndFilterOrders({
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
    setPaymentFilter("all");
    const defaults = getDefaultDates();
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    setCurrentPage(1);
    fetchAndFilterOrders({
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
        order.delivery_address,
        order.total_amount?.toString(),
        order.order_number,
        order.cancellation_reason
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

  return (
    <div className="space-y-4">
      {/* Compact Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
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
              <XCircle className="w-5 h-5 text-red-600" />
              İptal Edilen Siparişler ({searchedOrders.length})
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
              <p>{searchQuery ? "Aramayla eşleşen sipariş bulunamadı" : "İptal edilmiş sipariş bulunamadı"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-red-500">
                      <th className="text-left p-2 font-bold text-xs">Tarih</th>
                      <th className="text-left p-2 font-bold text-xs">Müşteri</th>
                      <th className="text-left p-2 font-bold text-xs">Adres</th>
                      <th className="text-left p-2 font-bold text-xs">Tutar</th>
                      <th className="text-left p-2 font-bold text-xs">Ödeme</th>
                      <th className="text-left p-2 font-bold text-xs">İptal Nedeni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => (
                      <tr 
                        key={order.id}
                        className="border-b hover:bg-red-50/50 transition-colors"
                      >
                        <td className="p-2 text-xs whitespace-nowrap">
                          {formatDate(order.cancelled_at || order.created_at)}
                        </td>
                        <td className="p-2">
                          <div>
                            <span className="text-xs font-medium">{order.customer_name || "-"}</span>
                            {order.customer_phone && (
                              <div className="text-xs text-muted-foreground font-mono">{order.customer_phone}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-xs max-w-[200px]" title={order.delivery_address}>
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
                        <td className="p-2 text-xs text-red-600 max-w-[150px]">
                          <div className="line-clamp-2">{order.cancellation_reason || "-"}</div>
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
