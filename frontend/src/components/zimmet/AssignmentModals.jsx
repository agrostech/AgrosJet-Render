import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AssignModal({
  open,
  onOpenChange,
  product,
  couriers,
  onAssign,
}) {
  const [courierId, setCourierId] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const success = await onAssign(product, courierId, notes);
    if (success) {
      setCourierId("");
      setNotes("");
      onOpenChange(false);
    }
  };

  const handleClose = (open) => {
    if (!open) {
      setCourierId("");
      setNotes("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ürünü Zimmetle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border">
            <p className="font-semibold">{product?.name}</p>
            <p className="text-sm text-muted-foreground">{product?.product_type_name}</p>
          </div>
          <div className="space-y-2">
            <Label>Kurye Seçin *</Label>
            <Select value={courierId} onValueChange={setCourierId}>
              <SelectTrigger>
                <SelectValue placeholder="Kurye seçin..." />
              </SelectTrigger>
              <SelectContent>
                {couriers.map((courier) => (
                  <SelectItem key={courier.id} value={courier.id}>{courier.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Not</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsiyonel not"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>İptal</Button>
          <Button onClick={handleSubmit} disabled={!courierId}>Zimmetle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnModal({
  open,
  onOpenChange,
  product,
  onReturn,
}) {
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const success = await onReturn(product, notes);
    if (success) {
      setNotes("");
      onOpenChange(false);
    }
  };

  const handleClose = (open) => {
    if (!open) {
      setNotes("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zimmeti Geri Al</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border">
            <p className="font-semibold">{product?.name}</p>
            <p className="text-sm text-blue-600">{product?.assigned_to_courier_name}</p>
          </div>
          <div className="space-y-2">
            <Label>Not</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsiyonel not"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>İptal</Button>
          <Button onClick={handleSubmit} variant="destructive">Geri Al</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
