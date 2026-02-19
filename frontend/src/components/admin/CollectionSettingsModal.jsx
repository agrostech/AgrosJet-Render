import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Restoran Tahsilat Ayarları Modal
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
          <DialogTitle>Tahsilat Ayarları</DialogTitle>
          <p className="text-sm text-muted-foreground">{restaurant?.name}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Nakit */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Nakit Tahsilatlar</Label>
              <RadioGroup 
                value={cashCollection} 
                onValueChange={setCashCollection}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="courier" id="cash-courier" />
                  <Label htmlFor="cash-courier" className="text-sm font-normal cursor-pointer">
                    Kurye Firması
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="restaurant" id="cash-restaurant" />
                  <Label htmlFor="cash-restaurant" className="text-sm font-normal cursor-pointer">
                    Restoran
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Kredi Kartı */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Kredi Kartı Tahsilatlar</Label>
              <RadioGroup 
                value={cardCollection} 
                onValueChange={setCardCollection}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="courier" id="card-courier" />
                  <Label htmlFor="card-courier" className="text-sm font-normal cursor-pointer">
                    Kurye Firması
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="restaurant" id="card-restaurant" />
                  <Label htmlFor="card-restaurant" className="text-sm font-normal cursor-pointer">
                    Restoran
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Info */}
            <p className="text-xs text-muted-foreground">
              Restoran tahsil ediyorsa mütabakattan hariç tutulur.
            </p>
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
