import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Printer, TestTube, CheckCircle2, XCircle, RefreshCw, Download, ChevronDown, Save, Bell, Play, Volume2, AlertTriangle, Package, Bike, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  checkLocalPrintServer,
  getLocalPrinters,
  printOrderLocal,
  getLocalPrintSettings,
  saveLocalPrintSettings,
} from "@/utils/localPrintService";
import {
  playNotificationSound,
  NOTIFICATION_SOUNDS,
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  getNotificationPermission,
} from "@/utils/notificationSounds";
import {
  playCourierAssignmentSound,
  COURIER_ASSIGNMENT_SOUNDS,
  getCourierAssignmentSettings,
  saveCourierAssignmentSettings,
} from "@/utils/courierAssignmentSounds";

export default function RestaurantAyarlar({ restaurantId, restaurantName }) {
  const [localSettings, setLocalSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm" });
  const [savedSettings, setSavedSettings] = useState({ enabled: false, printerName: null, paperSize: "80mm" });
  const [serverStatus, setServerStatus] = useState({ connected: false, message: "Kontrol ediliyor..." });
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [openSections, setOpenSections] = useState({ print: false, notification: false, courierAssignment: false });
  const [hasChanges, setHasChanges] = useState(false);

  // Bildirim ayarları state'leri
  const [notificationSettings, setNotificationSettings] = useState({ enabled: true, soundId: 'ses1', volume: 1.0 });
  const [savedNotificationSettings, setSavedNotificationSettings] = useState({ enabled: true, soundId: 'ses1', volume: 1.0 });
  const [hasNotificationChanges, setHasNotificationChanges] = useState(false);
  const [playingSound, setPlayingSound] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // Kurye ataması bildirim ayarları state'leri
  const [courierSettings, setCourierSettings] = useState({ enabled: true, soundId: 'onay1', volume: 1.0 });
  const [savedCourierSettings, setSavedCourierSettings] = useState({ enabled: true, soundId: 'onay1', volume: 1.0 });
  const [hasCourierChanges, setHasCourierChanges] = useState(false);
  const [playingCourierSound, setPlayingCourierSound] = useState(false);

  // Ayarları yükle
  useEffect(() => {
    const localStored = getLocalPrintSettings(restaurantId);
    setLocalSettings(localStored);
    setSavedSettings(localStored);
    
    // Bildirim ayarlarını yükle
    const notifStored = getNotificationSettings(restaurantId);
    setNotificationSettings(notifStored);
    setSavedNotificationSettings(notifStored);
    
    // Kurye ataması ayarlarını yükle
    const courierStored = getCourierAssignmentSettings(restaurantId);
    setCourierSettings(courierStored);
    setSavedCourierSettings(courierStored);
    
    // Bildirim izni durumunu kontrol et
    setNotificationPermission(getNotificationPermission());
    
    checkServerStatus();
  }, [restaurantId]);

  // Değişiklik kontrolü
  useEffect(() => {
    const changed = JSON.stringify(localSettings) !== JSON.stringify(savedSettings);
    setHasChanges(changed);
  }, [localSettings, savedSettings]);

  // Bildirim değişiklik kontrolü
  useEffect(() => {
    const changed = JSON.stringify(notificationSettings) !== JSON.stringify(savedNotificationSettings);
    setHasNotificationChanges(changed);
  }, [notificationSettings, savedNotificationSettings]);

  // Kurye ataması değişiklik kontrolü
  useEffect(() => {
    const changed = JSON.stringify(courierSettings) !== JSON.stringify(savedCourierSettings);
    setHasCourierChanges(changed);
  }, [courierSettings, savedCourierSettings]);

  // İlk yüklemede bir kez kontrol et
  useEffect(() => {
    checkServerStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Manuel bağlan
  const handleConnect = async () => {
    setConnecting(true);
    const status = await checkLocalPrintServer();
    setServerStatus(status);
    if (status.connected) {
      setPrinters(status.printers || []);
      if (!localSettings.printerName && status.defaultPrinter) {
        setLocalSettings(prev => ({ ...prev, printerName: status.defaultPrinter }));
      }
      toast.success("Yazdırma sunucusuna bağlandı");
    } else {
      // Detaylı hata mesajı
      const errorMsg = status.message || "Bağlantı kurulamadı";
      toast.error(errorMsg);
      console.log("Print server status:", status);
    }
    setConnecting(false);
  };

  // Bağlantıyı kes
  const handleDisconnect = () => {
    setServerStatus({ connected: false, message: "Bağlantı kesildi" });
    setPrinters([]);
    toast.success("Bağlantı kesildi");
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

  // Bildirim ayarları fonksiyonları
  const updateNotificationSetting = (key, value) => {
    setNotificationSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePlaySound = () => {
    setPlayingSound(true);
    playNotificationSound(notificationSettings.soundId, notificationSettings.volume);
    setTimeout(() => setPlayingSound(false), 2500);
  };

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setNotificationPermission(result.permission);
    if (result.permission === 'granted') {
      toast.success("Bildirim izni verildi");
    } else if (result.permission === 'denied') {
      toast.error("Bildirim izni reddedildi");
    }
  };

  const handleSaveNotificationSettings = () => {
    saveNotificationSettings(restaurantId, notificationSettings);
    setSavedNotificationSettings(notificationSettings);
  };

  // Kurye ataması ayarları fonksiyonları
  const updateCourierSetting = (key, value) => {
    setCourierSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePlayCourierSound = () => {
    setPlayingCourierSound(true);
    playCourierAssignmentSound(courierSettings.soundId, courierSettings.volume, 2);
    setTimeout(() => setPlayingCourierSound(false), 3000);
  };

  const handleSaveCourierSettings = () => {
    saveCourierAssignmentSettings(restaurantId, courierSettings);
    setSavedCourierSettings(courierSettings);
  };

  // Tüm bildirim ayarlarını tek seferde kaydet
  const handleSaveAllNotificationSettings = () => {
    handleSaveNotificationSettings();
    handleSaveCourierSettings();
    toast.success("Bildirim ayarları kaydedildi");
  };

  return (
    <div className="space-y-6" data-testid="restaurant-ayarlar-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">Restoran Ayarları</p>
      </div>

      {/* Sesli Bildirim Ayarları - Tek Kart */}
      <Card>
        <Collapsible open={openSections.notification} onOpenChange={() => toggleSection("notification")}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-lg">Sesli Bildirimler</CardTitle>
                    <CardDescription>Sipariş ve kurye ataması bildirimleri</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(notificationSettings.enabled || courierSettings.enabled) ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-400" />
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${openSections.notification ? "rotate-180" : ""}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Bildirim İzni Uyarısı */}
              {notificationPermission !== 'granted' && (
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm text-amber-800">Bildirim izni gerekli</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleRequestPermission}>
                    İzin Ver
                  </Button>
                </div>
              )}

              {/* ==================== YENİ SİPARİŞ BİLDİRİMİ ==================== */}
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-500" />
                    <Label className="text-base font-medium">Yeni Sipariş Bildirimi</Label>
                  </div>
                  <Switch
                    checked={notificationSettings.enabled}
                    onCheckedChange={(checked) => updateNotificationSetting("enabled", checked)}
                  />
                </div>

                {notificationSettings.enabled && (
                  <div className="space-y-4 pt-2">
                    {/* Ses Seçimi */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Bildirim Sesi</Label>
                      <div className="flex gap-2">
                        <Select
                          value={notificationSettings.soundId}
                          onValueChange={(value) => updateNotificationSetting("soundId", value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Ses seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTIFICATION_SOUNDS.map((sound) => (
                              <SelectItem key={sound.id} value={sound.id}>
                                {sound.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePlaySound}
                          disabled={playingSound}
                          className="gap-1.5"
                        >
                          {playingSound ? (
                            <Volume2 className="w-4 h-4 animate-pulse" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Dinle
                        </Button>
                      </div>
                    </div>

                    {/* Ses Seviyesi */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground">Ses Seviyesi</Label>
                        <span className="text-sm text-muted-foreground">{Math.round(notificationSettings.volume * 100)}%</span>
                      </div>
                      <Slider
                        value={[notificationSettings.volume]}
                        onValueChange={([value]) => updateNotificationSetting("volume", value)}
                        max={1}
                        min={0.1}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ==================== KURYE ATAMASI BİLDİRİMİ ==================== */}
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-green-600" />
                    <Label className="text-base font-medium">Kurye Ataması Bildirimi</Label>
                  </div>
                  <Switch
                    checked={courierSettings.enabled}
                    onCheckedChange={(checked) => updateCourierSetting("enabled", checked)}
                  />
                </div>

                {courierSettings.enabled && (
                  <div className="space-y-4 pt-2">
                    {/* Ses Seçimi */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Onay Sesi</Label>
                      <div className="flex gap-2">
                        <Select
                          value={courierSettings.soundId}
                          onValueChange={(value) => updateCourierSetting("soundId", value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Ses seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {COURIER_ASSIGNMENT_SOUNDS.map((sound) => (
                              <SelectItem key={sound.id} value={sound.id}>
                                {sound.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePlayCourierSound}
                          disabled={playingCourierSound}
                          className="gap-1.5"
                        >
                          {playingCourierSound ? (
                            <Volume2 className="w-4 h-4 animate-pulse" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Dinle
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Ses 2 kez arka arkaya çalınır</p>
                    </div>

                    {/* Ses Seviyesi */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground">Ses Seviyesi</Label>
                        <span className="text-sm text-muted-foreground">{Math.round(courierSettings.volume * 100)}%</span>
                      </div>
                      <Slider
                        value={[courierSettings.volume]}
                        onValueChange={([value]) => updateCourierSetting("volume", value)}
                        max={1}
                        min={0.1}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Kaydet Butonu */}
              <div className="pt-2">
                <Button
                  onClick={handleSaveAllNotificationSettings}
                  disabled={!hasNotificationChanges && !hasCourierChanges}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {(hasNotificationChanges || hasCourierChanges) ? "Kaydet" : "Kaydedildi"}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Otomatik Yazdırma */}
      <Card>
        <Collapsible open={openSections.print} onOpenChange={() => toggleSection("print")}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Printer className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-lg">Otomatik Yazdırma</CardTitle>
                    <CardDescription>Sipariş fişlerini otomatik yazdırma ayarları</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {serverStatus.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-400" />
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${openSections.print ? "rotate-180" : ""}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Bağlantı Durumu ve Butonları */}
              <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                <div className="flex items-center gap-2">
                  {serverStatus.connected ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="text-sm font-medium text-green-700">Bağlı</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-500">Bağlı Değil</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {serverStatus.connected ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDisconnect}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Unplug className="w-4 h-4" />
                      Bağlantıyı Kes
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleConnect}
                      disabled={connecting}
                      className="gap-2"
                    >
                      {connecting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plug className="w-4 h-4" />
                      )}
                      Bağlan
                    </Button>
                  )}
                </div>
              </div>

              {/* Bağlı Değilse - İndirme */}
              {!serverStatus.connected && (
                <div className="p-4 border rounded-lg space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {serverStatus.message || "Yazdırma sunucusu bağlı değil. Programı indirip çalıştırın."}
                  </p>
                  {serverStatus.error && (
                    <p className="text-xs text-red-500 font-mono bg-red-50 p-2 rounded">
                      Hata: {serverStatus.error}
                    </p>
                  )}
                  <a 
                    href="https://drive.google.com/drive/folders/1czq5cwE2jJJ8gupvbiRYUlxUgz-B3RUz"
                    target="_blank"
                    rel="noopener noreferrer"
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
        </Collapsible>
      </Card>
    </div>
  );
}
