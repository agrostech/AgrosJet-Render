import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift, Plus, Trash2, Package } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

export default function BonusTab({ companyId }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState({ min_packets: "", amount: "" });
  const [adding, setAdding] = useState(false);

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

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6" data-testid="bonus-tab">
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
              {adding ? "Ekleniyor..." : "Ekle"}
            </Button>
          </div>
        </form>

        {/* Kurallar Listesi */}
        <div className="divide-y divide-border">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Henüz bonus kuralı eklenmemiş</p>
              <p className="text-sm mt-1">Yukarıdan yeni kural ekleyin</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Package className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      <span className="text-amber-600">{rule.min_packets}+</span> paket
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Minimum {rule.min_packets} paket teslim edildiğinde
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600 font-mono">{formatMoney(rule.amount)}</p>
                    <p className="text-xs text-muted-foreground">Bonus</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="h-9 w-9 p-0 hover:bg-red-50 hover:text-red-600"
                    data-testid={`delete-rule-${rule.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Açıklama */}
        {rules.length > 0 && (
          <div className="p-4 bg-amber-50 border-t-2 border-amber-200">
            <p className="text-sm text-amber-800">
              <strong>Nasıl çalışır:</strong> Kurye haftalık paket sayısına göre en uygun bonus basamağından ödeme alır. 
              Örneğin {rules.length > 0 && `${rules[0].min_packets} paket için ${formatMoney(rules[0].amount)}`}
              {rules.length > 1 && `, ${rules[1].min_packets} paket için ${formatMoney(rules[1].amount)}`} bonus uygulanır.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
