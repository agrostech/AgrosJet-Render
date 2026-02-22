import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  ChevronLeft, ChevronRight, Upload, FileCheck, AlertCircle, 
  Store, Receipt, Download, Trash2, CheckCircle2, Eye, Loader2
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IsletmeFaturalariTab({ companyId, adminId, adminName, isSuperAdmin }) {
  // Week selection
  const [weeks, setWeeks] = useState([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Verify modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyAmount, setVerifyAmount] = useState("");
  const [verifying, setVerifying] = useState(false);
  
  // View invoice modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  // Fetch weeks
  const fetchWeeks = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/weeks`);
      setWeeks(res.data);
    } catch (err) {
      console.error("Haftalar yüklenemedi:", err);
      toast.error("Haftalar yüklenemedi");
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
    } catch (err) {
      console.error("Hafta verileri yüklenemedi:", err);
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

  // Upload handlers
  const openUploadModal = (restaurant) => {
    setSelectedRestaurant(restaurant);
    setUploadFile(null);
    setShowUploadModal(true);
  };

  const handleUpload = async () => {
    if (!uploadFile || !selectedRestaurant) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("restaurant_id", selectedRestaurant.restaurant_id);
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

  // Verify handlers
  const openVerifyModal = (restaurant, invoice) => {
    setVerifyData({ restaurant, invoice });
    setVerifyAmount(invoice.verified_amount > 0 ? invoice.verified_amount.toString() : "");
    setShowVerifyModal(true);
  };

  const handleVerify = async () => {
    if (!verifyData || !verifyAmount) return;
    
    setVerifying(true);
    try {
      await axios.post(`${API}/restaurant-invoices/${companyId}/verify`, {
        invoice_id: verifyData.invoice.invoice_id,
        amount: parseFloat(verifyAmount),
        admin_id: adminId || "",
        admin_name: adminName || ""
      });
      toast.success("Fatura onaylandı");
      setShowVerifyModal(false);
      fetchWeekData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onaylama başarısız");
    } finally {
      setVerifying(false);
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
    if (!window.confirm("Bu faturayı silmek istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-invoices/${companyId}/invoice/${invoiceId}`);
      toast.success("Fatura silindi");
      fetchWeekData();
    } catch (err) {
      toast.error("Silme başarısız");
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount || 0);
  };

  // Get breakdown text
  const getBreakdownText = (breakdown) => {
    const parts = [];
    if (breakdown.cash) parts.push(`Nakit: ${formatCurrency(breakdown.cash)}`);
    if (breakdown.credit_card) parts.push(`Kredi Kartı: ${formatCurrency(breakdown.credit_card)}`);
    if (breakdown.online) parts.push(`Online: ${formatCurrency(breakdown.online)}`);
    if (breakdown.meal_card) parts.push(`Yemek Kartı: ${formatCurrency(breakdown.meal_card)}`);
    if (breakdown.online_meal_card) parts.push(`Online Yemek Kartı: ${formatCurrency(breakdown.online_meal_card)}`);
    return parts.join(" • ");
  };

  if (!companyId) {
    return <div className="p-4 text-center text-muted-foreground">Şirket seçilmedi</div>;
  }

  const currentWeek = weeks[selectedWeekIndex];

  return (
    <div className="space-y-4">
      {/* Week Selector */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrevWeek}
              disabled={selectedWeekIndex >= weeks.length - 1}
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
              onClick={handleNextWeek}
              disabled={selectedWeekIndex <= 0}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <PageLoading />
      ) : weekData ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-50">
              <CardContent className="py-3 text-center">
                <Store className="w-5 h-5 mx-auto mb-1 text-slate-600" />
                <p className="text-2xl font-bold">{weekData.stats.total_restaurants}</p>
                <p className="text-xs text-muted-foreground">Toplam Restoran</p>
              </CardContent>
            </Card>
            
            <Card className="bg-red-50">
              <CardContent className="py-3 text-center">
                <AlertCircle className="w-5 h-5 mx-auto mb-1 text-red-600" />
                <p className="text-2xl font-bold text-red-600">{weekData.stats.missing_count}</p>
                <p className="text-xs text-muted-foreground">Eksik Fatura</p>
              </CardContent>
            </Card>
            
            <Card className="bg-green-50">
              <CardContent className="py-3 text-center">
                <FileCheck className="w-5 h-5 mx-auto mb-1 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{weekData.stats.received_count}</p>
                <p className="text-xs text-muted-foreground">Alınan Fatura</p>
              </CardContent>
            </Card>
            
            <Card className="bg-blue-50">
              <CardContent className="py-3 text-center">
                <Receipt className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                <p className="text-lg font-bold text-blue-600">{formatCurrency(weekData.stats.total_required)}</p>
                <p className="text-xs text-muted-foreground">Toplam Tutar</p>
              </CardContent>
            </Card>
          </div>

          {/* Missing Invoices */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Eksik Faturalar ({weekData.missing_invoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekData.missing_invoices.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>Tüm faturalar alındı</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {weekData.missing_invoices.map((item) => (
                    <div 
                      key={item.restaurant_id} 
                      className="p-3 border rounded-lg bg-red-50/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.restaurant_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {getBreakdownText(item.breakdown)}
                          </p>
                          <p className="text-sm font-bold text-red-600 mt-1">
                            Beklenen: {formatCurrency(item.required_amount)}
                            {item.verified_amount > 0 && (
                              <span className="text-green-600 ml-2">
                                (Alınan: {formatCurrency(item.verified_amount)}, Kalan: {formatCurrency(item.remaining_amount)})
                              </span>
                            )}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Yüklenen faturalar */}
                          {item.invoices?.length > 0 && (
                            <div className="flex items-center gap-1">
                              {item.invoices.map((inv) => (
                                <div key={inv.invoice_id} className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleViewInvoice(inv.invoice_id)}
                                    className="h-8 px-2"
                                    title="Görüntüle"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {isSuperAdmin && !inv.verified && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openVerifyModal(item, inv)}
                                      className="h-8 px-2 text-green-600 border-green-300"
                                      title="Onayla"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {isSuperAdmin && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteInvoice(inv.invoice_id)}
                                      className="h-8 px-2 text-red-600"
                                      title="Sil"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openUploadModal(item)}
                            className="h-8"
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Yükle
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Received Invoices */}
          {weekData.received_invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-green-500" />
                  Alınan Faturalar ({weekData.received_invoices.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {weekData.received_invoices.map((item) => (
                    <div 
                      key={item.restaurant_id} 
                      className="p-3 border rounded-lg bg-green-50/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.restaurant_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {getBreakdownText(item.breakdown)}
                          </p>
                          <p className="text-sm font-bold text-green-600 mt-1">
                            Onaylanan: {formatCurrency(item.verified_amount)}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {item.invoices?.map((inv) => (
                            <div key={inv.invoice_id} className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewInvoice(inv.invoice_id)}
                                className="h-8 px-2"
                                title="Görüntüle"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {isSuperAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteInvoice(inv.invoice_id)}
                                  className="h-8 px-2 text-red-600"
                                  title="Sil"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Veri bulunamadı
          </CardContent>
        </Card>
      )}

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Fatura Yükle - {selectedRestaurant?.restaurant_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium">Beklenen Tutar</p>
              <p className="text-lg font-bold text-red-600">
                {formatCurrency(selectedRestaurant?.remaining_amount || selectedRestaurant?.required_amount)}
              </p>
              {selectedRestaurant?.breakdown && (
                <p className="text-xs text-muted-foreground mt-1">
                  {getBreakdownText(selectedRestaurant.breakdown)}
                </p>
              )}
            </div>
            
            <div>
              <Label>Fatura Dosyası</Label>
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

      {/* Verify Modal */}
      <Dialog open={showVerifyModal} onOpenChange={setShowVerifyModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Fatura Onayla - {verifyData?.restaurant?.restaurant_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium">Beklenen Tutar</p>
              <p className="text-lg font-bold">
                {formatCurrency(verifyData?.restaurant?.required_amount)}
              </p>
            </div>
            
            <div>
              <Label>Fatura Tutarı</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={verifyAmount}
                onChange={(e) => setVerifyAmount(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Eğer tutar beklenen miktardan düşükse, kalan tutar için yeni fatura beklenecektir.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyModal(false)}>
              İptal
            </Button>
            <Button 
              onClick={handleVerify} 
              disabled={!verifyAmount || verifying}
              className="bg-green-600 hover:bg-green-700"
            >
              {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Onayla
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
    </div>
  );
}
