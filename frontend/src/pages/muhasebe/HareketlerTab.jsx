import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { History, User, Building2, Wallet, Plus, Minus } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function HareketlerTab({ companyId }) {
  const [logs, setLogs] = useState([]);
  const [displayCount, setDisplayCount] = useState(20);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      setDisplayCount(prev => Math.min(prev + 20, logs.length));
    }
  }, [logs.length]);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API}/activity-logs/${companyId}`);
      setLogs(res.data);
    } catch (err) {
      toast.error("Hareketler yüklenemedi");
    } finally {
      setLoading(false);
    }
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

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));

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
    return action;
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-600" />
        <h3 className="font-semibold text-sm">İşlem Hareketleri</h3>
        <span className="text-xs text-muted-foreground ml-auto">{logs.length} kayıt</span>
      </div>

      <div ref={listRef} onScroll={handleScroll} className="max-h-[500px] overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Henüz hareket kaydı yok</p>
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
                {logs.slice(0, displayCount).map((log) => (
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
                      {log.details?.description || '-'}
                      {log.details?.is_hakedis && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Hakediş</span>
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
            {displayCount < logs.length && (
              <p className="text-xs text-muted-foreground text-center py-2">Daha fazla görmek için kaydırın...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
