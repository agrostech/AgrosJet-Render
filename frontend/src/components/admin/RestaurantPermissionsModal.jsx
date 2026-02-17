import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, RefreshCw, Info } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantPermissionsModal({ 
  open, 
  onOpenChange, 
  restaurant 
}) {
  const [permissions, setPermissions] = useState({});
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && restaurant?.id) {
      fetchData();
    }
  }, [open, restaurant?.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // İzin tanımlarını ve mevcut izinleri paralel çek
      const [defsRes, permsRes] = await Promise.all([
        axios.get(`${API}/restaurant-permissions/definitions`),
        axios.get(`${API}/restaurant-permissions/${restaurant.id}`)
      ]);
      
      setDefinitions(defsRes.data.permissions || []);
      setPermissions(permsRes.data.permissions || {});
    } catch (err) {
      console.error("İzinler yüklenemedi:", err);
      toast.error("İzinler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key, currentValue) => {
    const newValue = !currentValue;
    
    // Optimistic update
    setPermissions(prev => ({ ...prev, [key]: newValue }));
    
    try {
      await axios.put(`${API}/restaurant-permissions/${restaurant.id}`, {
        permission_key: key,
        value: newValue
      });
      
      const label = definitions.find(d => d.key === key)?.label || key;
      toast.success(`${label} ${newValue ? "aktif" : "pasif"} edildi`);
    } catch (err) {
      // Revert on error
      setPermissions(prev => ({ ...prev, [key]: currentValue }));
      toast.error(err.response?.data?.detail || "İzin güncellenemedi");
    }
  };

  const handleReset = async () => {
    if (!confirm("Tüm izinleri varsayılana sıfırlamak istediğinize emin misiniz?")) {
      return;
    }
    
    setSaving(true);
    try {
      const res = await axios.post(`${API}/restaurant-permissions/${restaurant.id}/reset`);
      setPermissions(res.data.permissions || {});
      toast.success("İzinler varsayılana sıfırlandı");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sıfırlama başarısız");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            İzinler - {restaurant?.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {definitions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Henüz tanımlı izin bulunmuyor
              </p>
            ) : (
              definitions.map((def) => (
                <div 
                  key={def.key} 
                  className="flex items-start justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 pr-4">
                    <Label className="font-medium cursor-pointer" htmlFor={def.key}>
                      {def.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {def.description}
                    </p>
                  </div>
                  <Switch
                    id={def.key}
                    checked={permissions[def.key] || false}
                    onCheckedChange={() => handleToggle(def.key, permissions[def.key])}
                  />
                </div>
              ))
            )}

            {definitions.length > 0 && (
              <div className="pt-2 border-t">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Bu izinler restoran panelinde yapılabilecek işlemleri kontrol eder.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handleReset}
            disabled={loading || saving}
            className="text-destructive hover:text-destructive"
          >
            Varsayılana Sıfırla
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
