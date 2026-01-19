import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

export function CourierEditModal({ open, onOpenChange, courier, onSave }) {
  const [editData, setEditData] = useState({ 
    name: courier?.name || "", 
    phone: courier?.phone || "", 
    plate: courier?.plate || "", 
    address: courier?.address || "", 
    password: "" 
  });
  const [loading, setLoading] = useState(false);

  // Reset form when courier changes
  if (courier && editData.name !== courier.name && editData.phone !== courier.phone) {
    setEditData({
      name: courier.name || "",
      phone: courier.phone || "",
      plate: courier.plate || "",
      address: courier.address || "",
      password: ""
    });
  }

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

      if (Object.keys(updatePayload).length === 0) {
        return;
      }

      await onSave(courier.id, updatePayload);
      onOpenChange(false);
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
            
            <div>
              <Label className="text-xs sm:text-sm font-semibold">Plaka</Label>
              <Input value={editData.plate} onChange={(e) => setEditData({ ...editData, plate: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 font-mono uppercase text-sm" />
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
