import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, UserPlus, UserMinus, Search, CheckCircle } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function SettingsTab({ companyId }) {
  const [settings, setSettings] = useState({ puan_per_100tl: 1.17 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Manuel puan ekleme/silme
  const [couriers, setCouriers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/settings`);
      setSettings(res.data);
    } catch (err) {
      toast.error("Ayarlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
    } catch (err) {
      console.error("Kuryeler yüklenemedi");
    }
  }, [companyId]);

  useEffect(() => {
    fetchSettings();
    fetchCouriers();
  }, [fetchSettings, fetchCouriers]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/jetpuan/settings`, settings);
      toast.success("Ayarlar kaydedildi");
    } catch (err) {
      toast.error("Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleManualPuan = async (isAdd) => {
    if (!selectedCourier || !manualAmount) {
      toast.error("Kurye ve miktar seçin");
      return;
    }
    
    const amount = parseFloat(manualAmount);
    if (amount <= 0) {
      toast.error("Miktar 0'dan büyük olmalı");
      return;
    }

    setManualLoading(true);
    try {
      if (isAdd) {
        await axios.post(`${API}/jetpuan/manual-credit/${selectedCourier}`, null, {
          params: {
            amount: amount,
            description: manualDescription || "Manuel puan ekleme"
          }
        });
        toast.success(`${amount} JP eklendi`);
      } else {
        await axios.post(`${API}/jetpuan/manual-debit/${selectedCourier}`, null, {
          params: {
            amount: amount,
            description: manualDescription || "Manuel puan silme"
          }
        });
        toast.success(`${amount} JP silindi`);
      }
      setManualAmount("");
      setManualDescription("");
      setSelectedCourier(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setManualLoading(false);
    }
  };

  const filteredCouriers = couriers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  if (loading) return <PageLoading />;

  const exampleHakedis = 100;
  const examplePoints = (exampleHakedis / 100) * settings.puan_per_100tl;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Puan Oranı Ayarı */}
      <div className="border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Puan Oranı Ayarı
        </h3>
        
        <div className="space-y-4">
          <div>
            <Label>Her 100 TL Hakediş İçin Kaç JetPuan?</Label>
            <Input
              type="number"
              step="0.01"
              value={settings.puan_per_100tl}
              onChange={(e) => setSettings({ ...settings, puan_per_100tl: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-11 border-2 text-lg font-mono"
              data-testid="puan-ratio-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Varsayılan: 1.17 (85&#39;te 1 oranı)
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">Örnek Hesaplama:</p>
            <p className="text-sm text-amber-700">
              {exampleHakedis} TL hakediş = <span className="font-bold">{examplePoints.toFixed(2)} JetPuan</span>
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full h-11 font-semibold">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* Manuel Puan Ekle/Sil */}
      <div className="border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Manuel JetPuan Ekle/Sil
        </h3>
        
        <div className="space-y-4">
          <div>
            <Label>Kurye Ara</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="İsim veya telefon..."
                className="h-10 border-2 pl-10"
              />
            </div>
          </div>

          {searchQuery && (
            <div className="max-h-32 overflow-y-auto border rounded-lg">
              {filteredCouriers.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">Kurye bulunamadı</p>
              ) : (
                filteredCouriers.slice(0, 5).map((courier) => (
                  <button
                    key={courier.id}
                    onClick={() => {
                      setSelectedCourier(courier.id);
                      setSearchQuery(courier.name);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      selectedCourier === courier.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <p className="font-medium">{courier.name}</p>
                    <p className="text-xs text-muted-foreground">{courier.phone}</p>
                  </button>
                ))
              )}
            </div>
          )}

          <div>
            <Label>JetPuan Miktarı</Label>
            <Input
              type="number"
              step="0.01"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder="10.00"
              className="mt-1 h-10 border-2"
            />
          </div>

          <div>
            <Label>Açıklama (Opsiyonel)</Label>
            <Input
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Bonus puan, düzeltme vb."
              className="mt-1 h-10 border-2"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => handleManualPuan(true)} 
              disabled={manualLoading || !selectedCourier || !manualAmount}
              className="flex-1 h-10 font-semibold bg-green-600 hover:bg-green-700"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Puan Ekle
            </Button>
            <Button 
              onClick={() => handleManualPuan(false)} 
              disabled={manualLoading || !selectedCourier || !manualAmount}
              variant="outline"
              className="flex-1 h-10 font-semibold border-2 hover:bg-red-50 hover:text-red-600"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              Puan Sil
            </Button>
          </div>
        </div>
      </div>

      {/* Bilgi Kutusu */}
      <div className="lg:col-span-2 border-2 border-border bg-white p-6">
        <h3 className="font-semibold mb-3">Puan Sistemi Nasıl Çalışır?</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Kuryeye hakediş girildiğinde otomatik olarak JetPuan yüklenir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Hakediş silindiğinde yüklenen JetPuan da otomatik silinir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Kuryeler puanlarını JetPuan Market&#39;te harcayabilir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Sipariş iptal edilirse puanlar iade edilir
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            Manuel olarak kuryeye puan ekleyebilir veya silebilirsiniz
          </li>
        </ul>
      </div>
    </div>
  );
}
