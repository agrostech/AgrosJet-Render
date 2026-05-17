/**
 * Yaklaşan Kurye Faturaları Önizleme Kartı
 *
 * Bir sonraki Pazartesi açılışında otomatik oluşturulacak `courier_invoice_obligations`
 * kayıtlarının önizlemesi. Restoran "Yaklaşan Faturalar" kartıyla aynı UX.
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Clock, Check, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

export default function UpcomingObligationsCard({ companyId }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/upcoming-preview/${companyId}`);
      setPreview(res.data);
    } catch (e) {
      // Yetki yoksa veya endpoint 4xx ise sessizce gizle
      setPreview(null);
      if (e.response?.status !== 403) {
        toast.error("Yaklaşan faturalar yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const pendingPreviews = (preview?.previews || []).filter((p) => !p.already_created);

  return (
    <div className="border-2 border-border bg-white" data-testid="upcoming-obligations-card">
      <div className="p-3 border-b-2 border-border bg-blue-50">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <h3 className="font-semibold text-sm text-blue-700">Yaklaşan Kurye Faturaları (Önizleme)</h3>
            {preview && (
              <span className="text-xs text-blue-500 truncate">
                {preview.week_label} • {preview.courier_count} kurye
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {preview && (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                  preview.auto_enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
                title={preview.auto_enabled ? "Otomatik üretim aktif" : "Otomatik üretim kapalı"}
              >
                {preview.auto_enabled ? "Otomatik AÇIK" : "Otomatik KAPALI"}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchPreview}
              disabled={loading}
              className="h-8 w-8 p-0"
              title="Yenile"
              data-testid="upcoming-obligations-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-blue-600 mt-1">
          Pazartesi şirket açılış saatinde otomatik oluşturulacak fatura yükümlülükleri.
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : !preview || preview.previews.length === 0 ? (
          <div className="p-8 text-center text-green-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Bu hafta için oluşturulacak fatura yok
          </div>
        ) : (
          <div className="divide-y divide-border">
            {preview.previews.map((item) => (
              <div
                key={item.courier_id}
                className={`p-3 hover:bg-blue-50/50 ${item.already_created ? "bg-slate-50/60" : ""}`}
                data-testid={`upcoming-obligation-${item.courier_id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{item.courier_name}</p>
                      {item.already_created && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Oluşturuldu
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.tx_count} işlem
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold font-mono flex-shrink-0 ${
                      item.already_created ? "text-slate-400 line-through" : "text-blue-600"
                    }`}
                  >
                    {formatMoney(item.expected_amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && pendingPreviews.length > 0 && (
        <div className="p-3 border-t border-border bg-blue-50/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700 font-medium">
              Toplam ({pendingPreviews.length} kurye):
            </span>
            <span className="font-bold text-blue-600">{formatMoney(preview.total_amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
