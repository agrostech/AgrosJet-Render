import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AddProductModal({
  open,
  onOpenChange,
  productTypes,
  onAddProduct,
}) {
  const [newProduct, setNewProduct] = useState({
    name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: ""
  });

  const selectedType = productTypes.find(t => t.id === newProduct.product_type_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await onAddProduct(newProduct);
    if (success) {
      setNewProduct({ name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: "" });
      onOpenChange(false);
    }
  };

  const handleClose = (open) => {
    if (!open) {
      setNewProduct({ name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: "" });
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Ürün Ekle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Ürün Adı *</Label>
            <Input
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              placeholder="Örn: POS Cihazı #1"
            />
          </div>
          <div className="space-y-2">
            <Label>Ürün Tipi *</Label>
            <Select 
              value={newProduct.product_type_id} 
              onValueChange={(v) => setNewProduct({ ...newProduct, product_type_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tip seçin..." />
              </SelectTrigger>
              <SelectContent>
                {productTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productTypes.length === 0 && (
              <p className="text-xs text-orange-600">Önce ürün tipi oluşturun</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Seri Numarası</Label>
            <Input
              value={newProduct.serial_number}
              onChange={(e) => setNewProduct({ ...newProduct, serial_number: e.target.value })}
              placeholder="Opsiyonel"
            />
          </div>
          {selectedType?.has_pos_fields && (
            <>
              <div className="space-y-2">
                <Label>POS Cihazı Seri No</Label>
                <Input
                  value={newProduct.pos_serial}
                  onChange={(e) => setNewProduct({ ...newProduct, pos_serial: e.target.value })}
                  placeholder="POS seri numarası"
                />
              </div>
              <div className="space-y-2">
                <Label>Banka Terminal No</Label>
                <Input
                  value={newProduct.pos_terminal}
                  onChange={(e) => setNewProduct({ ...newProduct, pos_terminal: e.target.value })}
                  placeholder="Terminal numarası"
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Notlar</Label>
            <Input
              value={newProduct.notes}
              onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })}
              placeholder="Opsiyonel notlar"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>İptal</Button>
            <Button type="submit">Ekle</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProductModal({
  open,
  onOpenChange,
  product,
  productTypes,
  onEditProduct,
}) {
  const [editProduct, setEditProduct] = useState({
    id: "", name: "", product_type_id: "", serial_number: "", pos_serial: "", pos_terminal: "", notes: ""
  });

  useEffect(() => {
    if (product) {
      setEditProduct({
        id: product.id,
        name: product.name,
        product_type_id: product.product_type_id,
        serial_number: product.serial_number || "",
        pos_serial: product.pos_serial || "",
        pos_terminal: product.pos_terminal || "",
        notes: product.notes || ""
      });
    }
  }, [product]);

  const selectedType = productTypes.find(t => t.id === editProduct.product_type_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await onEditProduct(editProduct.id, {
      name: editProduct.name,
      product_type_id: editProduct.product_type_id,
      serial_number: editProduct.serial_number,
      pos_serial: editProduct.pos_serial,
      pos_terminal: editProduct.pos_terminal,
      notes: editProduct.notes
    });
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ürünü Düzenle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Ürün Adı *</Label>
            <Input
              value={editProduct.name}
              onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
              placeholder="Ürün adı"
            />
          </div>
          <div className="space-y-2">
            <Label>Ürün Tipi *</Label>
            <Select 
              value={editProduct.product_type_id} 
              onValueChange={(v) => setEditProduct({ ...editProduct, product_type_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tip seçin..." />
              </SelectTrigger>
              <SelectContent>
                {productTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Seri Numarası</Label>
            <Input
              value={editProduct.serial_number}
              onChange={(e) => setEditProduct({ ...editProduct, serial_number: e.target.value })}
              placeholder="Opsiyonel"
            />
          </div>
          {selectedType?.has_pos_fields && (
            <>
              <div className="space-y-2">
                <Label>Pos SN</Label>
                <Input
                  value={editProduct.pos_serial}
                  onChange={(e) => setEditProduct({ ...editProduct, pos_serial: e.target.value })}
                  placeholder="POS seri numarası"
                />
              </div>
              <div className="space-y-2">
                <Label>Terminal No</Label>
                <Input
                  value={editProduct.pos_terminal}
                  onChange={(e) => setEditProduct({ ...editProduct, pos_terminal: e.target.value })}
                  placeholder="Terminal numarası"
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Notlar</Label>
            <Input
              value={editProduct.notes}
              onChange={(e) => setEditProduct({ ...editProduct, notes: e.target.value })}
              placeholder="Opsiyonel notlar"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
