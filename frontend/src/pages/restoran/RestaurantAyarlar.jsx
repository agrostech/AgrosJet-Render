import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Printer, Settings, Volume2, Bell, TestTube } from "lucide-react";
import { toast } from "sonner";
import { printOrder } from "@/utils/printUtils";

const STORAGE_KEY = "restaurant_print_settings";

// Varsayılan ayarlar
const DEFAULT_SETTINGS = {
  autoPrint: false,
  paperSize: "80mm",
  printSound: true,
};

export default function RestaurantAyarlar({ restaurantId }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  // Ayarları localStorage'dan yükle
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${restaurantId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Ayarlar yüklenemedi:", e);
      }
    }
  }, [restaurantId]);

  // Ayarları kaydet
  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      toast.success("Ayarlar kaydedildi");
    } catch (e) {
      toast.error("Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  // Ayar değişikliği
  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Test yazdırma
  const handleTestPrint = () => {
    const testOrder = {
      order_number: "TEST-001",
      customer_name: "Test Müşteri",
      customer_phone: "0555 555 55 55",
      delivery_address: "Test Mahallesi, Test Sokak No:1 Daire:2",
      items: [
        { name: "Karışık Pizza (Büyük)", quantity: 2, price: 180, notes: "Acısız olsun" },
        { name: "Coca Cola 1L", quantity: 2, price: 45 },
        { name: "Patates Kızartması", quantity: 1, price: 35 },
      ],
      total_amount: 485,
      payment_method: "cash",
      payment_method_detail: null,
      notes: "Kapıda zil çalınmasın",
      created_at: new Date().toISOString(),
      platform: "test",
    };

    printOrder(testOrder, settings.paperSize);
    toast.success("Test fişi yazdırma penceresine gönderildi");
  };

  return (
    <div className="space-y-6" data-testid="restaurant-ayarlar-page">
      {/* Sayfa Başlığı */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Ayarlar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Restoran panel ayarlarınızı buradan yönetebilirsiniz
          </p>
        </div>
      </div>

      {/* Otomatik Yazdırma Ayarları Kartı */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Printer className="w-5 h-5 text-primary" />
            Otomatik Yazdırma Ayarları
          </CardTitle>
          <CardDescription>
            Yeni sipariş geldiğinde otomatik olarak fiş yazdırma ayarları
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Otomatik Yazdırma Switch */}
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Printer className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Otomatik Yazdırma</p>
                <p className="text-xs text-muted-foreground">
                  Yeni sipariş geldiğinde otomatik olarak fiş yazdır
                </p>
              </div>
            </div>
            <Switch
              checked={settings.autoPrint}
              onCheckedChange={(checked) => updateSetting("autoPrint", checked)}
              data-testid="auto-print-switch"
            />
          </div>

          {/* Kağıt Boyutu Seçimi */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Kağıt Boyutu (Termal Yazıcı)</Label>
            <RadioGroup
              value={settings.paperSize}
              onValueChange={(value) => updateSetting("paperSize", value)}
              className="grid grid-cols-2 gap-4"
            >
              <div className="relative">
                <RadioGroupItem
                  value="58mm"
                  id="paper-58mm"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="paper-58mm"
                  className="flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  <div className="w-8 h-12 border-2 border-dashed border-slate-300 rounded mb-2 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400">58</span>
                  </div>
                  <span className="font-semibold">58mm</span>
                  <span className="text-xs text-muted-foreground">Küçük Termal</span>
                </Label>
              </div>

              <div className="relative">
                <RadioGroupItem
                  value="80mm"
                  id="paper-80mm"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="paper-80mm"
                  className="flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  <div className="w-12 h-12 border-2 border-dashed border-slate-300 rounded mb-2 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400">80</span>
                  </div>
                  <span className="font-semibold">80mm</span>
                  <span className="text-xs text-muted-foreground">Standart Termal</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Yazdırma Sesi */}
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Yazdırma Sesi</p>
                <p className="text-xs text-muted-foreground">
                  Fiş yazdırılırken bildirim sesi çal
                </p>
              </div>
            </div>
            <Switch
              checked={settings.printSound}
              onCheckedChange={(checked) => updateSetting("printSound", checked)}
              data-testid="print-sound-switch"
            />
          </div>

          {/* Bilgi Kutusu */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Otomatik yazdırma hakkında</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Tarayıcı açık ve bu sekme aktif olmalıdır</li>
                  <li>Tarayıcı yazdırma iznini bir kez onaylamanız gerekebilir</li>
                  <li>Termal yazıcınızı varsayılan yazıcı olarak ayarlayın</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Test ve Kaydet Butonları */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleTestPrint}
              className="gap-2"
              data-testid="test-print-btn"
            >
              <TestTube className="w-4 h-4" />
              Test Yazdır
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
              data-testid="save-settings-btn"
            >
              {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
