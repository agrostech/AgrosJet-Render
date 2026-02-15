import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote, CreditCard, Package, TrendingUp } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0) + '₺';
};

// Ödeme Raporu Tab
function OdemeRaporu({ courierId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        courier_id: courierId,
        start_date: startDate,
        end_date: endDate
      });
      const res = await axios.get(`${API}/reports/courier/payments?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error("Rapor yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="payment-start-date"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="payment-end-date"
        />
        <Button onClick={handleGenerate} disabled={loading} size="sm" className="h-9" data-testid="btn-payment-report">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Nakit</p>
                  <p className="text-xl font-bold text-green-700">{formatMoney(data.cash_total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Kredi Kartı</p>
                  <p className="text-xl font-bold text-blue-700">{formatMoney(data.card_total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Tarih seçip "Göster" butonuna tıklayın</p>
      )}
    </div>
  );
}

// Kazanç Raporu Tab
function KazancRaporu({ courierId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        courier_id: courierId,
        start_date: startDate,
        end_date: endDate
      });
      const res = await axios.get(`${API}/reports/courier/earnings?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error("Rapor yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="earnings-start-date"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="earnings-end-date"
        />
        <Button onClick={handleGenerate} disabled={loading} size="sm" className="h-9" data-testid="btn-earnings-report">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-purple-600 font-medium">Paket Sayısı</p>
                  <p className="text-xl font-bold text-purple-700">{data.package_count || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-orange-600 font-medium">Toplam Hakediş</p>
                  <p className="text-xl font-bold text-orange-700">{formatMoney(data.total_earnings)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Tarih seçip "Göster" butonuna tıklayın</p>
      )}
    </div>
  );
}

export default function CourierRaporlarPage({ courierId }) {
  const [activeTab, setActiveTab] = useState("odeme");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Raporlar</h2>
      
      {/* Tab Buttons */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "odeme" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("odeme")}
          data-testid="tab-odeme-raporu"
        >
          Ödeme Raporu
        </Button>
        <Button
          variant={activeTab === "kazanc" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("kazanc")}
          data-testid="tab-kazanc-raporu"
        >
          Kazanç Raporu
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "odeme" && <OdemeRaporu courierId={courierId} />}
      {activeTab === "kazanc" && <KazancRaporu courierId={courierId} />}
    </div>
  );
}
