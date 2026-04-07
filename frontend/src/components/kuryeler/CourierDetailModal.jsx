import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, FileText, Clock, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import CourierDocumentsSection from "@/components/admin/CourierDocumentsSection";
import CourierShiftsSection from "@/components/kuryeler/CourierShiftsSection";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function CourierDetailModal({ open, onOpenChange, courier, companyId, companyName }) {
  const handleViewContract = async () => {
    if (!courier?.id) return;
    try {
      const token = JSON.parse(localStorage.getItem("user") || "{}").token;
      const res = await fetch(`${API}/contracts/pdf/${courier.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("PDF alınamadı");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Contract PDF error:", err);
    }
  };

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
                <div>
                  <p className="text-xs text-muted-foreground">TC Kimlik</p>
                  <p className="font-mono text-sm">{courier.tc_kimlik || courier.tc_no || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sözleşme</p>
                  {courier.contract_accepted ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600 font-medium">Onaylı</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-amber-600 font-medium">Bekliyor</span>
                    </div>
                  )}
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
              {courier.contract_accepted && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full border-2"
                  onClick={handleViewContract}
                  data-testid="view-contract-pdf-btn"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  E-İmzalı Sözleşme PDF
                  <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              )}
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
