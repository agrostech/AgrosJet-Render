import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Building2, ChevronLeft, ChevronRight, Upload, FileText, Download, Trash2, MessageCircle, Search, Eye, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Türkçe ay isimleri
const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export default function IsletmeFaturalariTab({ companyId }) {
  // Varsayılan: önceki ay
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  
  const [businesses, setBusinesses] = useState([]);
  const [invoiceRecords, setInvoiceRecords] = useState([]);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Excel upload
  const [uploading, setUploading] = useState(false);
  const excelFileRef = useRef(null);
  
  // Invoice upload
  const [uploadingInvoice, setUploadingInvoice] = useState(null);
  const invoiceFileRef = useRef(null);
  
  // Preview modal
  const [previewData, setPreviewData] = useState(null);
  
  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Son 12 ay kontrolü
  const isMonthInRange = (year, month) => {
    const targetDate = new Date(year, month - 1, 1);
    const minDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return targetDate >= minDate && targetDate <= now;
  };

  useEffect(() => {
    fetchData();
  }, [companyId, selectedYear, selectedMonth]);

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [businessesRes, invoicesRes, companyRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/businesses`),
        axios.get(`${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}`),
        axios.get(`${API}/business-invoices/company-details/${companyId}`)
      ]);
      
      setBusinesses(businessesRes.data || []);
      setInvoiceRecords(invoicesRes.data || []);
      setCompanyDetails(companyRes.data || null);
    } catch (err) {
      console.error("Data fetch error:", err);
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    let newMonth = selectedMonth - 1;
    let newYear = selectedYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    if (isMonthInRange(newYear, newMonth)) {
      setSelectedMonth(newMonth);
      setSelectedYear(newYear);
    }
  };

  const handleNextMonth = () => {
    let newMonth = selectedMonth + 1;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    if (isMonthInRange(newYear, newMonth)) {
      setSelectedMonth(newMonth);
      setSelectedYear(newYear);
    }
  };

  // Excel import
  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("year", selectedYear);
      formData.append("month", selectedMonth);
      
      const res = await axios.post(
        `${API}/business-invoices/${companyId}/import-excel`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      
      toast.success(res.data.message);
      
      if (res.data.not_found_count > 0) {
        toast.warning(`${res.data.not_found_count} işletme eşleştirilemedi`);
      }
      
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Excel yüklenemedi");
    } finally {
      setUploading(false);
      if (excelFileRef.current) excelFileRef.current.value = "";
    }
  };

  // Invoice upload for a business
  const handleInvoiceUpload = async (e, businessId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingInvoice(businessId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      await axios.post(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${businessId}/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      
      toast.success("Fatura yüklendi");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    } finally {
      setUploadingInvoice(null);
      if (invoiceFileRef.current) invoiceFileRef.current.value = "";
    }
  };

  // View invoice
  const handleViewInvoice = async (record) => {
    try {
      const res = await axios.get(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${record.business_id}/download`
      );
      
      const { file_data, extension } = res.data;
      const mimeType = extension === "pdf" ? "application/pdf" : `image/${extension}`;
      const dataUrl = `data:${mimeType};base64,${file_data}`;
      
      setPreviewData({ url: dataUrl, type: mimeType, filename: record.invoice_filename });
    } catch (err) {
      toast.error("Fatura görüntülenemedi");
    }
  };

  // Download invoice
  const handleDownloadInvoice = async (record) => {
    try {
      const res = await axios.get(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${record.business_id}/download`
      );
      
      const { file_data, filename, extension } = res.data;
      const mimeType = extension === "pdf" ? "application/pdf" : `image/${extension}`;
      
      const byteCharacters = atob(file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Fatura indirilemedi");
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async () => {
    if (!confirmDelete) return;
    
    try {
      await axios.delete(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${confirmDelete.business_id}/invoice`
      );
      toast.success("Fatura silindi");
      fetchData();
    } catch (err) {
      toast.error("Fatura silinemedi");
    } finally {
      setConfirmDelete(null);
    }
  };

  // WhatsApp message
  const generateWhatsAppMessage = (business, record) => {
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const amount = record?.required_amount || 0;
    
    // Ay başı ve sonu
    const startDate = `1 ${monthName}`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${lastDay} ${monthName}`;
    
    // İşletme vergi dilimi
    const taxBracket = business.tax_bracket ? `%${business.tax_bracket}` : "";
    
    // Şirket bilgileri
    const companyName = companyDetails?.name || "";
    const vkn = companyDetails?.tckn_vkn || "";
    const taxOffice = companyDetails?.tax_office || "";
    const address = companyDetails?.address || "";
    const email = companyDetails?.email || "";
    
    const message = `Değerli iş ortağımız;

${monthName} ayı kredi kartı tahsilatları bedeli için tarafımıza kesmeniz gereken fatura bedeli;

${amount.toLocaleString("tr-TR")} TL'dir.

${taxBracket ? `${taxBracket} YEME-İÇME` : "YEME-İÇME"}

Fatura Açıklaması: ${startDate} - ${endDate} tarihleri arasında ${companyName}'ın tarafımız için yapmış olduğu kredi kartı tahsilatları bedeli.

Şirket Fatura Bilgileri:
${companyName}
VKN: ${vkn}
Vergi Dairesi: ${taxOffice}
Adres: ${address}
${email ? `E-posta: ${email}` : ""}`;

    return encodeURIComponent(message.trim());
  };

  const openWhatsApp = (business, record) => {
    const phone = business.phone?.replace(/\D/g, "") || "";
    const formattedPhone = phone.startsWith("90") ? phone : `90${phone}`;
    const message = generateWhatsAppMessage(business, record);
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, "_blank");
  };

  // Merge businesses with invoice records
  const getMergedData = () => {
    const recordMap = {};
    invoiceRecords.forEach(r => {
      recordMap[r.business_id] = r;
    });
    
    return businesses
      .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(b => ({
        ...b,
        invoiceRecord: recordMap[b.id] || null
      }));
  };

  const mergedData = getMergedData();

  // Stats
  const totalBusinesses = businesses.length;
  const businessesWithAmount = invoiceRecords.filter(r => r.required_amount > 0).length;
  const businessesWithInvoice = invoiceRecords.filter(r => r.invoice_uploaded).length;

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="isletme-faturalari-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          İşletme Faturaları (Alınan)
        </h3>
        
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevMonth}
            disabled={!isMonthInRange(selectedMonth === 1 ? selectedYear - 1 : selectedYear, selectedMonth === 1 ? 12 : selectedMonth - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            disabled={!isMonthInRange(selectedMonth === 12 ? selectedYear + 1 : selectedYear, selectedMonth === 12 ? 1 : selectedMonth + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats & Excel Upload */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-lg border">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Toplam:</span>{" "}
            <span className="font-semibold">{totalBusinesses}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Tutar Girilmiş:</span>{" "}
            <span className="font-semibold text-blue-600">{businessesWithAmount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Fatura Yüklü:</span>{" "}
            <span className="font-semibold text-green-600">{businessesWithInvoice}</span>
          </div>
        </div>
        
        <div>
          <input
            type="file"
            ref={excelFileRef}
            onChange={handleExcelUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => excelFileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Yükleniyor..." : "Excel Yükle"}
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <p className="font-medium">Nasıl Kullanılır?</p>
          <p className="mt-1">
            1. "Restoran Raporu.xlsx" dosyasını yükleyin → Fatura tutarları otomatik aktarılır.<br/>
            2. Tutarı olan işletmeler için WhatsApp butonu görünür.<br/>
            3. İşletme faturayı gönderdikten sonra PDF/resim olarak yükleyin.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="İşletme ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Business List */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold">İşletme</th>
                <th className="text-right p-3 font-semibold">Fatura Tutarı</th>
                <th className="text-center p-3 font-semibold">Fatura</th>
                <th className="text-center p-3 font-semibold">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mergedData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    {searchQuery ? "Eşleşen işletme bulunamadı" : "Henüz işletme yok"}
                  </td>
                </tr>
              ) : (
                mergedData.map((item) => {
                  const record = item.invoiceRecord;
                  const hasAmount = record?.required_amount > 0;
                  const hasInvoice = record?.invoice_uploaded;
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium">{item.name}</div>
                        {item.phone && (
                          <div className="text-xs text-muted-foreground">{item.phone}</div>
                        )}
                        {item.tax_bracket && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            %{item.tax_bracket}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {hasAmount ? (
                          <span className="font-semibold text-green-600">
                            {record.required_amount.toLocaleString("tr-TR")} ₺
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {hasInvoice ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewInvoice(record)}
                              title="Görüntüle"
                            >
                              <Eye className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadInvoice(record)}
                              title="İndir"
                            >
                              <Download className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(record)}
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Yüklenmemiş</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* WhatsApp - only if has amount */}
                          {hasAmount && item.phone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openWhatsApp(item, record)}
                              title="WhatsApp Hatırlatma"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                          
                          {/* Upload Invoice */}
                          <input
                            type="file"
                            ref={uploadingInvoice === item.id ? invoiceFileRef : null}
                            onChange={(e) => handleInvoiceUpload(e, item.id)}
                            accept="*/*"
                            className="hidden"
                            id={`invoice-upload-${item.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => document.getElementById(`invoice-upload-${item.id}`)?.click()}
                            disabled={uploadingInvoice === item.id}
                            title="Fatura Yükle"
                          >
                            {uploadingInvoice === item.id ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <FileText className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="font-medium text-sm">{previewData.filename}</span>
              <Button variant="ghost" size="sm" onClick={() => setPreviewData(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-60px)]">
              {previewData.type === "application/pdf" ? (
                <iframe
                  src={previewData.url}
                  className="w-full h-[70vh]"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewData.url}
                  alt="Invoice Preview"
                  className="max-w-full h-auto mx-auto"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Fatura Silme"
        description="Bu faturayı silmek istediğinize emin misiniz?"
        onConfirm={handleDeleteInvoice}
        variant="danger"
      />
    </div>
  );
}
