import { CreditCard, ChevronDown, ChevronUp } from "lucide-react";

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export default function InstallmentSection({ installmentProducts, installmentsExpanded, setInstallmentsExpanded }) {
  const totalRemainingInstallments = installmentProducts.reduce((sum, p) => {
    if ((p.installment_type || "fixed") === "percent") return sum;
    return sum + (p.remaining_installments || 0);
  }, 0);
  const percentCount = installmentProducts.filter(p => (p.installment_type || "fixed") === "percent").length;
  
  if (installmentProducts.length === 0) return null;

  return (
    <div className="border-b-2 border-border">
      <button 
        onClick={() => setInstallmentsExpanded(!installmentsExpanded)}
        className="w-full p-3 sm:p-4 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-purple-600" />
          <h3 className="font-semibold text-sm sm:text-base">Taksitli Ürünler</h3>
          {totalRemainingInstallments > 0 && (
            <span className="text-[10px] sm:text-xs bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
              {totalRemainingInstallments} taksit
            </span>
          )}
          {percentCount > 0 && (
            <span className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
              {percentCount} yüzdeli
            </span>
          )}
        </div>
        {installmentsExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {installmentsExpanded && (
        <div className="divide-y divide-border">
          {installmentProducts.map((product) => (
            <InstallmentProductItem key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstallmentProductItem({ product }) {
  const isPercent = (product.installment_type || "fixed") === "percent";
  
  if (isPercent) {
    const totalAmount = product.total_amount || 0;
    const paidAmount = product.paid_amount || 0;
    const remainingAmount = product.remaining_amount ?? (totalAmount - paidAmount);
    const progressPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
    
    return (
      <div className="p-3 sm:p-4 bg-amber-50/50">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{product.name}</p>
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                %{product.withdrawal_percent}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Toplam: {formatMoney(totalAmount)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-amber-700">
              {progressPercent.toFixed(0)}%
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Kalan: {formatMoney(remainingAmount)}
            </p>
          </div>
        </div>
        <div className="mt-2 bg-amber-100 rounded-full h-1.5 sm:h-2">
          <div 
            className="bg-amber-600 h-1.5 sm:h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
        <p className="text-[10px] text-amber-700 mt-1.5 italic">
          Her ödeme talebinde %{product.withdrawal_percent} taksit kesintisi otomatik uygulanır
        </p>
      </div>
    );
  }
  
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatMoney(product.installment_amount)} x {product.installment_count}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-purple-600">
            {product.installment_count - product.remaining_installments}/{product.installment_count}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Kalan: {formatMoney(product.total_amount - product.paid_amount)}
          </p>
        </div>
      </div>
      <div className="mt-2 bg-slate-200 rounded-full h-1.5 sm:h-2">
        <div 
          className="bg-purple-600 h-1.5 sm:h-2 rounded-full transition-all"
          style={{ width: `${((product.installment_count - product.remaining_installments) / product.installment_count) * 100}%` }}
        />
      </div>
    </div>
  );
}
