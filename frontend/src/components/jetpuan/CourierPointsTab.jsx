import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Users, Search, TrendingUp, TrendingDown, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function CourierPointsTab({ companyId }) {
  const [couriers, setCouriers] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Transaction history modal
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);

  useEffect(() => {
    fetchCouriers();
  }, [companyId]);

  const fetchCouriers = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data || []);
      
      // Fetch balances for each courier
      const balancePromises = res.data.map(async (courier) => {
        try {
          const balRes = await axios.get(`${API}/jetpuan/balance/${courier.id}`);
          return { id: courier.id, balance: balRes.data.balance };
        } catch {
          return { id: courier.id, balance: 0 };
        }
      });
      
      const balanceResults = await Promise.all(balancePromises);
      const balanceMap = {};
      balanceResults.forEach(b => { balanceMap[b.id] = b.balance; });
      setBalances(balanceMap);
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (courierId) => {
    setLoadingTx(true);
    try {
      const res = await axios.get(`${API}/jetpuan/transactions/${courierId}?limit=100`);
      setTransactions(res.data || []);
    } catch (err) {
      toast.error("İşlem geçmişi yüklenemedi");
    } finally {
      setLoadingTx(false);
    }
  };

  const openHistory = (courier) => {
    setSelectedCourier(courier);
    fetchTransactions(courier.id);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredCouriers = couriers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  // Sort by balance descending
  const sortedCouriers = [...filteredCouriers].sort((a, b) => 
    (balances[b.id] || 0) - (balances[a.id] || 0)
  );

  const totalPoints = Object.values(balances).reduce((sum, b) => sum + (b || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-points-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold">Kurye JetPuan Bakiyeleri</h3>
            <p className="text-sm text-muted-foreground">
              Toplam: <span className="font-semibold text-purple-600">{totalPoints.toFixed(2)} JP</span>
            </p>
          </div>
        </div>
        
        <Button variant="outline" size="sm" onClick={fetchCouriers}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Yenile
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Kurye ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Courier List */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="text-left p-3 font-semibold">Kurye</th>
              <th className="text-right p-3 font-semibold">JetPuan Bakiye</th>
              <th className="text-center p-3 font-semibold">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedCouriers.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">
                  {searchQuery ? "Eşleşen kurye bulunamadı" : "Kurye yok"}
                </td>
              </tr>
            ) : (
              sortedCouriers.map((courier) => {
                const balance = balances[courier.id] || 0;
                return (
                  <tr key={courier.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-medium">{courier.name}</div>
                      <div className="text-xs text-muted-foreground">{courier.phone}</div>
                    </td>
                    <td className="p-3 text-right">
                      <span className={`font-semibold font-mono ${balance > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                        {balance.toFixed(2)} JP
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openHistory(courier)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <History className="w-4 h-4 mr-1" />
                        Geçmiş
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction History Modal */}
      <Dialog open={!!selectedCourier} onOpenChange={() => setSelectedCourier(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {selectedCourier?.name} - JetPuan Geçmişi
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {loadingTx ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                İşlem geçmişi bulunamadı
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-semibold">Tarih</th>
                    <th className="text-left p-2 font-semibold">Açıklama</th>
                    <th className="text-right p-2 font-semibold">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="p-2 text-xs font-mono whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="p-2 text-xs">
                        {tx.description}
                      </td>
                      <td className={`p-2 text-right font-mono font-semibold ${
                        tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <div className="flex items-center justify-end gap-1">
                          {tx.type === 'credit' ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {tx.type === 'credit' ? '+' : ''}{tx.amount.toFixed(2)} JP
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
