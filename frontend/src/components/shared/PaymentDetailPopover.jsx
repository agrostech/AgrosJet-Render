import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Ödeme detayı popover componenti
 * Değiştirilen veya parçalı ödemelerin detaylarını gösterir
 * Mobil ve masaüstü uyumlu (tıklama ile açılır)
 */
export function PaymentDetailPopover({ 
  paymentMethod,
  paymentDetails,
  totalAmount,
  showTriggerText = false,
  triggerClassName = ""
}) {
  if (!paymentDetails || (!paymentDetails.original_method && paymentMethod !== "mixed")) {
    return null;
  }

  const originalMethod = paymentDetails.original_method;
  const cashAmount = paymentDetails.cash_amount || 0;
  const cardAmount = paymentDetails.card_amount || 0;
  const isMixed = paymentMethod === "mixed" || (cashAmount > 0 && cardAmount > 0);
  const isModified = originalMethod && originalMethod !== paymentMethod;

  const getMethodLabel = (method) => {
    if (method === "cash") return "Nakit";
    if (method === "card") return "Kredi Kartı";
    if (method === "online") return "Online";
    if (method === "mixed") return "Parçalı";
    return method || "-";
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0) + '₺';
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          className={`inline-flex items-center gap-0.5 text-amber-600 hover:text-amber-700 cursor-pointer ${triggerClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="w-3 h-3" />
          {showTriggerText && <span className="text-[10px]">Değiştirildi</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-amber-600 border-b pb-1 mb-2">
            Ödeme Detayı
          </div>
          
          {/* Orijinal Ödeme */}
          {originalMethod && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Orijinal:</span>
              <span className="font-medium">{getMethodLabel(originalMethod)}</span>
            </div>
          )}

          {/* Yeni Ödeme Yöntemi */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Güncel:</span>
            <span className="font-medium">{getMethodLabel(paymentMethod)}</span>
          </div>

          {/* Parçalı Ödeme Detayları */}
          {isMixed && (
            <>
              <div className="border-t pt-2 mt-2">
                {cashAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-green-600">Nakit:</span>
                    <span className="font-medium text-green-700">{formatMoney(cashAmount)}</span>
                  </div>
                )}
                {cardAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-600">Kredi Kartı:</span>
                    <span className="font-medium text-blue-700">{formatMoney(cardAmount)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Toplam */}
          {totalAmount && (
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground">Toplam:</span>
              <span className="font-bold">{formatMoney(totalAmount)}</span>
            </div>
          )}

          {/* Değişiklik Notu */}
          {isModified && (
            <div className="text-[10px] text-amber-600 bg-amber-50 p-1.5 rounded mt-2">
              Kurye tarafından teslim sırasında değiştirildi
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Kompakt ödeme badge'i - değişiklik varsa popover ile
 */
export function PaymentBadge({ 
  paymentMethod, 
  paymentDetails, 
  paymentMethodDetail,
  totalAmount,
  showAmount = false 
}) {
  const cashAmount = paymentDetails?.cash_amount || 0;
  const cardAmount = paymentDetails?.card_amount || 0;
  const isMixed = paymentMethod === "mixed" || (cashAmount > 0 && cardAmount > 0);
  const hasChange = paymentDetails?.original_method || isMixed;

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0) + '₺';
  };

  // Parçalı ödeme gösterimi
  if (isMixed) {
    return (
      <div className="inline-flex items-center gap-1">
        <div className="flex gap-0.5">
          {cashAmount > 0 && (
            <span className="px-1 py-0.5 text-[10px] rounded bg-green-100 text-green-700">
              N{showAmount ? `: ${formatMoney(cashAmount)}` : ''}
            </span>
          )}
          {cardAmount > 0 && (
            <span className="px-1 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700">
              K{showAmount ? `: ${formatMoney(cardAmount)}` : ''}
            </span>
          )}
        </div>
        <PaymentDetailPopover 
          paymentMethod={paymentMethod}
          paymentDetails={paymentDetails}
          totalAmount={totalAmount}
        />
      </div>
    );
  }

  // Tek ödeme gösterimi
  const isMealCard = paymentMethod === 'meal_card' || paymentMethod === 'online_meal_card';
  const bgColor = paymentMethod === 'cash' ? 'bg-green-100 text-green-700' : 
                  paymentMethod === 'card' ? 'bg-blue-100 text-blue-700' : 
                  isMealCard ? 'bg-orange-100 text-orange-700' :
                  'bg-purple-100 text-purple-700';
  
  // Yemek kartı türü varsa onu göster
  let label;
  if (isMealCard && paymentMethodDetail) {
    label = paymentMethodDetail;
  } else {
    label = paymentMethod === 'cash' ? 'Nakit' : 
            paymentMethod === 'card' ? 'Kart' : 
            isMealCard ? 'Yemek Kartı' : 'Online';
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className={`px-1.5 py-0.5 text-[10px] rounded ${bgColor}`}>
        {label}{showAmount && totalAmount ? `: ${formatMoney(totalAmount)}` : ''}
      </span>
      {hasChange && (
        <PaymentDetailPopover 
          paymentMethod={paymentMethod}
          paymentDetails={paymentDetails}
          totalAmount={totalAmount}
        />
      )}
    </div>
  );
}

export default PaymentDetailPopover;
