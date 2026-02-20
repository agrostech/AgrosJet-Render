import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Printer, Settings, Volume2, Bell, TestTube, CheckCircle2, XCircle, RefreshCw, Zap, Download, Server } from "lucide-react";
import { toast } from "sonner";
import { printOrder } from "@/utils/printUtils";
import {
  checkLocalPrintServer,
  getLocalPrinters,
  printOrderLocal,
  getLocalPrintSettings,
  saveLocalPrintSettings,
} from "@/utils/localPrintService";

const STORAGE_KEY = "restaurant_print_settings";

// Varsayılan ayarlar
const DEFAULT_SETTINGS = {
  autoPrint: false,
  paperSize: "80mm",
  printSound: true,
};

export default function RestaurantAyarlar({ restaurantId, restaurantName }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  
  // Yerel Yazdırma Sunucusu state
  const [serverStatus, setServerStatus] = useState({ available: false, connected: false, message: "Kontrol ediliyor..." });
  const [localSettings, setLocalSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm" });
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);

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
    
    // Yerel yazdırma ayarlarını yükle
    const localStored = getLocalPrintSettings(restaurantId);
    setLocalSettings(localStored);
    
    // Sunucu durumunu kontrol et
    checkServerStatus();
  }, [restaurantId]);

  // Bağlı değilse otomatik kontrol et
  useEffect(() => {
    if (serverStatus.connected) return;
    
    const interval = setInterval(() => {
      checkServerStatus();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [serverStatus.connected]);

  // Sunucu durumunu kontrol et
  const checkServerStatus = async () => {
    setServerStatus({ available: false, connected: false, message: "Kontrol ediliyor..." });
    
    const status = await checkLocalPrintServer();
    setServerStatus(status);
    
    if (status.connected) {
      setPrinters(status.printers || []);
      // Varsayılan yazıcıyı ayarla
      if (!localSettings.printerName && status.defaultPrinter) {
        setLocalSettings(prev => ({ ...prev, printerName: status.defaultPrinter }));
      }
    }
  };

  // Yazıcı listesini yükle
  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const result = await getLocalPrinters();
      if (result.success) {
        setPrinters(result.printers);
        if (!localSettings.printerName && result.defaultPrinter) {
          setLocalSettings(prev => ({ ...prev, printerName: result.defaultPrinter }));
        }
      }
    } catch (e) {
      console.error("Yazıcılar yüklenemedi:", e);
    } finally {
      setLoadingPrinters(false);
    }
  };

  // Ayarları kaydet
  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      saveLocalPrintSettings(restaurantId, localSettings);
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

  // Yerel Ayar değişikliği
  const updateLocalSetting = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  // Test yazdırma (tarayıcı)
  const handleTestPrint = () => {
    const testOrder = getTestOrder();
    printOrder(testOrder, settings.paperSize);
    toast.success("Test fişi yazdırma penceresine gönderildi");
  };

  // Yerel sunucu ile test yazdırma (sessiz)
  const handleLocalTestPrint = async () => {
    if (!serverStatus.connected) {
      toast.error("Yerel yazdırma sunucusu bağlı değil");
      return;
    }

    setTestingPrint(true);
    const testOrder = getTestOrder();
    
    const result = await printOrderLocal(
      testOrder,
      localSettings.printerName,
      localSettings.paperSize
    );

    setTestingPrint(false);

    if (result.success) {
      toast.success(`Test fişi yazıcıya gönderildi`);
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

      {/* Yerel Yazdırma Sunucusu */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5 text-green-500" />
            Sessiz Yazdırma (Yerel Sunucu)
            <Badge variant={serverStatus.connected ? "default" : "secondary"} className="ml-2">
              {serverStatus.connected ? "Bağlı" : "Bağlı Değil"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Yazdırma diyaloğu olmadan doğrudan yazıcıya gönderir. Bilgisayarınızda küçük bir program çalıştırmanız gerekir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sunucu Durumu */}
          <div className="p-4 rounded-lg border bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {serverStatus.connected ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )}
                <div>
                  <p className="font-medium">
                    {serverStatus.connected ? "Sunucu Bağlı" : "Sunucu Bağlı Değil"}
                  </p>
                  <p className="text-xs text-muted-foreground">{serverStatus.message}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkServerStatus}
                  className="gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Yenile
                </Button>
              </div>
            </div>
          </div>

          {/* Sessiz Yazdırma Aktif/Pasif */}
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Sessiz Yazdırma Aktif</p>
                <p className="text-xs text-muted-foreground">
                  Sipariş geldiğinde diyalog olmadan yazdır
                </p>
              </div>
            </div>
            <Switch
              checked={localSettings.enabled}
              onCheckedChange={(checked) => updateLocalSetting("enabled", checked)}
              disabled={!serverStatus.connected}
              data-testid="local-print-enabled-switch"
            />
          </div>

          {/* Yazıcı Seçimi */}
          {serverStatus.connected && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Yazıcı Seç</Label>
              <div className="flex gap-2">
                <Select
                  value={localSettings.printerName || ""}
                  onValueChange={(value) => updateLocalSetting("printerName", value)}
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

          {/* Kağıt Boyutu */}
          {serverStatus.connected && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Kağıt Boyutu</Label>
              <RadioGroup
                value={localSettings.paperSize}
                onValueChange={(value) => updateLocalSetting("paperSize", value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="58mm" id="local-58mm" />
                  <Label htmlFor="local-58mm">58mm</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="80mm" id="local-80mm" />
                  <Label htmlFor="local-80mm">80mm</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Test Yazdırma */}
          {serverStatus.connected && (
            <Button
              variant="outline"
              onClick={handleLocalTestPrint}
              disabled={testingPrint || !localSettings.printerName}
              className="w-full gap-2"
            >
              {testingPrint ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              Sessiz Test Yazdır
            </Button>
          )}

          {/* Kurulum Bilgisi */}
          {!serverStatus.connected && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Download className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800 w-full">
                  <p className="font-semibold text-lg mb-3">Kurulum</p>
                  
                  <div className="bg-white border border-green-300 rounded-lg p-4 mb-4">
                    <ol className="list-decimal list-inside space-y-2">
                      <li>Aşağıdaki <strong>EXE dosyasını indirin</strong></li>
                      <li><strong>Çift tıklayın</strong> - Program başlayacak</li>
                      <li>Bu sayfayı <strong>yenileyin</strong></li>
                    </ol>
                  </div>
                  
                  <a 
                    href="/AgrosJet_Print_Server.exe" 
                    download="AgrosJet_Print_Server.exe"
                    className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg text-base font-bold hover:bg-green-700 transition-colors w-full"
                  >
                    <Download className="w-5 h-5" />
                    AgrosJet Print Server.exe İndir
                  </a>
                  
                  <p className="text-xs text-center text-green-600 mt-3">
                    Hiçbir kurulum gerektirmez. İndirin, çalıştırın, bitti.
                  </p>
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
            Yerel sunucu kullanılamadığında tarayıcı üzerinden yazdırma
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
                  Yerel sunucu yoksa tarayıcı yazdırma penceresini aç
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
