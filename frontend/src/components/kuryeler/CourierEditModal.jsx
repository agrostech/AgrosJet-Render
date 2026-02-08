import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Coffee } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Mola süresi seçenekleri (dakika)
const BREAK_LIMIT_OPTIONS = [
  { value: 15, label: "15 dakika" },
  { value: 30, label: "30 dakika" },
  { value: 45, label: "45 dakika" },
  { value: 60, label: "1 saat" },
  { value: 90, label: "1.5 saat" },
  { value: 120, label: "2 saat" },
];

export function CourierEditModal({ open, onOpenChange, courier, onSave }) {
  const [editData, setEditData] = useState({ 
    name: courier?.name || "", 
    phone: courier?.phone || "", 
    plate: courier?.plate || "", 
    address: courier?.address || "", 
    password: "",
    daily_break_limit: courier?.daily_break_limit || 30
  });
  const [loading, setLoading] = useState(false);

  // Reset form when courier changes
  useEffect(() => {
    if (courier) {
      setEditData({
        name: courier.name || "",
        phone: courier.phone || "",
        plate: courier.plate || "",
        address: courier.address || "",
        password: "",
        daily_break_limit: courier.daily_break_limit || 30
      });
    }
  }, [courier?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updatePayload = {};
      if (editData.name && editData.name !== courier.name) updatePayload.name = editData.name;
      if (editData.phone && editData.phone !== courier.phone) updatePayload.phone = editData.phone;
      if (editData.plate && editData.plate !== courier.plate) updatePayload.plate = editData.plate;
      if (editData.address !== courier.address) updatePayload.address = editData.address;
      if (editData.password) updatePayload.password = editData.password;

      // Mola süresi değiştiyse ayrı endpoint'e gönder
      if (editData.daily_break_limit !== (courier.daily_break_limit || 30)) {
        await axios.put(`${API}/couriers/${courier.id}/break-limit`, {
          daily_break_limit: editData.daily_break_limit
        });
        toast.success(`Mola limiti güncellendi: ${editData.daily_break_limit} dakika`);
      }

      if (Object.keys(updatePayload).length > 0) {
        await onSave(courier.id, updatePayload);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-base sm:text-lg">
            <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
            Kurye Düzenle
          </DialogTitle>
        </DialogHeader>
        {courier && (
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div className="p-2 sm:p-3 bg-slate-50 rounded border">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Düzenlenen Kurye</p>
              <p className="font-semibold text-sm sm:text-base">{courier.name}</p>
              <p className="text-xs sm:text-sm text-muted-foreground font-mono">{courier.phone}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div>
                <Label className="text-xs sm:text-sm font-semibold">İsim Soyisim</Label>
                <Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" />
              </div>
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Telefon</Label>
                <Input value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 font-mono text-sm" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Plaka</Label>
                <Input value={editData.plate} onChange={(e) => setEditData({ ...editData, plate: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 font-mono uppercase text-sm" />
              </div>
              <div>
                <Label className="text-xs sm:text-sm font-semibold flex items-center gap-1">
                  <Coffee className="w-3.5 h-3.5" />
                  Günlük Mola
                </Label>
                <Select 
                  value={String(editData.daily_break_limit)} 
                  onValueChange={(val) => setEditData({ ...editData, daily_break_limit: parseInt(val) })}
                >
                  <SelectTrigger className="mt-1 h-9 sm:h-10 border-2 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BREAK_LIMIT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label className="text-xs sm:text-sm font-semibold">Adres</Label>
              <Input value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" />
            </div>
            
            <div>
              <Label className="text-xs sm:text-sm font-semibold">Yeni Şifre</Label>
              <Input type="password" value={editData.password} onChange={(e) => setEditData({ ...editData, password: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" placeholder="Boş bırakın" />
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded p-2 sm:p-3 text-[10px] sm:text-xs text-amber-700">
              <strong>Not:</strong> Şifre değiştirildiğinde kurye yeniden giriş yapmak zorunda kalacaktır.
            </div>
            
            <Button type="submit" className="w-full h-10 sm:h-11 font-semibold text-sm" disabled={loading}>
              {loading ? "Güncelleniyor..." : "Kaydet"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
