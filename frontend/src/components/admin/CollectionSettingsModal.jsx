import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Banknote, CreditCard, Building2, Users, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Restoran Tahsilat Ayarları Modal
 * 
 * Nakit ve Kredi Kartı tahsilatlarının kim tarafından yapılacağını belirler.
 * - "courier": Kurye firması tahsil eder (mütabakata dahil)
 * - "restaurant": Restoran kendi tahsil eder (mütabakattan hariç)
 */
export default function CollectionSettingsModal({ 
  open, 
  onOpenChange, 
  restaurant,
  onSaved 
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cashCollection, setCashCollection] = useState("courier");
  const [cardCollection, setCardCollection] = useState("courier");

  // Load current settings
  useEffect(() => {
    if (open && restaurant?.id) {
      loadSettings();
    }
  }, [open, restaurant?.id]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurants/collection-settings/${restaurant.id}`);
      setCashCollection(res.data.cash_collection || "courier");
      setCardCollection(res.data.card_collection || "courier");
    } catch (err) {
      // Default değerler kullan
      setCashCollection("courier");
      setCardCollection("courier");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/restaurants/collection-settings/${restaurant.id}`, {
        cash_collection: cashCollection,
        card_collection: cardCollection
      });
      toast.success("Tahsilat ayarları kaydedildi");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Tahsilat Ayarları
          </DialogTitle>
          <DialogDescription>
            {restaurant?.name} için nakit ve kredi kartı tahsilat yönetimi
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Nakit Tahsilatlar */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-green-600" />
                <Label className="text-sm font-semibold">Nakit Tahsilatlar</Label>
              </div>
              <RadioGroup 
                value={cashCollection} 
                onValueChange={setCashCollection}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="cash-courier"
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    cashCollection === "courier" 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <RadioGroupItem value="courier" id="cash-courier" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">Kurye Firması</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Biz tahsil ederiz</p>
                  </div>
                </Label>
                <Label
                  htmlFor="cash-restaurant"
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    cashCollection === "restaurant" 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <RadioGroupItem value="restaurant" id="cash-restaurant" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-orange-600" />
                      <span className="font-medium text-sm">Restoran</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Kendileri tahsil eder</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Kredi Kartı Tahsilatlar */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <Label className="text-sm font-semibold">Kredi Kartı Tahsilatlar</Label>
              </div>
              <RadioGroup 
                value={cardCollection} 
                onValueChange={setCardCollection}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="card-courier"
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    cardCollection === "courier" 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <RadioGroupItem value="courier" id="card-courier" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">Kurye Firması</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Biz tahsil ederiz</p>
                  </div>
                </Label>
                <Label
                  htmlFor="card-restaurant"
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    cardCollection === "restaurant" 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <RadioGroupItem value="restaurant" id="card-restaurant" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-orange-600" />
                      <span className="font-medium text-sm">Restoran</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Kendileri tahsil eder</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                <strong>Not:</strong> Restoran tarafından tahsil edilen ödemeler mütabakat hesaplamalarına dahil edilmez ve tabloda siyah renkte gösterilir.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
