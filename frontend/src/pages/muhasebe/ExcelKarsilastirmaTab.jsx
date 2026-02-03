import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/ui/loading-spinner";
import { 
  Calendar, 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle,
  Check,
  X,
  Trash2,
  Play,
  Banknote,
  CreditCard,
  AlertCircle
} from "lucide-react";
import WeeklySummaryBar from "@/components/muhasebe/WeeklySummaryBar";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Dünün tarihini al
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

export default function ExcelKarsilastirmaTab({ companyId, adminId, adminName }) {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [cashReport, setCashReport] = useState(null);
  const [cardReport, setCardReport] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  
  const cashInputRef = useRef(null);
  const cardInputRef = useRef(null);

  useEffect(() => {
    fetchExistingReports();
  }, [companyId, selectedDate]);

  const fetchExistingReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/daily-reports/excel-reports/${companyId}/${selectedDate}`);
      setCashReport(res.data.cash);
      setCardReport(res.data.card);
      // Load saved comparison result
      if (res.data.comparison) {
        setComparisonResult({
          date: res.data.comparison.date,
          results: res.data.comparison.results,
          summary: res.data.comparison.summary,
          processed: res.data.comparison.processed,
          processed_by: res.data.comparison.processed_by
        });
      } else {
        setComparisonResult(null);
      }
    } catch (err) {
      setCashReport(null);
      setCardReport(null);
      setComparisonResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file, reportType) => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("date", selectedDate);
    formData.append("report_type", reportType);
    
    try {
      const res = await axios.post(
        `${API}/daily-reports/upload-excel/${companyId}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      
      toast.success(`${reportType === 'cash' ? 'Nakit' : 'Kredi Kartı'} raporu yüklendi (${res.data.courier_count} kurye)`);
      fetchExistingReports();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Dosya yüklenemedi");
      }
    }
  };

  const handleDeleteReport = async (reportType) => {
    try {
      await axios.delete(`${API}/daily-reports/excel-reports/${companyId}/${selectedDate}/${reportType}`);
      toast.success("Rapor silindi");
      fetchExistingReports();
    } catch (err) {
      if (!err.handled) {
        toast.error("Silme başarısız");
      }
    }
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/daily-reports/compare/${companyId}/${selectedDate}`);
      setComparisonResult({
        ...res.data,
        processed: false,
        processed_by: null
      });
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Karşılaştırma başarısız");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!comparisonResult || comparisonResult.processed) return;
    
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("admin_id", adminId);
      formData.append("admin_name", adminName);
      
      const res = await axios.post(
        `${API}/daily-reports/process/${companyId}/${selectedDate}`,
        formData
      );
      
      toast.success(`${res.data.transactions_created} işlem oluşturuldu`);
      // Update comparison result to show processed state
      setComparisonResult(prev => ({
        ...prev,
        processed: true,
        processed_by: res.data.processed_by || adminName
      }));
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem oluşturulamadı");
      }
    } finally {
      setProcessing(false);
    }
  };

  const formatMoney = (val) => {
    if (!val && val !== 0) return "0 TL";
    return `${val.toLocaleString('tr-TR', { minimumFractionDigits: 0 })} TL`;
  };

  return (
    <div className="space-y-4" data-testid="excel-karsilastirma-tab">
      {/* Haftalık Özet */}
      <WeeklySummaryBar
        companyId={companyId}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        type="mutabakat"
      />

      {/* Excel Yükleme Alanları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nakit Excel */}
        <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b-2 border-border bg-green-50">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2 text-green-700">
              <Banknote className="w-4 h-4" />
              Nakit Raporu
            </h3>
          </div>
          <div className="p-4">
            {cashReport ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold">{cashReport.filename}</p>
                      <p className="text-xs text-muted-foreground">{cashReport.data.length} kurye</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteReport('cash')}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                    data-testid="delete-cash-report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {cashReport.processed && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <Check className="w-4 h-4" />
                    İşlendi - {cashReport.processed_by}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  ref={cashInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const ext = file.name.split('.').pop().toLowerCase();
                      if (ext !== 'xlsx' && ext !== 'xls') {
                        toast.error('Lütfen Excel dosyası (.xlsx veya .xls) seçin');
                        e.target.value = '';
                        return;
                      }
                      handleFileUpload(file, 'cash');
                    }
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => cashInputRef.current?.click()}
                  className="w-full h-20 border-2 border-dashed hover:bg-green-50 hover:border-green-300"
                  data-testid="upload-cash-btn"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-green-600" />
                    <span className="text-sm">Nakit Excel Yükle</span>
                  </div>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Kredi Kartı Excel */}
        <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b-2 border-border bg-blue-50">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2 text-blue-700">
              <CreditCard className="w-4 h-4" />
              Kredi Kartı Raporu
            </h3>
          </div>
          <div className="p-4">
            {cardReport ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-semibold">{cardReport.filename}</p>
                      <p className="text-xs text-muted-foreground">{cardReport.data.length} kurye</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteReport('card')}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                    data-testid="delete-card-report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {cardReport.processed && (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <Check className="w-4 h-4" />
                    İşlendi - {cardReport.processed_by}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  ref={cardInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const ext = file.name.split('.').pop().toLowerCase();
                      if (ext !== 'xlsx' && ext !== 'xls') {
                        toast.error('Lütfen Excel dosyası (.xlsx veya .xls) seçin');
                        e.target.value = '';
                        return;
                      }
                      handleFileUpload(file, 'card');
                    }
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => cardInputRef.current?.click()}
                  className="w-full h-20 border-2 border-dashed hover:bg-blue-50 hover:border-blue-300"
                  data-testid="upload-card-btn"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-blue-600" />
                    <span className="text-sm">Kredi Kartı Excel Yükle</span>
                  </div>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Karşılaştır Butonu */}
      {(cashReport || cardReport) && (
        <div className="flex justify-center">
          <Button
            onClick={handleCompare}
            disabled={loading}
            className="h-12 px-8 bg-primary hover:bg-primary/90"
            data-testid="compare-btn"
          >
            <Play className="w-5 h-5 mr-2" />
            {loading ? "Karşılaştırılıyor..." : "Karşılaştır"}
          </Button>
        </div>
      )}

      {/* Karşılaştırma Sonuçları */}
      {comparisonResult && (
        <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b-2 border-border bg-slate-50 flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Karşılaştırma Sonucu
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span>Toplam: {comparisonResult.summary.total_couriers} kurye</span>
              <span className="text-red-600 font-semibold">
                Sorunlu: {comparisonResult.summary.couriers_with_issues}
              </span>
            </div>
          </div>

          {/* Özet */}
          <div className="p-4 border-b border-border bg-slate-50/50">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Nakit Farkı</p>
                <p className={`text-lg font-bold font-mono ${comparisonResult.summary.total_cash_difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatMoney(comparisonResult.summary.total_cash_difference)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Kart Farkı</p>
                <p className={`text-lg font-bold font-mono ${comparisonResult.summary.total_card_difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatMoney(comparisonResult.summary.total_card_difference)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Vergi Cezası</p>
                <p className={`text-lg font-bold font-mono ${comparisonResult.summary.total_penalty > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatMoney(comparisonResult.summary.total_penalty)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Genel Toplam</p>
                <p className="text-lg font-bold font-mono text-primary">
                  {formatMoney(
                    comparisonResult.summary.total_cash_difference + 
                    comparisonResult.summary.total_card_difference + 
                    comparisonResult.summary.total_penalty
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Detaylı Liste - Mobile Cards */}
          <div className="md:hidden p-3 space-y-3 max-h-96 overflow-y-auto">
            {comparisonResult.results.map((result, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg border ${result.has_issues ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {result.has_issues ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                  <span className="font-semibold">{result.courier_name}</span>
                </div>
                
                {result.tax_bracket_issues.length > 0 && (
                  <div className="mb-2">
                    {result.tax_bracket_issues.map((issue, i) => (
                      <p key={i} className="text-xs text-orange-600">
                        ⚠️ {issue.restaurant}: %{issue.expected_bracket} → %{issue.actual_bracket}
                      </p>
                    ))}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-white/50 rounded">
                    <span className="text-muted-foreground">Excel Nakit:</span>
                    <span className="font-mono ml-1">{formatMoney(result.excel_cash)}</span>
                  </div>
                  <div className="p-2 bg-white/50 rounded">
                    <span className="text-muted-foreground">Girilen:</span>
                    <span className="font-mono ml-1">{formatMoney(result.entered_cash)}</span>
                  </div>
                  <div className="p-2 bg-white/50 rounded">
                    <span className="text-muted-foreground">Excel Kart:</span>
                    <span className="font-mono ml-1">{formatMoney(result.excel_card)}</span>
                  </div>
                  <div className="p-2 bg-white/50 rounded">
                    <span className="text-muted-foreground">Girilen:</span>
                    <span className="font-mono ml-1">{formatMoney(result.entered_card_total)}</span>
                  </div>
                </div>
                
                {(result.cash_difference !== 0 || result.card_difference !== 0 || result.total_penalty > 0) && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-2 text-xs">
                    {result.cash_difference !== 0 && (
                      <span className={`font-mono font-semibold ${result.cash_difference > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        Nakit: {formatMoney(result.cash_difference)}
                      </span>
                    )}
                    {result.card_difference !== 0 && (
                      <span className={`font-mono font-semibold ${result.card_difference > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        Kart: {formatMoney(result.card_difference)}
                      </span>
                    )}
                    {result.total_penalty > 0 && (
                      <span className="font-mono font-semibold text-orange-600">
                        Ceza: {formatMoney(result.total_penalty)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Detaylı Liste - Desktop Table */}
          <div className="hidden md:block max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-semibold">Kurye</th>
                  <th className="text-right p-3 font-semibold">Excel Nakit</th>
                  <th className="text-right p-3 font-semibold">Girilen Nakit</th>
                  <th className="text-right p-3 font-semibold">Nakit Fark</th>
                  <th className="text-right p-3 font-semibold">Excel Kart</th>
                  <th className="text-right p-3 font-semibold">Girilen Kart</th>
                  <th className="text-right p-3 font-semibold">Kart Fark</th>
                  <th className="text-right p-3 font-semibold">Ceza</th>
                </tr>
              </thead>
              <tbody>
                {comparisonResult.results.map((result, idx) => (
                  <tr 
                    key={idx} 
                    className={`border-b border-border ${result.has_issues ? 'bg-red-50/50' : ''}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {result.has_issues ? (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        ) : (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                        <span className="font-semibold">{result.courier_name}</span>
                      </div>
                      {result.tax_bracket_issues.length > 0 && (
                        <div className="mt-1">
                          {result.tax_bracket_issues.map((issue, i) => (
                            <p key={i} className="text-xs text-orange-600">
                              ⚠️ {issue.restaurant}: %{issue.expected_bracket} → %{issue.actual_bracket}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono">{formatMoney(result.excel_cash)}</td>
                    <td className="p-3 text-right font-mono">{formatMoney(result.entered_cash)}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${result.cash_difference > 0 ? 'text-red-600' : result.cash_difference < 0 ? 'text-blue-600' : ''}`}>
                      {result.cash_difference !== 0 ? formatMoney(result.cash_difference) : '-'}
                    </td>
                    <td className="p-3 text-right font-mono">{formatMoney(result.excel_card)}</td>
                    <td className="p-3 text-right font-mono">{formatMoney(result.entered_card_total)}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${result.card_difference > 0 ? 'text-red-600' : result.card_difference < 0 ? 'text-blue-600' : ''}`}>
                      {result.card_difference !== 0 ? formatMoney(result.card_difference) : '-'}
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${result.total_penalty > 0 ? 'text-orange-600' : ''}`}>
                      {result.total_penalty > 0 ? formatMoney(result.total_penalty) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* İşlemleri Oluştur Butonu veya İşlendi Bilgisi */}
          <div className="p-4 border-t border-border bg-slate-50">
            {comparisonResult.processed ? (
              <div className="flex items-center justify-center gap-2 py-3 bg-green-100 rounded-lg border border-green-200">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-green-700 font-semibold">
                  {comparisonResult.processed_by} Tarafından İşlendi
                </span>
              </div>
            ) : comparisonResult.summary.couriers_with_issues > 0 ? (
              <>
                <Button
                  onClick={handleProcess}
                  disabled={processing}
                  className="w-full h-12 bg-green-600 hover:bg-green-700"
                  data-testid="process-btn"
                >
                  <Check className="w-5 h-5 mr-2" />
                  {processing ? "İşleniyor..." : "Farkları İşle ve Muhasebe Kayıtlarını Oluştur"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Eksik nakit ve kart tutarları, vergi dilimi cezaları kuryeye yeşil (verilen) işlem olarak eklenecek.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 py-3 bg-green-100 rounded-lg border border-green-200">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-green-700 font-semibold">
                  Tüm kayıtlar tutarlı, işlem yapılacak fark yok
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
