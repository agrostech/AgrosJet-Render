import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Printer, Settings, Volume2, Bell, TestTube, CheckCircle2, XCircle, RefreshCw, Zap, Download } from "lucide-react";
import { toast } from "sonner";
import { printOrder } from "@/utils/printUtils";
import {
  isQzAvailable,
  isQzConnected,
  connectToQz,
  getPrinters,
  silentPrint,
  getQzStatus,
  getQzSettings,
  saveQzSettings,
} from "@/utils/qzTrayService";

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
  
  // QZ Tray state
  const [qzStatus, setQzStatus] = useState({ installed: false, connected: false, message: "Kontrol ediliyor..." });
  const [qzSettings, setQzSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm", useRawMode: true });
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testingQz, setTestingQz] = useState(false);

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
    
    // QZ Tray ayarlarını yükle
    const qzStored = getQzSettings(restaurantId);
    setQzSettings(qzStored);
    
    // QZ Tray durumunu kontrol et
    checkQzStatus();
  }, [restaurantId]);

  // QZ Tray durumunu kontrol et
  const checkQzStatus = async () => {
    setQzStatus({ installed: false, connected: false, message: "Kontrol ediliyor..." });
    
    // Küçük bir gecikme ekle - kütüphanenin yüklenmesi için
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const status = await getQzStatus();
    setQzStatus(status);
    
    if (status.connected) {
      loadPrinters();
    }
  };

  // Yazıcı listesini yükle
  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const result = await getPrinters();
      if (result.success) {
        setPrinters(result.printers);
      }
    } catch (e) {
      console.error("Yazıcılar yüklenemedi:", e);
    } finally {
      setLoadingPrinters(false);
    }
  };

  // QZ Tray'e bağlan
  const handleConnectQz = async () => {
    setQzStatus(prev => ({ ...prev, message: "Bağlanıyor..." }));
    const result = await connectToQz();
    
    if (result.success) {
      setQzStatus({ installed: true, connected: true, message: "Bağlı" });
      loadPrinters();
      toast.success("QZ Tray bağlantısı başarılı");
    } else {
      setQzStatus({ installed: isQzAvailable(), connected: false, message: result.error });
      toast.error(result.error);
    }
  };

  // Ayarları kaydet
  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      saveQzSettings(restaurantId, qzSettings);
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

  // QZ Ayar değişikliği
  const updateQzSetting = (key, value) => {
    setQzSettings(prev => ({ ...prev, [key]: value }));
  };

  // Test yazdırma (tarayıcı)
  const handleTestPrint = () => {
    const testOrder = getTestOrder();
    printOrder(testOrder, settings.paperSize);
    toast.success("Test fişi yazdırma penceresine gönderildi");
  };

  // QZ Tray ile test yazdırma (sessiz)
  const handleQzTestPrint = async () => {
    if (!qzStatus.connected) {
      toast.error("QZ Tray bağlı değil");
      return;
    }

    setTestingQz(true);
    const testOrder = getTestOrder();
    
    const result = await silentPrint(
      testOrder,
      qzSettings.printerName,
      qzSettings.paperSize,
      qzSettings.useRawMode
    );

    setTestingQz(false);

    if (result.success) {
      toast.success(`Test fişi yazıcıya gönderildi: ${result.printer}`);
    } else {
      toast.error(result.error);
    }
  };

  // Test sipariş objesi
  const getTestOrder = () => ({
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
  });

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

      {/* QZ Tray Sessiz Yazdırma */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5 text-yellow-500" />
            Sessiz Yazdırma (QZ Tray)
            <Badge variant={qzStatus.connected ? "default" : "secondary"} className="ml-2">
              {qzStatus.connected ? "Bağlı" : "Bağlı Değil"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Yazdırma diyaloğu olmadan doğrudan yazıcıya gönderir. Profesyonel kullanım için önerilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QZ Tray Durumu */}
          <div className="p-4 rounded-lg border bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {qzStatus.connected ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )}
                <div>
                  <p className="font-medium">
                    {qzStatus.connected ? "QZ Tray Bağlı" : "QZ Tray Bağlı Değil"}
                  </p>
                  <p className="text-xs text-muted-foreground">{qzStatus.message}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!qzStatus.installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("https://qz.io/download", "_blank")}
                    className="gap-1"
                  >
                    <Download className="w-4 h-4" />
                    İndir
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectQz}
                  className="gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  {qzStatus.connected ? "Yenile" : "Bağlan"}
                </Button>
              </div>
            </div>
          </div>

          {/* Sessiz Yazdırma Aktif/Pasif */}
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Zap className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium">Sessiz Yazdırma Aktif</p>
                <p className="text-xs text-muted-foreground">
                  Sipariş geldiğinde diyalog olmadan yazdır
                </p>
              </div>
            </div>
            <Switch
              checked={qzSettings.enabled}
              onCheckedChange={(checked) => updateQzSetting("enabled", checked)}
              disabled={!qzStatus.connected}
              data-testid="qz-enabled-switch"
            />
          </div>

          {/* Yazıcı Seçimi */}
          {qzStatus.connected && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Yazıcı Seç</Label>
              <div className="flex gap-2">
                <Select
                  value={qzSettings.printerName || ""}
                  onValueChange={(value) => updateQzSetting("printerName", value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Yazıcı seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((printer) => (
                      <SelectItem key={printer} value={printer}>
                        {printer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={loadPrinters}
                  disabled={loadingPrinters}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingPrinters ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {printers.length === 0 && !loadingPrinters && (
                <p className="text-xs text-muted-foreground">Yazıcı bulunamadı</p>
              )}
            </div>
          )}

          {/* QZ Kağıt Boyutu */}
          {qzStatus.connected && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Kağıt Boyutu</Label>
              <RadioGroup
                value={qzSettings.paperSize}
                onValueChange={(value) => updateQzSetting("paperSize", value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="58mm" id="qz-58mm" />
                  <Label htmlFor="qz-58mm">58mm</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="80mm" id="qz-80mm" />
                  <Label htmlFor="qz-80mm">80mm</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* ESC/POS Modu */}
          {qzStatus.connected && (
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
              <div>
                <p className="font-medium">ESC/POS Modu (Önerilen)</p>
                <p className="text-xs text-muted-foreground">
                  Termal yazıcılar için optimize edilmiş komutlar kullan
                </p>
              </div>
              <Switch
                checked={qzSettings.useRawMode}
                onCheckedChange={(checked) => updateQzSetting("useRawMode", checked)}
              />
            </div>
          )}

          {/* QZ Test Yazdırma */}
          {qzStatus.connected && (
            <Button
              variant="outline"
              onClick={handleQzTestPrint}
              disabled={testingQz || !qzSettings.printerName}
              className="w-full gap-2"
            >
              {testingQz ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              Sessiz Test Yazdır
            </Button>
          )}

          {/* QZ Tray Kurulum Bilgisi */}
          {!qzStatus.installed && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">QZ Tray Kurulumu</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>
                      <a href="https://qz.io/download" target="_blank" rel="noopener noreferrer" className="underline">
                        qz.io/download
                      </a> adresinden QZ Tray'i indirin
                    </li>
                    <li>Kurulumu tamamlayın ve QZ Tray'i başlatın</li>
                    <li>Bu sayfayı yenileyin ve "Bağlan" butonuna tıklayın</li>
                    <li>Yazıcınızı seçin ve test edin</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tarayıcı Yazdırma Ayarları (Yedek) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Printer className="w-5 h-5 text-primary" />
            Tarayıcı Yazdırma (Yedek)
          </CardTitle>
          <CardDescription>
            QZ Tray kullanılamadığında tarayıcı üzerinden yazdırma
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
                <p className="font-medium">Otomatik Yazdırma (Tarayıcı)</p>
                <p className="text-xs text-muted-foreground">
                  QZ Tray yoksa tarayıcı yazdırma penceresini aç
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
            <Label className="text-sm font-semibold">Kağıt Boyutu</Label>
            <RadioGroup
              value={settings.paperSize}
              onValueChange={(value) => updateSetting("paperSize", value)}
              className="grid grid-cols-2 gap-4"
            >
              <div className="relative">
                <RadioGroupItem value="58mm" id="paper-58mm" className="peer sr-only" />
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
                <RadioGroupItem value="80mm" id="paper-80mm" className="peer sr-only" />
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

          {/* Test Yazdırma */}
          <Button variant="outline" onClick={handleTestPrint} className="w-full gap-2">
            <TestTube className="w-4 h-4" />
            Tarayıcı Test Yazdır
          </Button>
        </CardContent>
      </Card>

      {/* Kaydet Butonu */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="save-settings-btn">
          {saving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}
        </Button>
      </div>
    </div>
  );
}
