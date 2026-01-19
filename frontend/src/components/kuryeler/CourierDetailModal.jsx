import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, FileText } from "lucide-react";
import CourierDocumentsSection from "@/components/admin/CourierDocumentsSection";

export function CourierDetailModal({ open, onOpenChange, courier, companyName }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Kurye Detayları</DialogTitle>
        </DialogHeader>
        {courier && (
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="info" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Bilgiler
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Evraklar
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
