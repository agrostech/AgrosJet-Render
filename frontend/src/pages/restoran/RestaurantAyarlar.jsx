import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Printer, Settings, TestTube, CheckCircle2, XCircle, RefreshCw, Download, ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import {
  checkLocalPrintServer,
  getLocalPrinters,
  printOrderLocal,
  getLocalPrintSettings,
  saveLocalPrintSettings,
} from "@/utils/localPrintService";

const STORAGE_KEY = "restaurant_print_settings";

export default function RestaurantAyarlar({ restaurantId, restaurantName }) {
  const [localSettings, setLocalSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm" });
  const [savedSettings, setSavedSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm" });
  const [serverStatus, setServerStatus] = useState({ connected: false, message: "Kontrol ediliyor..." });
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [openSections, setOpenSections] = useState({ print: true });
  const [hasChanges, setHasChanges] = useState(false);

  // Ayarları yükle
  useEffect(() => {
    const localStored = getLocalPrintSettings(restaurantId);
    setLocalSettings(localStored);
    setSavedSettings(localStored);
    checkServerStatus();
  }, [restaurantId]);

  // Değişiklik kontrolü
  useEffect(() => {
    const changed = JSON.stringify(localSettings) !== JSON.stringify(savedSettings);
    setHasChanges(changed);
  }, [localSettings, savedSettings]);

  // Bağlı değilse otomatik kontrol
  useEffect(() => {
    if (serverStatus.connected) return;
    const interval = setInterval(checkServerStatus, 3000);
    return () => clearInterval(interval);
  }, [serverStatus.connected]);

  const checkServerStatus = async () => {
    const status = await checkLocalPrintServer();
    setServerStatus(status);
    if (status.connected) {
      setPrinters(status.printers || []);
      if (!localSettings.printerName && status.defaultPrinter) {
        setLocalSettings(prev => ({ ...prev, printerName: status.defaultPrinter }));
      }
    }
  };

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

  const updateLocalSetting = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveLocalPrintSettings(restaurantId, localSettings);
    setSavedSettings(localSettings);
    toast.success("Ayarlar kaydedildi");
  };

  const handleTestPrint = async () => {
    if (!serverStatus.connected || !localSettings.printerName) {
      toast.error("Yazıcı bağlı değil");
      return;
    }

    setTestingPrint(true);
    const testOrder = {
      order_number: "TEST-001",
      restaurant_name: restaurantName || "Test Restoran",
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
      notes: "Kapıda zil çalınmasın",
      created_at: new Date().toISOString(),
    };

    const result = await printOrderLocal(testOrder, localSettings.printerName, localSettings.paperSize);
    setTestingPrint(false);

    if (result.success) {
      toast.success("Test fişi yazıcıya gönderildi");
    } else {
      toast.error(result.error);
    }
  };

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-4" data-testid="restaurant-ayarlar-page">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5" />
        <h1 className="text-xl font-semibold">Ayarlar</h1>
      </div>

      {/* Otomatik Yazdırma */}
      <Collapsible open={openSections.print} onOpenChange={() => toggleSection("print")}>
        <Card>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <Printer className="w-5 h-5" />
                <span className="font-medium">Otomatik Yazdırma</span>
                {serverStatus.connected ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${openSections.print ? "rotate-180" : ""}`} />
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* Bağlı Değilse - İndirme */}
              {!serverStatus.connected && (
                <div className="p-4 border rounded-lg space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Yazdırma sunucusu bağlı değil. Programı indirip çalıştırın.
                  </p>
                  <a 
                    href="/AgrosJet_Print_Server.exe" 
                    download="AgrosJet_Print_Server.exe"
                    className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
                  >
                    <Download className="w-4 h-4" />
                    AgrosJet Print Server İndir
                  </a>
                </div>
              )}

              {/* Bağlıysa - Ayarlar */}
              {serverStatus.connected && (
                <>
                  {/* Otomatik Yazdırma Switch */}
                  <div className="flex items-center justify-between py-2">
                    <Label htmlFor="auto-print">Otomatik Yazdırma</Label>
                    <Switch
                      id="auto-print"
                      checked={localSettings.enabled}
                      onCheckedChange={(checked) => updateLocalSetting("enabled", checked)}
                    />
                  </div>

                  {/* Yazıcı Seçimi */}
                  <div className="space-y-2">
                    <Label>Yazıcı</Label>
                    <div className="flex gap-2">
                      <Select
                        value={localSettings.printerName || ""}
                        onValueChange={(value) => updateLocalSetting("printerName", value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Yazıcı seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {printers.map((printer) => (
                            <SelectItem key={printer} value={printer}>
                              {printer}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="icon" onClick={loadPrinters} disabled={loadingPrinters}>
                        <RefreshCw className={`w-4 h-4 ${loadingPrinters ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* Kağıt Boyutu */}
                  <div className="space-y-2">
                    <Label>Kağıt Boyutu</Label>
                    <RadioGroup
                      value={localSettings.paperSize}
                      onValueChange={(value) => updateLocalSetting("paperSize", value)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="58mm" id="paper-58" />
                        <Label htmlFor="paper-58">58mm</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="80mm" id="paper-80" />
                        <Label htmlFor="paper-80">80mm</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Butonlar */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {hasChanges ? "Kaydet" : "Kaydedildi"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestPrint}
                      disabled={testingPrint || !localSettings.printerName}
                      className="gap-2"
                    >
                      {testingPrint ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                      Test Yazdır
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
