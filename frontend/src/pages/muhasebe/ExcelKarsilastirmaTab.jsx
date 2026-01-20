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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ExcelKarsilastirmaTab({ companyId, adminId, adminName }) {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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
    setComparisonResult(null);
    try {
      const res = await axios.get(`${API}/daily-reports/excel-reports/${companyId}/${selectedDate}`);
      setCashReport(res.data.cash);
      setCardReport(res.data.card);
    } catch (err) {
      // Silent fail - no reports uploaded yet
      setCashReport(null);
      setCardReport(null);
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
      setComparisonResult(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Karşılaştırma başarısız");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!comparisonResult) return;
    
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
      setComparisonResult(null);
      fetchExistingReports();
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem oluşturulamadı");
      }
    } finally {
      setProcessing(false);
    }
  };

  const formatMoney = (val) => {
    if (!val && val !== 0) return "₺0";
    return `₺${val.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4" data-testid="excel-karsilastirma-tab">
      {/* Tarih Seçimi */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white border-2 border-border p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <Label className="text-sm font-semibold">Tarih Seçin</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 h-10 border-2 font-mono w-44"
              data-testid="date-picker"
            />
          </div>
        </div>
      </div>

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
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    handleFileUpload(e.target.files[0], 'cash');
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
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    handleFileUpload(e.target.files[0], 'card');
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

          {/* Detaylı Liste */}
          <div className="max-h-96 overflow-y-auto">
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

          {/* İşlemleri Oluştur Butonu */}
          {comparisonResult.summary.couriers_with_issues > 0 && (
            <div className="p-4 border-t border-border bg-slate-50">
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
            </div>
          )}
        </div>
      )}

      {/* Yardım */}
      {!cashReport && !cardReport && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Nasıl Kullanılır?
          </h4>
          <ol className="mt-2 text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>Önce "Günlük Tahsilat" sekmesinden kurye tahsilatlarını girin</li>
            <li>Nakit ve Kredi Kartı Excel raporlarını yükleyin</li>
            <li>"Karşılaştır" butonuna tıklayın</li>
            <li>Farkları inceleyip "İşle" butonuna tıklayın</li>
            <li>Eksikler otomatik olarak kurye muhasebesine eklenecek</li>
          </ol>
        </div>
      )}
    </div>
  );
}
