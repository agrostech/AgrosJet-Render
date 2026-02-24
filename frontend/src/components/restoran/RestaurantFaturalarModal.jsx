import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, Upload, Download, Eye, CheckCircle, Clock, 
  RefreshCw, Receipt, Loader2, Package, Trash2, AlertTriangle,
  FileCheck, Share2, Building2, Percent
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount || 0)) + ' TL';
};

const formatMoneyForFilename = (amount) => {
  return Math.round(amount || 0).toString();
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR");
};

// Türkçe karakterleri temizle
const sanitizeFilename = (str) => {
  return str
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/[^a-zA-Z0-9_-]/g, '');
};

// ==================== Fatura Örneği Modal ====================
function FaturaOrnegiModal({ open, onClose, invoiceData, companyInfo, invoiceSettings }) {
  if (!invoiceData || !open) return null;
  
  const { week_label, total_amount } = invoiceData;
  const percentage = invoiceSettings?.percentage || 10;
  const percentageName = invoiceSettings?.percentage_name || "Yeme-İçme";
  
  // Aktif toggle'ları belirle
  const activePaymentMethods = [];
  if (invoiceSettings?.cash) activePaymentMethods.push("Nakit");
  if (invoiceSettings?.credit_card) activePaymentMethods.push("Kredi Kartı");
  if (invoiceSettings?.online) activePaymentMethods.push("Online");
  if (invoiceSettings?.meal_card) activePaymentMethods.push("Yemek Kartı");
  if (invoiceSettings?.online_meal_card) activePaymentMethods.push("Online Yemek Kartı");
  
  const paymentMethodsText = activePaymentMethods.join(" + ") || "tahsilat";
  
  // Tarih formatını düzelt: "23.02 - 02.03.2026" -> "23.02.2026 - 02.03.2026"
  const formatWeekLabel = (label) => {
    if (!label) return "";
    const parts = label.split(" - ");
    if (parts.length !== 2) return label;
    const startDate = parts[0]; // "23.02"
    const endDate = parts[1];   // "02.03.2026"
    const year = endDate.split(".")[2] || new Date().getFullYear();
    return `${startDate}.${year} - ${endDate}`;
  };
  
  const formattedWeekLabel = formatWeekLabel(week_label);
  
  // WhatsApp mesajı oluştur
  const generateWhatsAppMessage = () => {
    const companyName = companyInfo?.name || "Şirket";
    const message = `
*FATURA BİLGİLERİ*

*Kesilecek Şirket:*
${companyInfo?.name || "-"}
${companyInfo?.tax_office ? `Vergi Dairesi: ${companyInfo.tax_office}` : ""}
${companyInfo?.tax_number ? `Vergi No: ${companyInfo.tax_number}` : ""}
${companyInfo?.address || ""}

*Fatura Bilgileri:*
${percentageName} (%${percentage})
Tutar: ${formatMoney(total_amount)}
KDV Dahil

*Açıklama:*
"${formattedWeekLabel}" tarihleri arasında, ${companyName}'ın tarafımızca yapmış olduğu ${paymentMethodsText} tahsilatlarının bedeli.
    `.trim();
    
    return encodeURIComponent(message);
  };
  
  const handleWhatsAppShare = () => {
    const message = generateWhatsAppMessage();
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5" />
            Fatura Örneği
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Şirket Bilgileri */}
          <div className="p-3 bg-slate-50 rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-sm">Fatura Kesilecek Şirket</span>
            </div>
            <div className="text-sm space-y-1">
              <p className="font-semibold">{companyInfo?.name || "-"}</p>
              {companyInfo?.tax_office && (
                <p className="text-muted-foreground">Vergi Dairesi: {companyInfo.tax_office}</p>
              )}
              {companyInfo?.tax_number && (
                <p className="text-muted-foreground">Vergi No: {companyInfo.tax_number}</p>
              )}
              {companyInfo?.address && (
                <p className="text-muted-foreground text-xs">{companyInfo.address}</p>
              )}
            </div>
          </div>
          
          {/* Fatura Tutarı */}
          <div className="p-3 bg-slate-50 rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              <Percent className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-sm">Fatura Bilgileri</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{percentageName} (%{percentage})</p>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Tutar:</span>
                <span className="font-semibold">{formatMoney(total_amount)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t">KDV Dahil</p>
            </div>
          </div>
          
          {/* Açıklama */}
          <div className="p-3 bg-slate-50 rounded-lg border">
            <p className="font-medium text-sm mb-2">Açıklama:</p>
            <p className="text-sm text-muted-foreground">
              "{formattedWeekLabel}" tarihleri arasında, <strong className="text-foreground">{companyInfo?.name || "Şirket"}</strong>'ın 
              tarafımızca yapmış olduğu <strong className="text-foreground">{paymentMethodsText}</strong> tahsilatlarının bedeli.
            </p>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Kapat
          </Button>
          <Button onClick={handleWhatsAppShare} className="flex-1 bg-green-600 hover:bg-green-700">
            <Share2 className="w-4 h-4 mr-2" />
            WhatsApp ile Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Kesilen Faturalar Tab ====================
function KesilenFaturalarTab({ restaurantId, restaurantName, companyInfo, invoiceSettings, onRefresh }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [faturaOrnegiData, setFaturaOrnegiData] = useState(null);
  const fileInputRef = useRef(null);

  const fetchInvoices = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/issued`);
      setInvoices(res.data);
    } catch (err) {
      console.error("Faturalar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleFileSelect = (invoiceId) => {
    setUploadingId(invoiceId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) return;

    const invoice = invoices.find(i => i.id === uploadingId);
    
    // Otomatik dosya ismi oluştur: restoranismi_haftaaraligi_tutar.pdf
    const weekLabel = (invoice?.week_label || "").replace(/\s/g, '').replace(/\./g, '').replace(/-/g, '_');
    const amount = formatMoneyForFilename(invoice?.total_amount);
    const restName = sanitizeFilename(restaurantName || "Restoran");
    const autoFilename = `${restName}_${weekLabel}_${amount}TL.pdf`;
    
    setUploading(true);
    try {
      const formData = new FormData();
      // Dosyayı yeni isimle ekle
      const renamedFile = new File([file], autoFilename, { type: file.type });
      formData.append("file", renamedFile);
      formData.append("missing_invoice_id", uploadingId);
      formData.append("week_label", invoice?.week_label || "");

      await axios.post(`${API}/restaurant-panel-invoices/${restaurantId}/issued/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      toast.success("Fatura yüklendi");
      fetchInvoices();
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yükleme başarısız");
    } finally {
      setUploading(false);
      setUploadingId(null);
      e.target.value = "";
    }
  };

  const handleView = async (invoiceId) => {
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/issued/download/${invoiceId}`);
      setViewingInvoice(res.data);
    } catch (err) {
      toast.error("Fatura yüklenemedi");
    }
  };

  const handleDeleteClick = (invoice) => {
    setDeleteConfirm(invoice);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    
    setDeletingId(deleteConfirm.invoice_id);
    try {
      await axios.delete(`${API}/restaurant-panel-invoices/${restaurantId}/issued/${deleteConfirm.invoice_id}`);
      toast.success("Fatura silindi");
      fetchInvoices();
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    } finally {
      setDeletingId(null);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf"
        className="hidden"
      />

      {invoices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Fatura kaydı bulunmuyor</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div 
              key={inv.id} 
              className={`p-3 border rounded-lg ${inv.invoice_uploaded ? 'bg-green-50/50 border-green-200' : 'bg-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{inv.week_label || "Haftalık Fatura"}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.order_count} sipariş • {formatMoney(inv.total_amount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {inv.invoice_uploaded ? (
                    <>
                      {inv.invoice_verified ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Onaylandı
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="w-3.5 h-3.5" />
                          Bekliyor
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleView(inv.invoice_id)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {/* 30 dakika içinde silinebilir */}
                      {inv.can_delete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteClick(inv)}
                          disabled={deletingId === inv.invoice_id}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title="Sil (30 dk içinde)"
                        >
                          {deletingId === inv.invoice_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFaturaOrnegiData(inv)}
                        className="h-8 gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Fatura Örneği"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        Örnek
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFileSelect(inv.id)}
                        disabled={uploading}
                        className="h-8 gap-1 text-xs"
                      >
                        {uploading && uploadingId === inv.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        Yükle
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fatura Örneği Modal */}
      <FaturaOrnegiModal
        open={!!faturaOrnegiData}
        onClose={() => setFaturaOrnegiData(null)}
        invoiceData={faturaOrnegiData}
        companyInfo={companyInfo}
        invoiceSettings={invoiceSettings}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Fatura Silme
            </DialogTitle>
            <DialogDescription className="pt-2">
              Bu faturayı silmek istediğinize emin misiniz?
              <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
                <p><strong>Hafta:</strong> {deleteConfirm?.week_label}</p>
                <p><strong>Tutar:</strong> {formatMoney(deleteConfirm?.total_amount)}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              İptal
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm}
              disabled={deletingId}
            >
              {deletingId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      {viewingInvoice && (
        <Dialog open={!!viewingInvoice} onOpenChange={() => setViewingInvoice(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Fatura Önizleme</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto">
              {viewingInvoice.extension === "pdf" ? (
                <iframe
                  src={`data:application/pdf;base64,${viewingInvoice.file_data}`}
                  className="w-full h-[60vh]"
                  title="Fatura"
                />
              ) : (
                <img
                  src={`data:image/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`}
                  alt="Fatura"
                  className="max-w-full max-h-[60vh] mx-auto"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ==================== Alınan Faturalar Tab ====================
function AlinanFaturalarTab({ restaurantId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  const fetchInvoices = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/received`);
      setInvoices(res.data);
    } catch (err) {
      console.error("Faturalar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleView = async (invoiceId) => {
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/received/download/${invoiceId}`);
      setViewingInvoice(res.data);
    } catch (err) {
      toast.error("Fatura yüklenemedi");
    }
  };

  const handleDownload = (invoice) => {
    if (!invoice.file_data) return;
    const link = document.createElement("a");
    link.href = `data:application/${invoice.extension || 'pdf'};base64,${invoice.file_data}`;
    link.download = invoice.filename || "fatura.pdf";
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Alınan fatura bulunmuyor</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="p-3 border rounded-lg bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{inv.week_label || "Haftalık Fatura"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(inv.uploaded_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleView(inv.id)}
                    className="h-8 w-8 p-0"
                    title="Görüntüle"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/received/download/${inv.id}`);
                      handleDownload(res.data);
                    }}
                    className="h-8 w-8 p-0"
                    title="İndir"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {viewingInvoice && (
        <Dialog open={!!viewingInvoice} onOpenChange={() => setViewingInvoice(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Fatura Önizleme</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto">
              {viewingInvoice.extension === "pdf" ? (
                <iframe
                  src={`data:application/pdf;base64,${viewingInvoice.file_data}`}
                  className="w-full h-[60vh]"
                  title="Fatura"
                />
              ) : (
                <img
                  src={`data:image/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`}
                  alt="Fatura"
                  className="max-w-full max-h-[60vh] mx-auto"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ==================== Main Modal ====================
export default function RestaurantFaturalarModal({ open, onOpenChange, restaurantId, restaurantName }) {
  const [activeTab, setActiveTab] = useState("kesilen");
  const [companyInfo, setCompanyInfo] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState(null);
  
  // Şirket bilgilerini ve fatura ayarlarını yükle
  useEffect(() => {
    const fetchData = async () => {
      if (!restaurantId || !open) return;
      
      try {
        // Restoran bilgisini al (company_id için)
        const restaurantRes = await axios.get(`${API}/restaurants/${restaurantId}`);
        const companyId = restaurantRes.data?.company_id;
        
        if (companyId) {
          // Şirket fatura bilgilerini al
          const companyRes = await axios.get(`${API}/companies/${companyId}`);
          setCompanyInfo({
            name: companyRes.data?.name,
            tax_office: companyRes.data?.tax_office,
            tax_number: companyRes.data?.tckn_vkn,
            address: companyRes.data?.address
          });
        }
        
        // Restoran fatura ayarlarını al
        setInvoiceSettings(restaurantRes.data?.invoice_settings || {
          cash: false,
          credit_card: false,
          online: false,
          meal_card: false,
          online_meal_card: false,
          percentage: 10,
          percentage_name: "Yeme-İçme"
        });
      } catch (err) {
        console.error("Bilgiler yüklenemedi:", err);
      }
    };
    
    fetchData();
  }, [restaurantId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Faturalar
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="kesilen" className="flex items-center gap-1.5 text-xs">
              <Upload className="w-3.5 h-3.5" />
              Kesilen Faturalar
            </TabsTrigger>
            <TabsTrigger value="alinan" className="flex items-center gap-1.5 text-xs">
              <Receipt className="w-3.5 h-3.5" />
              Alınan Faturalar
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="kesilen" className="mt-0">
              <KesilenFaturalarTab 
                restaurantId={restaurantId} 
                restaurantName={restaurantName}
                companyInfo={companyInfo}
                invoiceSettings={invoiceSettings}
              />
            </TabsContent>
            <TabsContent value="alinan" className="mt-0">
              <AlinanFaturalarTab restaurantId={restaurantId} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
