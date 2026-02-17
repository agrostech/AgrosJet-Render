import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  Wallet
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(Math.abs(amount)) + ' TL';
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

// İşlem tipleri - Restoran perspektifinden
// Yönetici panelinde kırmızı olan (restoran borcu) -> Restoran için yeşil (alacak)
// Yönetici panelinde yeşil olan (restorana ödeme) -> Restoran için kırmızı (borç)
const TRANSACTION_TYPES = {
  // payment_out, given -> Yönetici panelinde KIRMIZI (kuryeye/restorana ödeme yapıldı)
  // Restoran perspektifinden: Restorana ödeme yapıldı = YEŞİL (aldık)
  payment_out: { 
    label: "Ödeme Alındı", 
    color: "text-green-600", 
    bg: "bg-green-50",
    icon: TrendingUp,
    sign: "+"
  },
  given: { 
    label: "Alınan", 
    color: "text-green-600", 
    bg: "bg-green-50",
    icon: TrendingUp,
    sign: "+"
  },
  // payment_in, received -> Yönetici panelinde YEŞİL (kuryeden/restorandan tahsilat)
  // Restoran perspektifinden: Restorandan tahsilat = KIRMIZI (verdik)
  payment_in: { 
    label: "Ödeme Yapıldı", 
    color: "text-red-600", 
    bg: "bg-red-50",
    icon: TrendingDown,
    sign: "-"
  },
  received: { 
    label: "Verilen", 
    color: "text-red-600", 
    bg: "bg-red-50",
    icon: TrendingDown,
    sign: "-"
  }
};

export default function RestaurantMuhasebe({ restaurantId }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(async (append = false) => {
    if (!restaurantId) return;
    
    try {
      const skip = append ? transactions.length : 0;
      const res = await axios.get(`${API}/transactions/restaurant/${restaurantId}?skip=${skip}&limit=15`);
      
      if (append) {
        setTransactions(prev => [...prev, ...res.data.transactions]);
      } else {
        setTransactions(res.data.transactions);
      }
      setBalance(res.data.balance);
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      console.error("İşlemler yüklenemedi:", err);
      toast.error("İşlemler yüklenemedi");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [restaurantId, transactions.length]);

  useEffect(() => {
    if (restaurantId) {
      fetchTransactions();
    }
  }, [restaurantId]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchTransactions(true);
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchTransactions(false);
  };

  // Restoran için bakiye renkleri (TERSİNE)
  // Pozitif bakiye = Yönetici panelinde restoran borçlu = Restoran için ALACAK (yeşil)
  // Negatif bakiye = Yönetici panelinde restorana borçlu = Restoran için BORÇ (kırmızı)
  const getBalanceColor = (bal) => {
    if (bal === 0) return 'text-slate-600';
    return bal > 0 ? 'text-green-600' : 'text-red-600';
  };
  
  const getBalanceBg = (bal) => {
    if (bal === 0) return 'bg-slate-50';
    return bal > 0 ? 'bg-green-50' : 'bg-red-50';
  };

  const getBalanceLabel = (bal) => {
    if (bal === 0) return 'Bakiye';
    return bal > 0 ? 'Alacak' : 'Borç';
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="restaurant-muhasebe">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Muhasebe</h1>
          <p className="text-sm text-muted-foreground">Finansal işlemler ve bakiye</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="restaurant-muhasebe">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Muhasebe</h1>
          <p className="text-sm text-muted-foreground">Finansal işlemler ve bakiye</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Bakiye Kartı */}
      <Card className={`border-2 ${balance > 0 ? 'border-green-200' : balance < 0 ? 'border-red-200' : 'border-slate-200'}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${getBalanceBg(balance)}`}>
                <Wallet className={`w-7 h-7 ${getBalanceColor(balance)}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Güncel Bakiye</p>
                <p className={`text-3xl font-bold font-mono ${getBalanceColor(balance)}`}>
                  {balance === 0 ? '0,00 TL' : formatMoney(balance)}
                </p>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-lg ${getBalanceBg(balance)}`}>
              <span className={`text-sm font-medium ${getBalanceColor(balance)}`}>
                {getBalanceLabel(balance)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* İşlem Geçmişi */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-slate-500" />
            <div>
              <h2 className="font-semibold">İşlem Geçmişi</h2>
              <p className="text-xs text-muted-foreground">{totalCount} işlem</p>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Henüz işlem bulunmuyor</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600">Tarih</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600">Açıklama</th>
                      <th className="text-right p-3 text-xs font-semibold text-slate-600">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const typeInfo = TRANSACTION_TYPES[tx.type] || TRANSACTION_TYPES.payment_in;
                      
                      return (
                        <tr key={tx.id} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-sm text-slate-600">
                            {formatDate(tx.date || tx.created_at)}
                          </td>
                          <td className="p-3">
                            <p className="text-sm font-medium text-slate-800">{tx.description}</p>
                            {tx.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">{tx.notes}</p>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-mono font-semibold ${typeInfo.color}`}>
                              {typeInfo.sign}{formatMoney(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile List */}
              <div className="md:hidden divide-y">
                {transactions.map((tx) => {
                  const typeInfo = TRANSACTION_TYPES[tx.type] || TRANSACTION_TYPES.payment_in;
                  const TypeIcon = typeInfo.icon;
                  
                  return (
                    <div key={tx.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-800 truncate">{tx.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className={`${typeInfo.bg} ${typeInfo.color} border-0 text-xs`}>
                              <TypeIcon className="w-3 h-3 mr-1" />
                              {typeInfo.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(tx.date || tx.created_at)}
                            </span>
                          </div>
                          {tx.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{tx.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono font-semibold ${typeInfo.color}`}>
                            {typeInfo.sign}{formatMoney(tx.amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="p-4 text-center border-t">
                  <Button 
                    variant="outline" 
                    onClick={loadMore} 
                    disabled={loadingMore}
                    className="w-full md:w-auto"
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Yükleniyor...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Daha Fazla Yükle ({totalCount - transactions.length} kaldı)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
