import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, FileText, Clock, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryCharging, Zap } from "lucide-react";
import CourierDocumentsSection from "@/components/admin/CourierDocumentsSection";
import CourierShiftsSection from "@/components/kuryeler/CourierShiftsSection";

// Batarya gösterimi için yardımcı fonksiyon
const BatteryDisplay = ({ battery }) => {
  if (!battery || battery.level === null || battery.level === undefined) {
    return null;
  }
  
  const percent = Math.round(battery.level * 100);
  const isCharging = battery.state === 'charging';
  
  let colorClass = 'text-green-600';
  let BatteryIcon = BatteryFull;
  
  if (percent <= 20) {
    colorClass = 'text-red-500';
    BatteryIcon = BatteryLow;
  } else if (percent <= 50) {
    colorClass = 'text-yellow-500';
    BatteryIcon = BatteryMedium;
  }
  
  if (isCharging) {
    BatteryIcon = BatteryCharging;
    colorClass = 'text-blue-500';
  }
  
  return (
    <div className="flex items-center gap-1">
      <BatteryIcon className={`w-4 h-4 ${colorClass}`} />
      <span className={`text-sm font-medium ${colorClass}`}>{percent}%</span>
      {isCharging && <Zap className="w-3 h-3 text-blue-500" />}
    </div>
  );
};

export function CourierDetailModal({ open, onOpenChange, courier, companyId, companyName }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Kurye Detayları</DialogTitle>
        </DialogHeader>
        {courier && (
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="info" className="flex items-center gap-1 text-xs sm:text-sm">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Bilgiler</span>
              </TabsTrigger>
              <TabsTrigger value="shifts" className="flex items-center gap-1 text-xs sm:text-sm">
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Vardiyalar</span>
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1 text-xs sm:text-sm">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Evraklar</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">İsim Soyisim</p>
                  <p className="font-semibold">{courier.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefon</p>
                  <p className="font-mono">{courier.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plaka</p>
                  <p className="font-mono">{courier.plate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kayıt Tarihi</p>
                  <p className="font-mono text-sm">{new Date(courier.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
                {courier.battery && courier.battery.level !== null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Batarya</p>
                    <BatteryDisplay battery={courier.battery} />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Adres</p>
                <p className="text-sm">{courier.address || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">İban</p>
                <p className="font-mono text-sm break-all">{courier.iban || "-"}</p>
              </div>
            </TabsContent>
            
            <TabsContent value="shifts">
              <CourierShiftsSection 
                courierId={courier.id}
                courierName={courier.name}
                companyId={companyId}
              />
            </TabsContent>
            
            <TabsContent value="documents">
              <CourierDocumentsSection 
                courierId={courier.id}
                courierName={courier.name}
                companyName={companyName}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
