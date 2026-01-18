import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Package, Plus, CreditCard, Trash2 } from "lucide-react";
import { formatMoney, formatDate, getLocalDateTimeString } from "@/hooks/useAccountingTab";

// İşlem Düzenleme Modal
export function EditTransactionModal({
  editingTx,
  setEditingTx,
  editForm,
  setEditForm,
  editLoading,
  onSubmit,
}) {
  return (
    <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            İşlem Düzenle
          </DialogTitle>
        </DialogHeader>
        {editingTx && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded border">
              <p className="text-xs text-muted-foreground">Tarih</p>
              <p className="font-mono text-sm">{formatDate(editingTx.created_at)}</p>
            </div>
            
            <div>
              <Label className="text-sm font-semibold">Tutar (TL)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                onWheel={(e) => e.target.blur()}
                className="mt-1 h-11 border-2 font-mono"
                data-testid="edit-tx-amount"
              />
            </div>
            
            <div>
              <Label className="text-sm font-semibold">Açıklama</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="mt-1 h-11 border-2"
                data-testid="edit-tx-description"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-hakedis"
                checked={editForm.is_hakedis}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_hakedis: checked })}
                data-testid="edit-tx-hakedis"
              />
              <Label htmlFor="edit-hakedis" className="text-sm font-medium cursor-pointer">Hakediş</Label>
            </div>
            
            <Button onClick={onSubmit} className="w-full h-11 font-semibold" disabled={editLoading} data-testid="submit-edit-tx">
              {editLoading ? "Güncelleniyor..." : "Kaydet"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Taksitli Ürün Ekle Modal
export function AddInstallmentModal({
  open,
  onOpenChange,
  newProduct,
  setNewProduct,
  addingProduct,
  onSubmit,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            Taksitli Ürün Ekle
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Ürün Adı</Label>
            <Input
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              className="mt-1 h-11 border-2"
              placeholder="Örn: Motosiklet"
              required
              data-testid="installment-product-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-semibold">Taksit Tutarı (TL)</Label>
              <Input
                type="number"
                step="0.01"
                value={newProduct.installment_amount}
                onChange={(e) => setNewProduct({ ...newProduct, installment_amount: e.target.value })}
                onWheel={(e) => e.target.blur()}
                className="mt-1 h-11 border-2 font-mono"
                placeholder="2500"
                required
                data-testid="installment-amount"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Taksit Sayısı</Label>
              <Input
                type="number"
                value={newProduct.installment_count}
                onChange={(e) => setNewProduct({ ...newProduct, installment_count: e.target.value })}
                onWheel={(e) => e.target.blur()}
                className="mt-1 h-11 border-2 font-mono"
                placeholder="20"
                required
                data-testid="installment-count"
              />
            </div>
          </div>
          
          {newProduct.installment_amount && newProduct.installment_count && (
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex justify-between items-center">
                <span className="text-sm text-purple-800">Toplam Tutar</span>
                <span className="text-lg font-bold font-mono text-purple-900">
                  {formatMoney(parseFloat(newProduct.installment_amount || 0) * parseInt(newProduct.installment_count || 0))}
                </span>
              </div>
            </div>
          )}
          
          <Button type="submit" className="w-full h-11 font-semibold bg-purple-600 hover:bg-purple-700" disabled={addingProduct} data-testid="submit-installment-product">
            {addingProduct ? "Ekleniyor..." : "Ürün Ekle"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Taksitli Ürünler Listesi Modal
export function InstallmentListModal({
  open,
  onOpenChange,
  installmentProducts,
  totalRemainingInstallments,
  payingInstallment,
  useInstallmentCustomDate,
  setUseInstallmentCustomDate,
  installmentDate,
  setInstallmentDate,
  onPayInstallment,
  onDeleteProduct,
  onOpenAddModal,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            Taksitli Ürünler
            {totalRemainingInstallments > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                {totalRemainingInstallments} taksit kaldı
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {installmentProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Taksitli ürün bulunmuyor</p>
            </div>
          ) : (
            installmentProducts.map((product) => (
              <InstallmentProductItem
                key={product.id}
                product={product}
                payingInstallment={payingInstallment}
                onPayInstallment={onPayInstallment}
                onDeleteProduct={onDeleteProduct}
              />
            ))
          )}
          
          {installmentProducts.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Checkbox
                id="installment-custom-date-modal"
                checked={useInstallmentCustomDate}
                onCheckedChange={(checked) => {
                  setUseInstallmentCustomDate(checked);
                  if (checked && !installmentDate) {
                    setInstallmentDate(getLocalDateTimeString());
                  }
                }}
              />
              <Label htmlFor="installment-custom-date-modal" className="text-xs cursor-pointer">Özel tarih ile taksit al</Label>
              {useInstallmentCustomDate && (
                <Input
                  type="datetime-local"
                  value={installmentDate}
                  onChange={(e) => setInstallmentDate(e.target.value)}
                  className="h-8 border text-xs w-auto"
                />
              )}
            </div>
          )}
          
          <Button
            variant="outline"
            onClick={onOpenAddModal}
            className="w-full h-10 border-dashed border-purple-300 text-purple-700 hover:bg-purple-50"
            data-testid="add-installment-product-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Yeni Taksitli Ürün Ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstallmentProductItem({ product, payingInstallment, onPayInstallment, onDeleteProduct }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg border">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-semibold">{product.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatMoney(product.installment_amount)} x {product.installment_count} = {formatMoney(product.total_amount)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all"
                style={{ width: `${((product.installment_count - product.remaining_installments) / product.installment_count) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-purple-700 font-semibold">
              {product.installment_count - product.remaining_installments}/{product.installment_count}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Ödenen: {formatMoney(product.paid_amount)} / Kalan: {formatMoney(product.total_amount - product.paid_amount)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 ml-3">
          {product.remaining_installments > 0 && (
            <Button
              size="sm"
              onClick={() => onPayInstallment(product)}
              disabled={payingInstallment === product.id}
              className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
              data-testid={`pay-installment-${product.id}`}
            >
              {payingInstallment === product.id ? "..." : `Taksit Al (${product.remaining_installments})`}
            </Button>
          )}
          {product.paid_amount === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteProduct(product)}
              className="h-8 text-xs hover:bg-red-50 hover:text-red-600"
              data-testid={`delete-product-${product.id}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Sil
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
