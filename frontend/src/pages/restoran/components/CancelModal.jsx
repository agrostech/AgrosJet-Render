/**
 * CancelModal - Sipariş iptal ve teslim onay modalı
 * 
 * Platform bazlı iptal sebepleri destekler:
 * - Getir: 4 zorunlu sebep
 * - Trendyol: 5 sebep
 * - Diğer: varsayılan sebepler
 */
import { useState, useEffect } from "react";
import axios from "axios";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { CheckCircle, XCircle } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function CancelModal({
  open,
  onOpenChange,
  order,
  actionType, // "cancelled" veya "delivered"
  onConfirm,
  restaurantId,
}) {
  const [cancelReasons, setCancelReasons] = useState([]);
  const [selectedReason, setSelectedReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [loading, setLoading] = useState(false);

  const isCancel = actionType === "cancelled";
  const source = order?.source || "manual";
  const isGetir = source === "getir";
  const isMigros = source === "migros";
  const isReasonRequired = (isGetir || isMigros) && isCancel;

  // Modal açıldığında iptal sebeplerini çek
  useEffect(() => {
    if (open && isCancel) {
      fetchCancelReasons();
    }
  }, [open, isCancel, source]);

  const fetchCancelReasons = async () => {
    try {
      setLoading(true);
      const params = source === "migros" && restaurantId ? `?restaurant_id=${restaurantId}` : "";
      const res = await axios.get(`${API}/orders/platform-cancel-reasons/${source}${params}`);
      setCancelReasons(res.data.reasons || []);
    } catch (err) {
      console.error("İptal sebepleri yüklenemedi:", err);
      setCancelReasons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    onConfirm?.({
      orderId: order?.id,
      status: actionType,
      cancelReasonId: selectedReason || undefined,
      cancelNote: cancelNote || undefined,
    });
    handleClose();
  };

  const handleClose = () => {
    setSelectedReason("");
    setCancelNote("");
    onOpenChange?.(false);
  };

  // Getir/Migros için sebep zorunlu mu?
  const canConfirm = !isReasonRequired || selectedReason;

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isCancel ? (
              <>
                <XCircle className="w-5 h-5 text-red-600" />
                Siparişi İptal Et
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                Siparişi Teslim Et
              </>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                {isCancel
                  ? `${order?.customer_name || "Müşteri"} siparişini iptal etmek istediğinize emin misiniz?`
                  : `${order?.customer_name || "Müşteri"} siparişini teslim edildi olarak işaretlemek istediğinize emin misiniz?`}
              </p>

              {/* İptal Sebebi - Sadece iptal durumunda göster */}
              {isCancel && cancelReasons.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      İptal Sebebi {isReasonRequired && <span className="text-red-500">*</span>}
                    </label>
                    <Select value={selectedReason} onValueChange={setSelectedReason}>
                      <SelectTrigger className="w-full" data-testid="cancel-reason-select">
                        <SelectValue placeholder="Sebep seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cancelReasons.map((reason) => (
                          <SelectItem key={reason.id} value={reason.id}>
                            {reason.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">İptal Notu (Opsiyonel)</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={2}
                      placeholder="Ek açıklama..."
                      value={cancelNote}
                      onChange={(e) => setCancelNote(e.target.value)}
                      data-testid="cancel-note-input"
                    />
                  </div>

                  {isReasonRequired && !selectedReason && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      {isMigros ? "Migros" : "Getir"} siparişleri için iptal sebebi seçmeniz zorunludur.
                    </p>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            className={isCancel ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            disabled={!canConfirm || loading}
            onClick={handleConfirm}
            data-testid="confirm-action-btn"
          >
            {isCancel ? "İptal Et" : "Teslim Et"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
