import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Building2, ChevronLeft, ChevronRight, Upload, FileText, Download, Trash2, MessageCircle, Search, Eye, X, Plus, Check, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import JSZip from "jszip";

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
  const [issuedRecords, setIssuedRecords] = useState([]);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Active card view
  const [activeCard, setActiveCard] = useState("alinan"); // "alinan" or "kesilen"
  
  // Excel upload
  const [uploading, setUploading] = useState(false);
  const excelFileRef = useRef(null);
  
  // Invoice upload
  const [uploadingInvoice, setUploadingInvoice] = useState(null);
  
  // Bulk download
  const [downloadingAll, setDownloadingAll] = useState(false);
  
  // Preview modal
  const [previewData, setPreviewData] = useState(null);
  
  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // Invoices modal
  const [selectedBusinessInvoices, setSelectedBusinessInvoices] = useState(null);
  
  // Marking issued
  const [markingIssued, setMarkingIssued] = useState(null);

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
      const [businessesRes, invoicesRes, issuedRes, companyRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/businesses`),
        axios.get(`${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}`),
        axios.get(`${API}/business-invoices/get-issued/${companyId}/${selectedYear}/${selectedMonth}`),
        axios.get(`${API}/business-invoices/company-details/${companyId}`)
      ]);
      
      setBusinesses(businessesRes.data || []);
      setInvoiceRecords(invoicesRes.data || []);
      setIssuedRecords(issuedRes.data || []);
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
      
      // Update modal if open
      if (selectedBusinessInvoices?.business_id === businessId) {
        const updatedRecords = await axios.get(`${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}`);
        const record = updatedRecords.data.find(r => r.business_id === businessId);
        if (record) {
          setSelectedBusinessInvoices(record);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    } finally {
      setUploadingInvoice(null);
      e.target.value = "";
    }
  };

  // Download all invoices for the month
  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      const res = await axios.get(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/download-all`
      );
      
      const { invoices, count } = res.data;
      
      if (count === 0) {
        toast.warning("İndirilecek fatura bulunamadı");
        return;
      }
      
      // Create ZIP file
      const zip = new JSZip();
      
      invoices.forEach((inv, idx) => {
        const fileName = `${inv.business_name}_${idx + 1}.${inv.extension}`;
        const byteCharacters = atob(inv.file_data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        zip.file(fileName, byteArray);
      });
      
      const content = await zip.generateAsync({ type: "blob" });
      
      const url = window.URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Faturalar_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${count} fatura indirildi`);
    } catch (err) {
      toast.error("Faturalar indirilemedi");
    } finally {
      setDownloadingAll(false);
    }
  };

  // View invoice
  const handleViewInvoice = async (invoice, businessId) => {
    try {
      const res = await axios.get(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${businessId}/download/${invoice.invoice_id}`
      );
      
      const { file_data, extension, filename } = res.data;
      const mimeType = extension === "pdf" ? "application/pdf" : `image/${extension}`;
      const dataUrl = `data:${mimeType};base64,${file_data}`;
      
      setPreviewData({ url: dataUrl, type: mimeType, filename });
    } catch (err) {
      toast.error("Fatura görüntülenemedi");
    }
  };

  // Download invoice
  const handleDownloadInvoice = async (invoice, businessId) => {
    try {
      const res = await axios.get(
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${businessId}/download/${invoice.invoice_id}`
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
        `${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}/${confirmDelete.businessId}/invoice/${confirmDelete.invoiceId}`
      );
      toast.success("Fatura silindi");
      fetchData();
      
      if (selectedBusinessInvoices?.business_id === confirmDelete.businessId) {
        const updatedRecords = await axios.get(`${API}/business-invoices/${companyId}/${selectedYear}/${selectedMonth}`);
        const record = updatedRecords.data.find(r => r.business_id === confirmDelete.businessId);
        if (record) {
          setSelectedBusinessInvoices(record);
        } else {
          setSelectedBusinessInvoices(null);
        }
      }
    } catch (err) {
      toast.error("Fatura silinemedi");
    } finally {
      setConfirmDelete(null);
    }
  };

  // Mark invoice as issued
  const handleMarkIssued = async (businessId) => {
    setMarkingIssued(businessId);
    try {
      const res = await axios.post(
        `${API}/business-invoices/mark-issued/${companyId}/${selectedYear}/${selectedMonth}/${businessId}`
      );
      toast.success(`Fatura kesildi: ${res.data.issued_until_date}`);
      fetchData();
    } catch (err) {
      toast.error("İşaretlenemedi");
    } finally {
      setMarkingIssued(null);
    }
  };

  // WhatsApp message
  const generateWhatsAppMessage = (business, record) => {
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const amount = record?.required_amount || 0;
    
    const startDate = `1 ${monthName}`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${lastDay} ${monthName}`;
    
    const taxBracket = business.tax_bracket ? `%${business.tax_bracket}` : "";
    
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

  // Get invoices list from record
  const getInvoicesList = (record) => {
    if (!record) return [];
    
    if (record.invoices && record.invoices.length > 0) {
      return record.invoices;
    }
    
    if (record.invoice_file) {
      return [{
        invoice_id: "legacy",
        filename: record.invoice_filename || "fatura.pdf",
        extension: record.invoice_extension || "pdf",
        uploaded_at: record.uploaded_at
      }];
    }
    
    return [];
  };

  // Merge businesses with records
  const getMergedData = () => {
    const invoiceMap = {};
    invoiceRecords.forEach(r => {
      invoiceMap[r.business_id] = r;
    });
    
    const issuedMap = {};
    issuedRecords.forEach(r => {
      issuedMap[r.business_id] = r;
    });
    
    return businesses
      .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(b => ({
        ...b,
        invoiceRecord: invoiceMap[b.id] || null,
        issuedRecord: issuedMap[b.id] || null
      }));
  };

  const mergedData = getMergedData();

  // Stats
  const totalBusinesses = businesses.length;
  const businessesWithAmount = invoiceRecords.filter(r => r.required_amount > 0).length;
  const businessesWithInvoice = invoiceRecords.filter(r => r.invoice_uploaded).length;
  const businessesWithIssued = issuedRecords.length;

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="isletme-faturalari-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          İşletme Faturaları
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

      {/* Card Selector */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveCard("alinan")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeCard === "alinan" 
              ? "bg-primary text-white" 
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Alınan Faturalar
        </button>
        <button
          onClick={() => setActiveCard("kesilen")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeCard === "kesilen" 
              ? "bg-primary text-white" 
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Kesilen Faturalar
        </button>
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

      {/* ALINAN FATURALAR CARD */}
      {activeCard === "alinan" && (
        <>
          {/* Stats & Actions */}
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
            
            <div className="flex gap-2">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={downloadingAll || businessesWithInvoice === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadingAll ? "İndiriliyor..." : "Toplu İndir"}
              </Button>
            </div>
          </div>

          {/* Business List - Alınan */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">İşletme</th>
                    <th className="text-right p-3 font-semibold">Fatura Tutarı</th>
                    <th className="text-center p-3 font-semibold">Faturalar</th>
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
                      const invoices = getInvoicesList(record);
                      const invoiceCount = invoices.length;
                      
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
                            {invoiceCount > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBusinessInvoices(record)}
                                className="text-green-600 hover:text-green-700"
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                {invoiceCount} fatura
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Yüklenmemiş</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
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
                              
                              <input
                                type="file"
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
                                  <Plus className="w-4 h-4 text-primary" />
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
        </>
      )}

      {/* KESİLEN FATURALAR CARD */}
      {activeCard === "kesilen" && (
        <>
          {/* Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-lg border">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Toplam İşletme:</span>{" "}
                <span className="font-semibold">{totalBusinesses}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fatura Kesilmiş:</span>{" "}
                <span className="font-semibold text-green-600">{businessesWithIssued}</span>
              </div>
            </div>
          </div>

          {/* Business List - Kesilen */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">İşletme</th>
                    <th className="text-center p-3 font-semibold">Son Fatura Tarihi</th>
                    <th className="text-center p-3 font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mergedData.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        {searchQuery ? "Eşleşen işletme bulunamadı" : "Henüz işletme yok"}
                      </td>
                    </tr>
                  ) : (
                    mergedData.map((item) => {
                      const issuedRecord = item.issuedRecord;
                      const issuedDate = issuedRecord?.issued_until_date;
                      
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-medium">{item.name}</div>
                            {item.phone && (
                              <div className="text-xs text-muted-foreground">{item.phone}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {issuedDate ? (
                              <div className="flex items-center justify-center gap-1">
                                <Calendar className="w-4 h-4 text-green-600" />
                                <span className="font-medium text-green-600">
                                  {new Date(issuedDate).toLocaleDateString("tr-TR")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant={issuedDate ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleMarkIssued(item.id)}
                              disabled={markingIssued === item.id}
                              className={issuedDate ? "border-green-500 text-green-600 hover:bg-green-50" : ""}
                            >
                              {markingIssued === item.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  {issuedDate ? "Güncelle" : "Fatura Kesildi"}
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Invoices List Modal */}
      {selectedBusinessInvoices && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedBusinessInvoices.business_name}</h3>
                <p className="text-sm text-muted-foreground">{MONTH_NAMES[selectedMonth - 1]} {selectedYear} Faturaları</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedBusinessInvoices(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              <div className="mb-4">
                <input
                  type="file"
                  onChange={(e) => handleInvoiceUpload(e, selectedBusinessInvoices.business_id)}
                  accept="*/*"
                  className="hidden"
                  id="modal-invoice-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("modal-invoice-upload")?.click()}
                  disabled={uploadingInvoice === selectedBusinessInvoices.business_id}
                  className="w-full"
                >
                  {uploadingInvoice === selectedBusinessInvoices.business_id ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Yeni Fatura Yükle
                </Button>
              </div>
              
              <div className="space-y-2">
                {getInvoicesList(selectedBusinessInvoices).map((invoice, idx) => (
                  <div key={invoice.invoice_id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invoice.filename}</p>
                        {invoice.uploaded_at && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(invoice.uploaded_at).toLocaleDateString("tr-TR")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewInvoice(invoice, selectedBusinessInvoices.business_id)}
                        title="Görüntüle"
                      >
                        <Eye className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadInvoice(invoice, selectedBusinessInvoices.business_id)}
                        title="İndir"
                      >
                        <Download className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete({ 
                          businessId: selectedBusinessInvoices.business_id, 
                          invoiceId: invoice.invoice_id 
                        })}
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {getInvoicesList(selectedBusinessInvoices).length === 0 && (
                  <p className="text-center text-muted-foreground py-4">Henüz fatura yüklenmemiş</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
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
