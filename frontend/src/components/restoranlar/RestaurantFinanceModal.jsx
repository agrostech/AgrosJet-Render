import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Banknote, Save, Store } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function RestaurantFinanceModal({ open, onOpenChange, restaurant, companyId }) {
  const [activeTab, setActiveTab] = useState("delivery");
  const [loading, setLoading] = useState(false);
  
  // Taşıma Finansı
  const [serviceFee, setServiceFee] = useState("");
  
  // Load existing data
  useEffect(() => {
    if (open && restaurant) {
      loadFinanceData();
    }
  }, [open, restaurant]);

  const loadFinanceData = async () => {
    try {
      const res = await axios.get(`${API}/restaurants/${restaurant.id}/finance`);
      if (res.data) {
        setServiceFee(res.data.service_fee_per_package?.toString() || "");
      }
    } catch (err) {
      // Finance data might not exist yet
      setServiceFee("");
    }
  };

  const handleSaveDeliveryFinance = async () => {
    if (!serviceFee || isNaN(parseFloat(serviceFee))) {
      toast.error("Geçerli bir ücret girin");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/restaurants/${restaurant.id}/finance`, {
        service_fee_per_package: parseFloat(serviceFee),
        company_id: companyId
      });
      toast.success("Hizmet ücreti kaydedildi");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme hatası");
    } finally {
      setLoading(false);
    }
  };

  if (!restaurant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            {restaurant.name} - Finans
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="delivery" className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Taşıma Finansı
            </TabsTrigger>
            <TabsTrigger value="collection" className="flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              Tahsilat Finansı
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="mt-4 space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border">
              <Label className="text-sm font-medium">Paket Başı Hizmet Ücreti</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Her teslim edilen paket için restorandan alınacak hizmet ücreti
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                />
                <span className="text-sm font-medium text-muted-foreground">₺</span>
              </div>
            </div>

            <Button 
              onClick={handleSaveDeliveryFinance} 
              disabled={loading}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </TabsContent>

          <TabsContent value="collection" className="mt-4">
            <div className="p-8 text-center text-muted-foreground">
              <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Tahsilat finansı yakında eklenecek</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
