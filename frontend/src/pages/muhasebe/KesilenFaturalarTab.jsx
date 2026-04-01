import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  ChevronLeft, ChevronRight, FileText, Store, Download, Trash2, 
  Eye, Loader2, Upload, Check, Receipt, Package
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount || 0)) + ' TL';
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// ==================== Week Selector ====================
function WeekSelector({ weeks, selectedIndex, onSelect }) {
  const currentWeek = weeks[selectedIndex];
  
  const handlePrev = () => {
    if (selectedIndex < weeks.length - 1) {
      onSelect(selectedIndex + 1);
    }
  };
  
  const handleNext = () => {
    if (selectedIndex > 0) {
      onSelect(selectedIndex - 1);
    }
  };
  
  return (
    <div className="border-2 border-border bg-white p-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={handlePrev} disabled={selectedIndex >= weeks.length - 1}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <div className="text-center">
          <p className="font-semibold">{currentWeek?.week_label || "Hafta Seçin"}</p>
          {currentWeek?.is_current && (
            <span className="text-xs text-primary">Bu Hafta</span>
          )}
        </div>
        
        <Button variant="outline" size="sm" onClick={handleNext} disabled={selectedIndex <= 0}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ==================== Summary Card ====================
function SummaryCard({ summary }) {
  if (!summary) return null;
  
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Hafta Özeti</h3>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-muted-foreground text-xs">Restoran</p>
            <p className="font-bold text-lg">{summary.total_restaurants}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Sipariş</p>
            <p className="font-bold text-lg">{summary.total_orders}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Taşıma Ücreti</p>
            <p className="font-bold text-lg text-blue-600">{formatMoney(summary.total_delivery_fee)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">KDV</p>
            <p className="font-bold text-lg text-orange-600">{formatMoney(summary.total_kdv)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border text-center">
          <p className="text-muted-foreground text-xs">Toplam (KDV Dahil)</p>
          <p className="font-bold text-2xl text-primary">{formatMoney(summary.total_with_kdv)}</p>
        </div>
      </div>
    </div>
  );
}

// ==================== Restaurants Table ====================
function RestaurantsTable({ restaurants, onUpload, onView, onDelete, uploading }) {
  const fileInputRef = useRef(null);
  const [uploadingRestaurantId, setUploadingRestaurantId] = useState(null);
  
  const handleFileSelect = (restaurantId) => {
    setUploadingRestaurantId(restaurantId);
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file && uploadingRestaurantId) {
      await onUpload(uploadingRestaurantId, file);
      setUploadingRestaurantId(null);
    }
    e.target.value = "";
  };
  
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Restoran Detayları</h3>
          <span className="text-xs text-muted-foreground">({restaurants.length})</span>
        </div>
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
      />
      
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-slate-50/50">
              <th className="text-left p-3 font-semibold">Restoran</th>
              <th className="text-right p-3 font-semibold">Sipariş</th>
              <th className="text-right p-3 font-semibold">Taşıma</th>
              <th className="text-right p-3 font-semibold">KDV</th>
              <th className="text-right p-3 font-semibold">Toplam</th>
              <th className="text-center p-3 font-semibold">Fatura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {restaurants.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  Bu hafta sipariş yok
                </td>
              </tr>
            ) : (
              restaurants.map((r) => (
                <tr key={r.restaurant_id} className={`hover:bg-slate-50 ${r.invoice_uploaded ? 'bg-green-50/30' : ''}`}>
                  <td className="p-3">
                    <p className="font-medium">{r.restaurant_name}</p>
                  </td>
                  <td className="p-3 text-right font-mono">{r.order_count}</td>
                  <td className="p-3 text-right font-mono text-blue-600">{formatMoney(r.total_delivery_fee)}</td>
                  <td className="p-3 text-right font-mono text-orange-600">{formatMoney(r.kdv)}</td>
                  <td className="p-3 text-right font-mono font-semibold">{formatMoney(r.total_with_kdv)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      {r.invoice_uploaded ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onView(r.invoice_id)}
                            className="h-8 w-8 p-0"
                            title="Görüntüle"
                          >
                            <Eye className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDelete(r.invoice_id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleFileSelect(r.restaurant_id)}
                          disabled={uploading}
                          className="h-8 gap-1 text-xs"
                        >
                          {uploading && uploadingRestaurantId === r.restaurant_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          Yükle
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-slate-100">
        {restaurants.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Bu hafta sipariş yok
          </div>
        ) : restaurants.map((r) => (
          <div key={r.restaurant_id} className={`p-3 ${r.invoice_uploaded ? 'bg-green-50/30' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-sm truncate flex-1">{r.restaurant_name}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                {r.invoice_uploaded ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onView(r.invoice_id)} className="h-7 w-7 p-0" title="Görüntüle">
                      <Eye className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(r.invoice_id)} className="h-7 w-7 p-0 text-red-500" title="Sil">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleFileSelect(r.restaurant_id)} disabled={uploading} className="h-7 px-2 text-[10px]">
                    {uploading && uploadingRestaurantId === r.restaurant_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                    Yükle
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div className="bg-slate-50 rounded p-1.5 text-center">
                <p className="text-muted-foreground">Sipariş</p>
                <p className="font-semibold">{r.order_count}</p>
              </div>
              <div className="bg-blue-50 rounded p-1.5 text-center">
                <p className="text-blue-600">Taşıma</p>
                <p className="font-semibold text-blue-700">{formatMoney(r.total_delivery_fee)}</p>
              </div>
              <div className="bg-orange-50 rounded p-1.5 text-center">
                <p className="text-orange-600">KDV</p>
                <p className="font-semibold text-orange-700">{formatMoney(r.kdv)}</p>
              </div>
              <div className="bg-slate-100 rounded p-1.5 text-center">
                <p className="text-slate-600">Toplam</p>
                <p className="font-bold">{formatMoney(r.total_with_kdv)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Main Component ====================
export default function KesilenFaturalarTab({ companyId, adminId, adminName }) {
  const [weeks, setWeeks] = useState([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [data, setData] = useState({ restaurants: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  
  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Fetch weeks
  const fetchWeeks = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/issued-invoices/${companyId}/weeks`);
      setWeeks(res.data);
    } catch (err) {
      console.error("Haftalar yüklenemedi:", err);
    }
  }, [companyId]);

  // Fetch week data
  const fetchData = useCallback(async () => {
    if (!companyId || weeks.length === 0) return;
    
    const week = weeks[selectedWeekIndex];
    if (!week) return;
    
    setLoading(true);
    try {
      const res = await axios.get(`${API}/issued-invoices/${companyId}/week-summary`, {
        params: {
          week_start: week.week_start,
          week_end: week.week_end
        }
      });
      setData(res.data);
    } catch (err) {
      console.error("Veriler yüklenemedi:", err);
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, weeks, selectedWeekIndex]);

  useEffect(() => {
    fetchWeeks();
  }, [fetchWeeks]);

  useEffect(() => {
    if (weeks.length > 0) {
      fetchData();
    }
  }, [fetchData, weeks.length]);

  // Upload invoice
  const handleUpload = async (restaurantId, file) => {
    if (!companyId || weeks.length === 0) return;
    
    const week = weeks[selectedWeekIndex];
    const restaurant = data.restaurants.find(r => r.restaurant_id === restaurantId);
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("restaurant_id", restaurantId);
      formData.append("week_start", week.week_start);
      formData.append("week_label", week.week_label);
      formData.append("admin_id", adminId || "");
      formData.append("admin_name", adminName || "");
      
      await axios.post(`${API}/issued-invoices/${companyId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      toast.success(`${restaurant?.restaurant_name || "Restoran"} faturası yüklendi`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yükleme başarısız");
    } finally {
      setUploading(false);
    }
  };

  // View invoice
  const handleView = async (invoiceId) => {
    try {
      const res = await axios.get(`${API}/issued-invoices/${companyId}/download/${invoiceId}`);
      setViewingInvoice(res.data);
      setShowViewModal(true);
    } catch (err) {
      toast.error("Fatura yüklenemedi");
    }
  };

  // Delete invoice
  const handleDelete = (invoiceId) => {
    setPendingDeleteId(invoiceId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/issued-invoices/${companyId}/invoice/${pendingDeleteId}`);
      toast.success("Fatura silindi");
      fetchData();
    } catch (err) {
      toast.error("Silme başarısız");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  if (!companyId) {
    return <div className="p-4 text-center text-muted-foreground">Şirket seçilmedi</div>;
  }

  if (weeks.length === 0) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="kesilen-faturalar-tab">
      <WeekSelector
        weeks={weeks}
        selectedIndex={selectedWeekIndex}
        onSelect={setSelectedWeekIndex}
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SummaryCard summary={data.summary} />
          
          <RestaurantsTable
            restaurants={data.restaurants}
            onUpload={handleUpload}
            onView={handleView}
            onDelete={handleDelete}
            uploading={uploading}
          />
        </>
      )}

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
