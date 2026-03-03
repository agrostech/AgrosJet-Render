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
 * Nakit, Kredi Kartı ve Yemek Kartı tahsilatlarını yönetir
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
  const [mealCardCollection, setMealCardCollection] = useState("courier");

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
      setMealCardCollection(res.data.meal_card_collection || "courier");
    } catch (err) {
      setCashCollection("courier");
      setCardCollection("courier");
      setMealCardCollection("courier");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/restaurants/collection-settings/${restaurant.id}`, {
        cash_collection: cashCollection,
        card_collection: cardCollection,
        meal_card_collection: mealCardCollection
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

  const CollectionOption = ({ label, value, onChange }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <RadioGroup 
        value={value} 
        onValueChange={onChange}
        className="flex gap-6"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="courier" id={`${label}-courier`} />
          <Label 
            htmlFor={`${label}-courier`} 
            className={`text-sm font-normal cursor-pointer ${value === 'courier' ? 'text-green-600 font-medium' : ''}`}
          >
            Şirket
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="restaurant" id={`${label}-restaurant`} />
          <Label 
            htmlFor={`${label}-restaurant`} 
            className={`text-sm font-normal cursor-pointer ${value === 'restaurant' ? 'text-slate-900 font-medium' : ''}`}
          >
            Restoran
          </Label>
        </div>
      </RadioGroup>
    </div>
  );

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
          <div className="space-y-5 py-2">
            <CollectionOption 
              label="Nakit Tahsilatlar" 
              value={cashCollection} 
              onChange={setCashCollection} 
            />
            <CollectionOption 
              label="Kredi Kartı Tahsilatlar" 
              value={cardCollection} 
              onChange={setCardCollection} 
            />
            <CollectionOption 
              label="Yemek Kartı Tahsilatlar" 
              value={mealCardCollection} 
              onChange={setMealCardCollection} 
            />

            <p className="text-xs text-muted-foreground border-t pt-3">
              Restoran tahsil ediyorsa mütabakat ve raporlara dahil edilmez.
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
