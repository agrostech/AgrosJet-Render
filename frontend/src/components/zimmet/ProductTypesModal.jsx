import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function ProductTypesModal({
  open,
  onOpenChange,
  productTypes,
  onAddType,
  onEditType,
  onDeleteType,
}) {
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeHasPos, setNewTypeHasPos] = useState(false);
  const [editingType, setEditingType] = useState(null);

  const handleAdd = async () => {
    const success = await onAddType(newTypeName, newTypeHasPos);
    if (success) {
      setNewTypeName("");
      setNewTypeHasPos(false);
    }
  };

  const handleEdit = async () => {
    if (!editingType) return;
    const success = await onEditType(editingType.id, editingType.name, editingType.has_pos_fields);
    if (success) {
      setEditingType(null);
    }
  };

  const handleClose = (open) => {
    if (!open) setEditingType(null);
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ürün Tipleri</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add new type */}
          <div className="flex gap-2">
            <Input
              placeholder="Yeni tip adı..."
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAdd} disabled={!newTypeName.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox 
              id="hasPos" 
              checked={newTypeHasPos} 
              onCheckedChange={setNewTypeHasPos}
            />
            <Label htmlFor="hasPos" className="text-sm">POS Cihazı (Seri No + Terminal No alanları)</Label>
          </div>

          {/* Types list */}
          <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
            {productTypes.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Henüz ürün tipi yok</p>
            ) : (
              productTypes.map((type) => (
                <div key={type.id} className="p-3">
                  {editingType?.id === type.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editingType.name}
                        onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                        className="h-8"
                      />
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id={`editHasPos-${type.id}`}
                          checked={editingType.has_pos_fields} 
                          onCheckedChange={(checked) => setEditingType({ ...editingType, has_pos_fields: checked })}
                        />
                        <Label htmlFor={`editHasPos-${type.id}`} className="text-xs">POS alanları</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleEdit}>Kaydet</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingType(null)}>İptal</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{type.name}</p>
                        {type.has_pos_fields && (
                          <p className="text-xs text-muted-foreground">POS alanları aktif</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingType({ id: type.id, name: type.name, has_pos_fields: type.has_pos_fields })}>
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDeleteType(type.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
