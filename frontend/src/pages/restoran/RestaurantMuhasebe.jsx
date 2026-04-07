import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  ChevronDown,
  FileText,
  Wallet,
  Receipt,
  HandCoins
} from "lucide-react";
import RestaurantFaturalarModal from "@/components/restoran/RestaurantFaturalarModal";
import CourierCollectionModal from "@/components/restoran/CourierCollectionModal";

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

// İşlem tipleri - Restoran perspektifinden (Admin panelin TERSİ)
// Admin "payment_out/Verilen" (yeşil) = Admin verdi = Restoran aldı = YEŞİL
// Admin "payment_in/Alınan" (kırmızı) = Admin aldı = Restoran verdi = KIRMIZI
// AMA kullanıcı tam tersini istiyor:
// Admin yeşil -> Restoran kırmızı
// Admin kırmızı -> Restoran yeşil
const TRANSACTION_TYPES = {
  // Admin panelde "payment_out" yeşil = Restoran için KIRMIZI
  payment_out: { 
    label: "Verilen", 
    color: "text-red-600", 
    bg: "bg-red-50",
    icon: TrendingDown,
    sign: "-"
  },
  given: { 
    label: "Verilen", 
    color: "text-red-600", 
    bg: "bg-red-50",
    icon: TrendingDown,
    sign: "-"
  },
  // Admin panelde "payment_in" kırmızı = Restoran için YEŞİL
  payment_in: { 
    label: "Alınan", 
    color: "text-green-600", 
    bg: "bg-green-50",
    icon: TrendingUp,
    sign: "+"
  },
  received: { 
    label: "Alınan", 
    color: "text-green-600", 
    bg: "bg-green-50",
    icon: TrendingUp,
    sign: "+"
  }
};

export default function RestaurantMuhasebe({ restaurantId, restaurantName }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFaturalar, setShowFaturalar] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [hasCollectionSettings, setHasCollectionSettings] = useState(false);
  const [missingInvoiceCount, setMissingInvoiceCount] = useState(0);

  // Restoran tahsilat ayarlarını kontrol et (1. toggle aktif mi? 2. restoran tahsilatı var mı?)
  useEffect(() => {
    if (!restaurantId) return;
    axios.get(`${API}/restaurants/collection-settings/${restaurantId}`)
      .then(res => {
        const d = res.data;
        const toggleOn = d.courier_collection_enabled === true;
        const hasRestaurantCollection = d.cash_collection === "restaurant" || d.card_collection === "restaurant";
        setHasCollectionSettings(toggleOn && hasRestaurantCollection);
      })
      .catch(() => setHasCollectionSettings(false));
  }, [restaurantId]);

  // Eksik fatura sayısını al
  const fetchMissingInvoiceCount = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await axios.get(`${API}/restaurant-panel-invoices/${restaurantId}/issued`);
      // invoice_uploaded === false olanları say
      const missing = res.data.filter(inv => !inv.invoice_uploaded).length;
      setMissingInvoiceCount(missing);
    } catch (err) {
      console.error("Eksik fatura sayısı alınamadı:", err);
    }
  }, [restaurantId]);

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
      fetchMissingInvoiceCount();
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

  // Restoran için bakiye renkleri (Admin panelin TERSİ)
  // Admin perspektifinden negatif = Admin borçlu = Restoran ALACAKLI (yeşil)
  // Admin perspektifinden pozitif = Admin alacaklı = Restoran BORÇLU (kırmızı)
  const getBalanceColor = (bal) => {
    if (bal === 0) return 'text-slate-600';
    return bal < 0 ? 'text-green-600' : 'text-red-600';
  };
  
  const getBalanceBg = (bal) => {
    if (bal === 0) return 'bg-slate-50';
    return bal < 0 ? 'bg-green-50' : 'bg-red-50';
  };

  const getBalanceLabel = (bal) => {
    if (bal === 0) return 'Bakiye';
    return bal < 0 ? 'Alacak' : 'Borç';
  };

  if (loading) {
    return (
      <div className="space-y-4" data-testid="restaurant-muhasebe">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Muhasebe</h1>
          <p className="text-sm text-muted-foreground">Finansal işlemler ve bakiye</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="restaurant-muhasebe">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Muhasebe</h1>
          <p className="text-sm text-muted-foreground">Finansal işlemler ve bakiye</p>
        </div>
        <div className="flex items-center gap-2">
          {hasCollectionSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCollection(true)}
              data-testid="courier-collection-btn"
            >
              <HandCoins className="w-4 h-4 mr-2" />
              Kurye Hesap Al
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFaturalar(true)}
            className="relative"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Faturalar
            {missingInvoiceCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {missingInvoiceCount}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Bakiye Kartı */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getBalanceBg(balance)}`}>
              <Wallet className={`w-5 h-5 ${getBalanceColor(balance)}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Güncel Bakiye</p>
              <p className={`text-2xl font-bold font-mono ${getBalanceColor(balance)}`}>
                {balance === 0 ? '0,00 TL' : formatMoney(balance)}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-lg ${getBalanceBg(balance)}`}>
            <span className={`text-sm font-medium ${getBalanceColor(balance)}`}>
              {getBalanceLabel(balance)}
            </span>
          </div>
        </div>
      </div>

      {/* İşlem Geçmişi */}
      <div className="bg-white border rounded-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-slate-500" />
            <div>
              <h2 className="text-sm font-semibold">İşlem Geçmişi</h2>
              <p className="text-xs text-muted-foreground">{totalCount} işlem</p>
            </div>
          </div>
        </div>

        <div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Henüz işlem bulunmuyor</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-600">Tarih</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-600">Açıklama</th>
                      <th className="text-right px-4 py-2 text-[11px] font-semibold text-slate-600">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const typeInfo = TRANSACTION_TYPES[tx.type] || TRANSACTION_TYPES.payment_in;
                      
                      return (
                        <tr key={tx.id} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            {formatDate(tx.date || tx.created_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-xs font-medium text-slate-800">{tx.description}</p>
                            {tx.notes && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{tx.notes}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono text-xs font-semibold ${typeInfo.color}`}>
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
                  
                  return (
                    <div key={tx.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs text-slate-800 truncate">{tx.description}</p>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(tx.date || tx.created_at)}
                          </span>
                          {tx.notes && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{tx.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono text-xs font-semibold ${typeInfo.color}`}>
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
                    size="sm"
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
                        Daha Fazla ({totalCount - transactions.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Faturalar Modal */}
      <RestaurantFaturalarModal
        open={showFaturalar}
        onOpenChange={(open) => {
          setShowFaturalar(open);
          if (!open) {
            fetchMissingInvoiceCount();
          }
        }}
        restaurantId={restaurantId}
        restaurantName={restaurantName}
      />

      {/* Kurye Hesap Al Modal */}
      <CourierCollectionModal
        open={showCollection}
        onOpenChange={setShowCollection}
        restaurantId={restaurantId}
      />
    </div>
  );
}
