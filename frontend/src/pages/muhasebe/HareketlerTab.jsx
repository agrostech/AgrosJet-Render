import { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { History, User, Building2, Wallet, Plus, Minus, Search } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function HareketlerTab({ companyId }) {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  // Filtrelenmiş loglar
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const query = searchQuery.toLowerCase().trim();
    return logs.filter(log => 
      log.admin_name?.toLowerCase().includes(query) ||
      log.entity_name?.toLowerCase().includes(query) ||
      log.details?.description?.toLowerCase().includes(query)
    );
  }, [logs, searchQuery]);

  const fetchLogs = async (append = false) => {
    try {
      const skip = append ? logs.length : 0;
      const res = await axios.get(`${API}/activity-logs/${companyId}?skip=${skip}&limit=10`);
      if (append) {
        setLogs(prev => [...prev, ...res.data.logs]);
      } else {
        setLogs(res.data.logs);
      }
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      toast.error("Hareketler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchLogs(true);
    setLoadingMore(false);
  };

  useEffect(() => {
    if (companyId) fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const formatCurrency = (amt) => {
    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Math.abs(amt));
    return `${formatted} TL`;
  };

  const getEntityIcon = (type) => {
    switch (type) {
      case 'courier': return <User className="w-4 h-4" />;
      case 'business': return <Building2 className="w-4 h-4" />;
      case 'vendor': return <Wallet className="w-4 h-4" />;
      default: return <History className="w-4 h-4" />;
    }
  };

  const getEntityTypeLabel = (type) => {
    switch (type) {
      case 'courier': return 'Kurye';
      case 'business': return 'İşletme';
      case 'vendor': return 'Cari';
      default: return type;
    }
  };

  const getActionLabel = (action, details) => {
    if (action === 'transaction_created') {
      const type = details?.type === 'payment_in' ? 'Verilen' : 'Alınan';
      return (
        <span className="inline-flex items-center gap-1">
          <Plus className="w-3 h-3 text-green-600" />
          <span className="text-green-700 font-medium">İşlem Eklendi</span>
          <span className="text-muted-foreground">({type})</span>
        </span>
      );
    }
    if (action === 'transaction_deleted') {
      const type = details?.type === 'payment_in' ? 'Verilen' : 'Alınan';
      return (
        <span className="inline-flex items-center gap-1">
          <Minus className="w-3 h-3 text-red-600" />
          <span className="text-red-700 font-medium">İşlem Silindi</span>
          <span className="text-muted-foreground">({type})</span>
        </span>
      );
    }
    if (action === 'installment_paid') {
      return (
        <span className="inline-flex items-center gap-1">
          <Minus className="w-3 h-3 text-purple-600" />
          <span className="text-purple-700 font-medium">Taksit Ödendi</span>
        </span>
      );
    }
    if (action === 'transaction_updated') {
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-orange-700 font-medium">İşlem Güncellendi</span>
        </span>
      );
    }
    return action;
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="border-2 border-border bg-white h-[calc(100vh-220px)] min-h-[500px] flex flex-col">
      <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3 shrink-0">
        <History className="w-4 h-4 text-slate-600" />
        <h3 className="font-semibold text-sm">İşlem Hareketleri</h3>
        <div className="flex-1 max-w-xs ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Admin, isim veya açıklama ara..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {logs.length} / {totalCount} kayıt
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">
            {searchQuery ? "Arama sonucu bulunamadı" : "Henüz hareket kaydı yok"}
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-semibold">Tarih</th>
                  <th className="text-left p-3 font-semibold">Admin</th>
                  <th className="text-left p-3 font-semibold">İşlem</th>
                  <th className="text-left p-3 font-semibold">Kim</th>
                  <th className="text-left p-3 font-semibold">Açıklama</th>
                  <th className="text-right p-3 font-semibold">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-slate-700">{log.admin_name}</span>
                    </td>
                    <td className="p-3">
                      {getActionLabel(log.action, log.details)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          log.entity_type === 'courier' ? 'bg-slate-200 text-slate-600' :
                          log.entity_type === 'business' ? 'bg-blue-100 text-blue-600' :
                          'bg-purple-100 text-purple-600'
                        }`}>
                          {getEntityIcon(log.entity_type)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{log.entity_name}</p>
                          <p className="text-[10px] text-muted-foreground">{getEntityTypeLabel(log.entity_type)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {log.action === 'installment_paid' && log.details?.product_name ? (
                        <span>
                          <span className="font-medium text-purple-700">{log.details.product_name}</span>
                          <span className="text-xs ml-1">
                            ({log.details.installment_number}/{log.details.total_installments}. taksit)
                          </span>
                        </span>
                      ) : (
                        <>
                          {log.details?.description || '-'}
                          {log.details?.is_hakedis && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Hakediş</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      log.details?.type === 'payment_in' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {log.details?.type === 'payment_out' && '-'}{formatCurrency(log.details?.amount || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && !searchQuery && (
              <div className="text-center py-3 border-t border-slate-100">
                <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore} className="h-8 text-xs">
                  {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalCount - logs.length} kaldı)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
