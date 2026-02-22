import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  ChevronLeft, ChevronRight, Upload, FileText, AlertCircle, 
  Store, Receipt, Download, Trash2, CheckCircle, Eye, Loader2,
  Archive, Check, Circle, User, Filter, AlertTriangle
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Utility functions
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount || 0)) + ' TL';
};

// ==================== Week Selector ====================
function WeekSelector({ weeks, selectedIndex, onPrev, onNext }) {
  const currentWeek = weeks[selectedIndex];
  
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onPrev}
            disabled={selectedIndex >= weeks.length - 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <div className="text-center">
            <p className="font-semibold">{currentWeek?.label || "Yükleniyor..."}</p>
            <p className="text-xs text-muted-foreground">
              {currentWeek?.is_current ? "Bu Hafta" : currentWeek?.is_complete ? "Tamamlandı" : ""}
            </p>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onNext}
            disabled={selectedIndex <= 0}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Week Invoices Card ====================
function WeekInvoicesCard({ invoices, selectedInvoices, onToggleSelection, onSelectAll, onDownloadBulk, onView, onVerifyWithAmount }) {
  const [verifyModal, setVerifyModal] = useState({ open: false, invoice: null, restaurant: null });
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleOpenVerifyModal = (invoice, restaurant) => {
    setVerifyModal({ open: true, invoice, restaurant });
    setInvoiceAmount(invoice.verified_amount > 0 ? invoice.verified_amount.toString() : "");
  };

  const handleVerify = async () => {
    if (!invoiceAmount || parseFloat(invoiceAmount) <= 0) return;
    setVerifying(true);
    try {
      await onVerifyWithAmount(verifyModal.invoice.invoice_id, parseFloat(invoiceAmount));
      setVerifyModal({ open: false, invoice: null, restaurant: null });
    } finally {
      setVerifying(false);
    }
  };

  // Flatten all invoices from all restaurants
  const allInvoices = invoices.flatMap(r => 
    (r.invoices || []).map(inv => ({ ...inv, restaurant_name: r.restaurant_name, restaurant_id: r.restaurant_id, required_amount: r.required_amount }))
  );

  return (
    <>
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Hafta Faturaları</h3>
              <span className="text-xs text-muted-foreground">({allInvoices.length})</span>
            </div>
            {allInvoices.length > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onSelectAll} className="h-8 text-xs">
                  {selectedInvoices.length === allInvoices.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                </Button>
                {selectedInvoices.length > 0 && (
                  <Button size="sm" onClick={onDownloadBulk} className="h-8 text-xs gap-1">
                    <Download className="w-3 h-3" />
                    İndir ({selectedInvoices.length})
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {allInvoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Archive className="w-12 h-12 mx-auto mb-2 opacity-20" />
              Bu haftada yüklenen fatura yok
            </div>
          ) : (
            <div className="divide-y divide-border">
              {allInvoices.map((invoice) => (
                <div 
                  key={invoice.invoice_id} 
                  className={`p-3 hover:bg-slate-50 ${
                    selectedInvoices.includes(invoice.invoice_id) ? 'bg-primary/5' : ''
                  } ${invoice.verified ? 'bg-green-50/50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div 
                      className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
                      onClick={() => onToggleSelection(invoice.invoice_id)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedInvoices.includes(invoice.invoice_id) 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-slate-300'
                      }`}>
                        {selectedInvoices.includes(invoice.invoice_id) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{invoice.restaurant_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.filename} • {formatDateTime(invoice.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-sm font-mono text-red-600">
                        {formatMoney(invoice.required_amount)}
                      </p>
                      {invoice.verified && invoice.verified_amount && (
                        <p className="text-xs text-green-600">
                          Onaylanan: {formatMoney(invoice.verified_amount)}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => onView(invoice.invoice_id)} className="h-8 w-8 p-0" title="Görüntüle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenVerifyModal(invoice, { restaurant_name: invoice.restaurant_name, required_amount: invoice.required_amount })}
                        className={`h-8 w-8 p-0 ${invoice.verified ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-green-600'}`}
                        title={invoice.verified ? "Kontrol edildi" : "Kontrol et"}
                      >
                        {invoice.verified ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Verify Modal */}
      <Dialog open={verifyModal.open} onOpenChange={(open) => !open && setVerifyModal({ open: false, invoice: null, restaurant: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Fatura Kontrol
            </DialogTitle>
          </DialogHeader>
          
          {verifyModal.invoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="font-semibold">{verifyModal.restaurant?.restaurant_name}</p>
                <p className="text-sm text-muted-foreground">{verifyModal.invoice.filename}</p>
                <p className="text-lg font-bold font-mono text-red-600 mt-2">
                  Beklenen: {formatMoney(verifyModal.restaurant?.required_amount)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fatura Tutarı (TL)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="h-12 text-lg font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Eğer tutar beklenen miktardan düşükse, kalan tutar için yeni fatura beklenecektir.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setVerifyModal({ open: false, invoice: null, restaurant: null })}>İptal</Button>
                <Button 
                  onClick={handleVerify} 
                  disabled={verifying || !invoiceAmount}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  {verifying ? "Kontrol ediliyor..." : "Kontrol Et"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==================== Missing Invoices Card ====================
function MissingInvoicesCard({ missingInvoices, onUpload }) {
  const [selectedRestaurant, setSelectedRestaurant] = useState("");

  const filteredInvoices = selectedRestaurant 
    ? missingInvoices.filter(r => r.restaurant_id === selectedRestaurant)
    : missingInvoices;

  const getBreakdownText = (breakdown) => {
    const parts = [];
    if (breakdown?.cash) parts.push(`Nakit: ${formatMoney(breakdown.cash)}`);
    if (breakdown?.credit_card) parts.push(`KK: ${formatMoney(breakdown.credit_card)}`);
    if (breakdown?.online) parts.push(`Online: ${formatMoney(breakdown.online)}`);
    if (breakdown?.meal_card) parts.push(`YK: ${formatMoney(breakdown.meal_card)}`);
    if (breakdown?.online_meal_card) parts.push(`OYK: ${formatMoney(breakdown.online_meal_card)}`);
    return parts.join(" • ");
  };

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="font-semibold text-sm text-red-700">Eksik Faturalar</h3>
            <span className="text-xs text-red-500">({filteredInvoices.length})</span>
          </div>
        </div>
        
        {missingInvoices.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="flex-1 h-9 text-sm border border-red-200 rounded px-2 bg-white"
            >
              <option value="">Tüm Restoranlar</option>
              {missingInvoices.map(r => (
                <option key={r.restaurant_id} value={r.restaurant_id}>
                  {r.restaurant_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-green-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Tüm faturalar alındı
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredInvoices.map((item) => (
              <div key={item.restaurant_id} className="p-3 hover:bg-red-50/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{item.restaurant_name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {getBreakdownText(item.breakdown)}
                    </p>
                    {item.verified_amount > 0 && (
                      <p className="text-[10px] text-green-600 mt-0.5">
                        Alınan: {formatMoney(item.verified_amount)} → Kalan: {formatMoney(item.remaining_amount)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold font-mono text-red-600">
                      {formatMoney(item.remaining_amount || item.required_amount)}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => onUpload(item)} className="h-8 text-xs gap-1">
                      <Upload className="w-3 h-3" />
                      Yükle
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Restaurants List Card ====================
function RestaurantsListCard({ restaurants, selectedRestaurant, onSelect }) {
  // Combine missing and received
  const allRestaurants = restaurants;
  
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Restoranlar</h3>
          <span className="text-xs text-muted-foreground">({allRestaurants.length})</span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {allRestaurants.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Fatura bekleyen restoran yok
          </div>
        ) : (
          allRestaurants.map((restaurant) => (
            <div
              key={restaurant.restaurant_id}
              onClick={() => onSelect(selectedRestaurant?.restaurant_id === restaurant.restaurant_id ? null : restaurant)}
              className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                selectedRestaurant?.restaurant_id === restaurant.restaurant_id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
              } ${restaurant.is_complete ? 'bg-green-50/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{restaurant.restaurant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Beklenen: {formatMoney(restaurant.required_amount)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={`text-sm font-semibold ${
                    (restaurant.invoices?.length || 0) > 0 ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {restaurant.invoices?.length || 0}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== Restaurant Invoices Card ====================
function RestaurantInvoicesCard({ selectedRestaurant, loading, onView, onDelete, onUpload }) {
  if (!selectedRestaurant) {
    return (
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Restoran Seçin</h3>
          </div>
        </div>
        <div className="p-8 text-center text-muted-foreground text-sm">
          <Store className="w-12 h-12 mx-auto mb-2 opacity-20" />
          Faturalarını görmek için bir restoran seçin
        </div>
      </div>
    );
  }

  const invoices = selectedRestaurant.invoices || [];
  const getBreakdownText = (breakdown) => {
    const parts = [];
    if (breakdown?.cash) parts.push(`Nakit: ${formatMoney(breakdown.cash)}`);
    if (breakdown?.credit_card) parts.push(`KK: ${formatMoney(breakdown.credit_card)}`);
    if (breakdown?.online) parts.push(`Online: ${formatMoney(breakdown.online)}`);
    if (breakdown?.meal_card) parts.push(`YK: ${formatMoney(breakdown.meal_card)}`);
    if (breakdown?.online_meal_card) parts.push(`OYK: ${formatMoney(breakdown.online_meal_card)}`);
    return parts.join(" • ");
  };

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{selectedRestaurant.restaurant_name}</h3>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <Button size="sm" variant="outline" onClick={() => onUpload(selectedRestaurant)} className="h-8 text-xs gap-1">
            <Upload className="w-3 h-3" />
            Yükle
          </Button>
        </div>
      </div>
      
      {/* Summary */}
      <div className="p-3 bg-slate-50/50 border-b border-border">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Beklenen</p>
            <p className="font-semibold text-red-600">{formatMoney(selectedRestaurant.required_amount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Onaylanan</p>
            <p className="font-semibold text-green-600">{formatMoney(selectedRestaurant.verified_amount)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {getBreakdownText(selectedRestaurant.breakdown)}
        </p>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Henüz fatura yüklenmemiş
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => (
              <div key={invoice.invoice_id} className={`p-3 hover:bg-slate-50 ${invoice.verified ? 'bg-green-50/30' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{invoice.filename}</p>
                      {invoice.verified && (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(invoice.uploaded_at)}
                      {invoice.verified && invoice.verified_amount && (
                        <span className="ml-2 text-green-600">
                          Onaylanan: {formatMoney(invoice.verified_amount)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => onView(invoice.invoice_id)} className="h-8 w-8 p-0" title="Görüntüle">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(invoice.invoice_id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" title="Sil">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Main Component ====================
export default function IsletmeFaturalariTab({ companyId, adminId, adminName, isSuperAdmin }) {
  // Week selection
  const [weeks, setWeeks] = useState([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // View invoice modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  
  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Fetch weeks
  const fetchWeeks = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/weeks`);
      setWeeks(res.data);
    } catch (err) {
      console.error("Haftalar yüklenemedi:", err);
    }
  }, [companyId]);

  // Fetch week data
  const fetchWeekData = useCallback(async () => {
    if (!companyId || weeks.length === 0) return;
    
    const week = weeks[selectedWeekIndex];
    if (!week) return;
    
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/week/${week.week_start}`);
      setWeekData(res.data);
      setSelectedRestaurant(null);
    } catch (err) {
      console.error("Hafta verileri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, weeks, selectedWeekIndex]);

  useEffect(() => {
    fetchWeeks();
  }, [fetchWeeks]);

  useEffect(() => {
    if (weeks.length > 0) {
      fetchWeekData();
    }
  }, [weeks, selectedWeekIndex, fetchWeekData]);

  // Navigation
  const handlePrevWeek = () => {
    if (selectedWeekIndex < weeks.length - 1) {
      setSelectedWeekIndex(selectedWeekIndex + 1);
    }
  };

  const handleNextWeek = () => {
    if (selectedWeekIndex > 0) {
      setSelectedWeekIndex(selectedWeekIndex - 1);
    }
  };

  // Selection handlers
  const handleToggleSelection = (invoiceId) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handleSelectAll = () => {
    const allIds = [...(weekData?.missing_invoices || []), ...(weekData?.received_invoices || [])]
      .flatMap(r => (r.invoices || []).map(inv => inv.invoice_id));
    
    if (selectedInvoices.length === allIds.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(allIds);
    }
  };

  // Upload handlers
  const openUploadModal = (restaurant) => {
    setUploadTarget(restaurant);
    setUploadFile(null);
    setShowUploadModal(true);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTarget) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("restaurant_id", uploadTarget.restaurant_id);
    formData.append("week_start", weeks[selectedWeekIndex].week_start);
    formData.append("admin_id", adminId || "");
    formData.append("admin_name", adminName || "");
    
    try {
      await axios.post(`${API}/restaurant-invoices/${companyId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Fatura yüklendi");
      setShowUploadModal(false);
      fetchWeekData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yükleme başarısız");
    } finally {
      setUploading(false);
    }
  };

  // Verify handler
  const handleVerifyWithAmount = async (invoiceId, amount) => {
    try {
      await axios.post(`${API}/restaurant-invoices/${companyId}/verify`, {
        invoice_id: invoiceId,
        amount: amount,
        admin_id: adminId || "",
        admin_name: adminName || ""
      });
      toast.success("Fatura onaylandı");
      fetchWeekData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onaylama başarısız");
      throw err;
    }
  };

  // View invoice
  const handleViewInvoice = async (invoiceId) => {
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/download/${invoiceId}`);
      setViewingInvoice(res.data);
      setShowViewModal(true);
    } catch (err) {
      toast.error("Fatura yüklenemedi");
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (invoiceId) => {
    setPendingDeleteId(invoiceId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/restaurant-invoices/${companyId}/invoice/${pendingDeleteId}`);
      toast.success("Fatura silindi");
      fetchWeekData();
    } catch (err) {
      toast.error("Silme başarısız");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Download bulk
  const handleDownloadBulk = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("En az bir fatura seçin");
      return;
    }
    // For now, just download one by one
    for (const id of selectedInvoices) {
      try {
        const res = await axios.get(`${API}/restaurant-invoices/${companyId}/download/${id}`);
        const link = document.createElement("a");
        link.href = `data:application/${res.data.extension};base64,${res.data.file_data}`;
        link.download = res.data.filename;
        link.click();
      } catch (err) {
        console.error("Download error:", err);
      }
    }
    setSelectedInvoices([]);
  };

  if (!companyId) {
    return <div className="p-4 text-center text-muted-foreground">Şirket seçilmedi</div>;
  }

  if (loading && weeks.length === 0) return <PageLoading />;

  // Combine all restaurants for the list
  const allRestaurants = [...(weekData?.missing_invoices || []), ...(weekData?.received_invoices || [])];

  return (
    <div className="space-y-4" data-testid="isletme-faturalari-tab">
      <WeekSelector
        weeks={weeks}
        selectedIndex={selectedWeekIndex}
        onPrev={handlePrevWeek}
        onNext={handleNextWeek}
      />

      {loading ? (
        <PageLoading />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WeekInvoicesCard
            invoices={allRestaurants}
            selectedInvoices={selectedInvoices}
            onToggleSelection={handleToggleSelection}
            onSelectAll={handleSelectAll}
            onDownloadBulk={handleDownloadBulk}
            onView={handleViewInvoice}
            onVerifyWithAmount={handleVerifyWithAmount}
          />

          <MissingInvoicesCard 
            missingInvoices={weekData?.missing_invoices || []}
            onUpload={openUploadModal}
          />

          <RestaurantsListCard
            restaurants={allRestaurants}
            selectedRestaurant={selectedRestaurant}
            onSelect={setSelectedRestaurant}
          />

          <RestaurantInvoicesCard
            selectedRestaurant={selectedRestaurant}
            loading={false}
            onView={handleViewInvoice}
            onDelete={handleDeleteInvoice}
            onUpload={openUploadModal}
          />
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Fatura Yükle - {uploadTarget?.restaurant_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium">Beklenen Tutar</p>
              <p className="text-lg font-bold text-red-600">
                {formatMoney(uploadTarget?.remaining_amount || uploadTarget?.required_amount)}
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium">Fatura Dosyası</label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG veya PNG formatında (max 10MB)
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)}>
              İptal
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Yükle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Fatura Önizleme</DialogTitle>
          </DialogHeader>
          
          {viewingInvoice && (
            <div className="flex-1 overflow-auto">
              {viewingInvoice.extension === "pdf" ? (
                <iframe
                  src={`data:application/pdf;base64,${viewingInvoice.file_data}`}
                  className="w-full h-[70vh]"
                  title="Fatura"
                />
              ) : (
                <img
                  src={`data:image/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`}
                  alt="Fatura"
                  className="max-w-full max-h-[70vh] mx-auto"
                />
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Kapat
            </Button>
            {viewingInvoice && (
              <Button onClick={() => {
                const link = document.createElement("a");
                link.href = `data:application/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`;
                link.download = viewingInvoice.filename;
                link.click();
              }}>
                <Download className="w-4 h-4 mr-2" />
                İndir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Fatura Silme"
        description="Bu faturayı silmek istediğinize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}
