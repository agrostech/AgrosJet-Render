import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Gift, 
  Plus, 
  Trash2, 
  Package, 
  Upload, 
  FileSpreadsheet,
  Users,
  AlertTriangle,
  Check,
  Clock
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

const getLocalDateTimeString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

export default function TopluHakedisTab({ companyId, adminId, adminName }) {
  // Bonus Rules State
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState({ min_packets: "", amount: "" });
  const [adding, setAdding] = useState(false);

  // Bulk Hakediş State
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [txDate, setTxDate] = useState(getLocalDateTimeString());
  const fileInputRef = useRef(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/bonus/settings/${companyId}`);
      setRules(res.data);
    } catch (err) {
      toast.error("Bonus kuralları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchRules();
  }, [companyId, fetchRules]);

  // Bonus Rules Functions
  const handleAddRule = async (e) => {
    e.preventDefault();
    const minPackets = parseInt(newRule.min_packets);
    const amount = parseFloat(newRule.amount);

    if (!minPackets || minPackets <= 0) {
      toast.error("Geçerli bir paket sayısı girin");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }

    setAdding(true);
    try {
      await axios.post(`${API}/bonus/settings/${companyId}`, {
        min_packets: minPackets,
        amount: amount
      });
      toast.success("Bonus kuralı eklendi");
      setNewRule({ min_packets: "", amount: "" });
      fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kural eklenemedi");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm("Bu kuralı silmek istediğinize emin misiniz?")) return;

    try {
      await axios.delete(`${API}/bonus/settings/${ruleId}`);
      toast.success("Kural silindi");
      fetchRules();
    } catch (err) {
      toast.error("Kural silinemedi");
    }
  };

  // Bulk Hakediş Functions
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Sadece Excel dosyası (.xlsx, .xls) yüklenebilir");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`${API}/bulk-hakedis/parse-excel/${companyId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setParseResult(res.data);
      setShowModal(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Excel dosyası işlenemedi");
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleApplyBulkHakedis = async () => {
    if (!parseResult?.matched?.length) {
      toast.error("Eşleşen kurye bulunamadı");
      return;
    }

    setApplying(true);
    try {
      const items = parseResult.matched.map(m => ({
        courier_id: m.courier_id,
        courier_name: m.courier_name,
        hakedis_amount: m.hakedis_amount,
        packet_count: m.packet_count,
        bonus_amount: m.bonus_amount
      }));

      const res = await axios.post(`${API}/bulk-hakedis/apply/${companyId}`, {
        items,
        admin_id: adminId,
        admin_name: adminName,
        custom_date: useCustomDate ? new Date(txDate).toISOString() : null
      });

      toast.success(res.data.message);
      setShowModal(false);
      setParseResult(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Hakedişler eklenemedi");
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <PageLoading />;

  const totalHakedis = parseResult?.matched?.reduce((sum, m) => sum + m.hakedis_amount, 0) || 0;
  const totalBonus = parseResult?.matched?.reduce((sum, m) => sum + m.bonus_amount, 0) || 0;
  const grandTotal = totalHakedis + totalBonus;

  return (
    <div className="space-y-6" data-testid="toplu-hakedis-tab">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* Toplu Hakediş Kartı */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-heading font-bold">Toplu Hakediş Ekle</h3>
                <p className="text-sm text-muted-foreground">Excel dosyası yükleyerek toplu hakediş ekleyin</p>
              </div>
            </div>
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="upload-excel-btn"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Yükleniyor..." : "Excel Yükle"}
            </Button>
          </div>
        </div>
        <div className="p-4 text-sm text-muted-foreground">
          <p><strong>Excel formatı:</strong> <code className="bg-slate-100 px-1 rounded">Kurye</code> (isim), <code className="bg-slate-100 px-1 rounded">Total</code> (hakediş tutarı) sütunları olmalı</p>
          <p className="mt-1">Kurye isimleri sistemdeki isimlerle eşleştirilecek ve bonus otomatik hesaplanacak.</p>
        </div>
      </div>

      {/* Haftalık Bonus Ayarları Kartı */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100">
              <Gift className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-heading font-bold">Haftalık Bonus Ayarları</h3>
              <p className="text-sm text-muted-foreground">Paket sayısına göre bonus kuralları</p>
            </div>
          </div>
        </div>

        {/* Kural Ekleme Formu */}
        <form onSubmit={handleAddRule} className="p-4 border-b border-border bg-slate-50/50">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs font-semibold mb-1 block">Min. Paket Sayısı</Label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={newRule.min_packets}
                  onChange={(e) => setNewRule({ ...newRule, min_packets: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  placeholder="100"
                  className="pl-10 h-10 border-2"
                  data-testid="bonus-min-packets"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs font-semibold mb-1 block">Bonus Tutarı (TL)</Label>
              <Input
                type="number"
                step="0.01"
                value={newRule.amount}
                onChange={(e) => setNewRule({ ...newRule, amount: e.target.value })}
                onWheel={(e) => e.target.blur()}
                placeholder="500"
                className="h-10 border-2 font-mono"
                data-testid="bonus-amount"
              />
            </div>
            <Button type="submit" disabled={adding} className="h-10" data-testid="add-bonus-rule">
              <Plus className="w-4 h-4 mr-1" />
              {adding ? "..." : "Ekle"}
            </Button>
          </div>
        </form>

        {/* Kurallar Listesi */}
        <div className="divide-y divide-border">
          {rules.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Henüz bonus kuralı eklenmemiş</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Package className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">
                      <span className="text-amber-600">{rule.min_packets}+</span> paket
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-green-600 font-mono">{formatMoney(rule.amount)}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toplu Hakediş Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" aria-describedby="bulk-hakedis-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Toplu Hakediş Önizleme
            </DialogTitle>
            <p id="bulk-hakedis-description" className="sr-only">
              Excel dosyasından okunan kurye hakedişlerini gözden geçirin ve onaylayın
            </p>
          </DialogHeader>

          {parseResult && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Özet */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-xs text-green-700">Eşleşen</p>
                  <p className="text-xl font-bold text-green-600">{parseResult.total_matched}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                  <p className="text-xs text-amber-700">Eşleşmeyen</p>
                  <p className="text-xl font-bold text-amber-600">{parseResult.total_unmatched}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                  <p className="text-xs text-blue-700">Toplam Tutar</p>
                  <p className="text-lg font-bold text-blue-600">{formatMoney(grandTotal)}</p>
                </div>
              </div>

              {/* Tarih Seçimi */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                <Checkbox
                  id="custom-date-bulk"
                  checked={useCustomDate}
                  onCheckedChange={(checked) => {
                    setUseCustomDate(checked);
                    if (checked) setTxDate(getLocalDateTimeString());
                  }}
                />
                <Label htmlFor="custom-date-bulk" className="text-sm cursor-pointer flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Özel tarih kullan
                </Label>
                {useCustomDate && (
                  <Input
                    type="datetime-local"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="h-9 w-auto border"
                  />
                )}
              </div>

              {/* Eşleşen Kuryeler */}
              {parseResult.matched.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-2 bg-green-50 border-b flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="font-semibold text-sm text-green-700">Eşleşen Kuryeler ({parseResult.matched.length})</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-semibold">Kurye</th>
                          <th className="text-right p-2 font-semibold">Paket</th>
                          <th className="text-right p-2 font-semibold">Hakediş</th>
                          <th className="text-right p-2 font-semibold">Bonus</th>
                          <th className="text-right p-2 font-semibold">Toplam</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {parseResult.matched.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">{m.courier_name}</td>
                            <td className="p-2 text-right font-mono">{m.packet_count}</td>
                            <td className="p-2 text-right font-mono">{formatMoney(m.hakedis_amount)}</td>
                            <td className="p-2 text-right font-mono text-amber-600">{m.bonus_amount > 0 ? formatMoney(m.bonus_amount) : '-'}</td>
                            <td className="p-2 text-right font-mono font-semibold text-green-600">{formatMoney(m.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-100 font-semibold">
                        <tr>
                          <td className="p-2">Toplam</td>
                          <td className="p-2 text-right font-mono">{parseResult.matched.reduce((s, m) => s + m.packet_count, 0)}</td>
                          <td className="p-2 text-right font-mono">{formatMoney(totalHakedis)}</td>
                          <td className="p-2 text-right font-mono text-amber-600">{formatMoney(totalBonus)}</td>
                          <td className="p-2 text-right font-mono text-green-600">{formatMoney(grandTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Eşleşmeyen Kuryeler */}
              {parseResult.unmatched.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="p-2 bg-amber-50 border-b flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-sm text-amber-700">Eşleşmeyen Kuryeler ({parseResult.unmatched.length})</span>
                  </div>
                  <div className="max-h-[150px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-semibold">Excel'deki İsim</th>
                          <th className="text-right p-2 font-semibold">Paket</th>
                          <th className="text-right p-2 font-semibold">Hakediş</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {parseResult.unmatched.map((u, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/30">
                            <td className="p-2 text-amber-700">{u.excel_name}</td>
                            <td className="p-2 text-right font-mono">{u.packet_count}</td>
                            <td className="p-2 text-right font-mono">{formatMoney(u.hakedis_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 bg-amber-50 text-xs text-amber-700">
                    Bu kuryeler sistemde bulunamadı. Lütfen isimleri kontrol edin.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              İptal
            </Button>
            <Button 
              onClick={handleApplyBulkHakedis}
              disabled={applying || !parseResult?.matched?.length}
              className="bg-green-600 hover:bg-green-700"
              data-testid="apply-bulk-hakedis"
            >
              <Users className="w-4 h-4 mr-2" />
              {applying ? "Ekleniyor..." : `${parseResult?.matched?.length || 0} Kuryeye Hakediş Ekle`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
