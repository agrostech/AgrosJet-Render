import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ImageIcon,
} from "lucide-react";

export default function CartModal({
  open,
  onOpenChange,
  cart,
  balance,
  cartTotal,
  cartItemCount,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Sepetim ({cartItemCount} ürün)
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {cart.map((item) => (
            <CartItem
              key={item.product_id}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
            />
          ))}
        </div>

        <CartSummary
          cartTotal={cartTotal}
          balance={balance}
          onCheckout={onCheckout}
        />
      </DialogContent>
    </Dialog>
  );
}

function CartItem({ item, onUpdateQuantity, onRemoveItem }) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg">
      <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover rounded" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.product_name}</p>
        <p className="text-sm text-amber-600 font-semibold">{item.price} JP</p>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="icon" 
          variant="outline" 
          className="h-8 w-8"
          onClick={() => onUpdateQuantity(item.product_id, -1)}
        >
          <Minus className="w-3 h-3" />
        </Button>
        <span className="w-8 text-center font-semibold">{item.quantity}</span>
        <Button 
          size="icon" 
          variant="outline" 
          className="h-8 w-8"
          onClick={() => onUpdateQuantity(item.product_id, 1)}
        >
          <Plus className="w-3 h-3" />
        </Button>
        <Button 
          size="icon" 
          variant="outline" 
          className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
          onClick={() => onRemoveItem(item.product_id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function CartSummary({ cartTotal, balance, onCheckout }) {
  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-medium">Toplam:</span>
        <span className="text-2xl font-bold text-amber-600">{cartTotal} JP</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">Bakiyeniz:</span>
        <span className={balance >= cartTotal ? 'text-green-600' : 'text-red-600'}>
          {balance.toFixed(2)} JP
        </span>
      </div>
      {balance < cartTotal && (
        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
          Yetersiz bakiye! {(cartTotal - balance).toFixed(2)} JP daha gerekiyor.
        </p>
      )}
      <Button 
        onClick={onCheckout} 
        disabled={balance < cartTotal}
        className="w-full h-12 font-semibold bg-amber-600 hover:bg-amber-700"
        data-testid="checkout-btn"
      >
        Sipariş Ver
      </Button>
    </div>
  );
}
