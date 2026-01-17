import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Calculator, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function CourierMuhasebePage({ courierId, courierName }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installmentProducts, setInstallmentProducts] = useState([]);

  const fetchTransactions = async (append = false) => {
    try {
      const skip = append ? transactions.length : 0;
      const res = await axios.get(`${API}/transactions/courier/${courierId}?skip=${skip}&limit=20`);
      
      if (append) {
        setTransactions(prev => [...prev, ...res.data.transactions]);
      } else {
        setTransactions(res.data.transactions);
      }
      setBalance(res.data.balance);
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      toast.error("İşlemler yüklenemedi");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchInstallmentProducts = async () => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}/installment-products?include_completed=false`);
      setInstallmentProducts(res.data);
    } catch (err) {
      console.error("Taksitli ürünler yüklenemedi");
    }
  };

  useEffect(() => {
    if (courierId) {
      fetchTransactions();
      fetchInstallmentProducts();
    }
  }, [courierId]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchTransactions(true);
  };

  const totalRemainingInstallments = installmentProducts.reduce((sum, p) => sum + p.remaining_installments, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Kurye için bakiye renkleri TERSİNE çevrildi
  // Şirket için: pozitif=kırmızı(borç), negatif=yeşil(alacak)
  // Kurye için: pozitif=yeşil(alacak), negatif=kırmızı(borç)
  const getBalanceColor = (bal) => {
    if (bal === 0) return '';
    return bal > 0 ? 'text-green-600' : 'text-red-600';
  };
  const getBalanceBg = (bal) => {
    if (bal === 0) return 'bg-slate-100';
    return bal > 0 ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className="space-y-4" data-testid="courier-muhasebe-page">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">Muhasebe</h2>
              <p className="text-sm text-muted-foreground">İşlem geçmişiniz ve bakiyeniz</p>
            </div>
          </div>
          <div className={`text-right px-4 py-2 rounded-lg ${getBalanceBg(balance)}`}>
            <p className="text-xs text-muted-foreground">Güncel Bakiye</p>
            <p className={`text-xl font-bold font-mono ${getBalanceColor(balance)}`}>
              {balance === 0 ? '0 TL' : formatMoney(balance)}
            </p>
          </div>
        </div>
      </div>

      {/* Taksitli Ürünler */}
      {installmentProducts.length > 0 && (
        <div className="border-2 border-border bg-white">
          <div className="p-4 border-b-2 border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold">Taksitli Ürünler</h3>
            </div>
            {totalRemainingInstallments > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {totalRemainingInstallments} taksit kaldı
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {installmentProducts.map((product) => (
              <div key={product.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(product.installment_amount)} x {product.installment_count} = {formatMoney(product.total_amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-purple-600">
                      {product.installment_count - product.remaining_installments} / {product.installment_count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kalan: {formatMoney(product.total_amount - product.paid_amount)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all"
                    style={{ width: `${((product.installment_count - product.remaining_installments) / product.installment_count) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <h3 className="font-semibold">İşlem Geçmişi ({totalCount})</h3>
        </div>
        
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Henüz işlem bulunmuyor</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Tarih</th>
                    <th className="text-left p-3 font-semibold">Açıklama</th>
                    <th className="text-right p-3 font-semibold">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                      <td className="p-3">
                        {tx.description}
                        {tx.is_hakedis && (
                          <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                            Hakediş
                          </span>
                        )}
                        {tx.installment_product_id && (
                          <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                            Taksit
                          </span>
                        )}
                      </td>
                      <td className={`p-3 text-right font-mono font-semibold ${
                        tx.type === 'payment_in' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {tx.type === 'payment_in' ? '-' : '+'}{formatMoney(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {hasMore && (
              <div className="p-4 text-center border-t border-border">
                <Button 
                  variant="outline" 
                  onClick={loadMore} 
                  disabled={loadingMore}
                  className="h-9"
                >
                  {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalCount - transactions.length} kaldı)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
