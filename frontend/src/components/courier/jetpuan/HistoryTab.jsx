import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { History, ArrowUp, ArrowDown } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function HistoryTab({ courierId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/transactions/${courierId}`);
      setTransactions(res.data);
    } catch (err) {
      if (!err.handled) {
      toast.error("Puan geçmişi yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-3">
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Henüz puan hareketi yok</p>
        </div>
      ) : (
        transactions.map((tx) => (
          <div key={tx.id} className="border-2 border-border bg-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                tx.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {tx.type === 'credit' ? (
                  <ArrowDown className="w-5 h-5 text-green-600" />
                ) : (
                  <ArrowUp className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{tx.description}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString('tr-TR')}
                </p>
              </div>
            </div>
            <span className={`text-lg font-bold ${
              tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
            }`}>
              {tx.type === 'credit' ? '+' : ''}{tx.amount.toFixed(2)} JP
            </span>
          </div>
        ))
      )}
    </div>
  );
}
