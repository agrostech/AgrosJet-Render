import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

// Getir Yemek Logosu - Resim
const GETIR_LOGO_URL = "https://customer-assets.emergentagent.com/job_38fbd95d-aa19-44b0-b411-ca675322d416/artifacts/c9lqogtk_getirlogo.png";

const GetirLogo = () => (
  <img 
    src={GETIR_LOGO_URL} 
    alt="Getir Yemek" 
    className="w-full h-auto max-w-[180px] mx-auto"
    style={{ maxWidth: "180px", height: "auto" }}
  />
);

// Tarih formatlama
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

// Para formatlama
const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return "0,00 ₺";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2
  }).format(amount);
};

export default function GetirReceiptModal({ open, onClose, order }) {
  const receiptRef = useRef(null);
  const [printing, setPrinting] = useState(false);

  if (!order || order.source !== "getir") return null;

  // Teslimat tipi
  const deliveryType = order.getir_raw?.deliveryTypeText || 
    (order.getir_raw?.isGetirCourier ? "Getir Getirsin" : "Restoran Getirsin");

  // Ödeme yöntemi
  const paymentMethod = order.payment_method_name || order.getir_raw?.paymentMethodName || 
    (order.payment_method === "cash" ? "Nakit" : 
     order.payment_method === "online" ? "Online" : 
     order.payment_method === "card" ? "Kredi Kartı" : order.payment_method);

  // Doğrulama kodu
  const verificationCode = order.verification_code || order.getir_raw?.verificationCode || "-";

  // Müşteri telefonu (0850 formatı)
  const customerPhone = order.customer_phone || "-";

  // Sipariş notu
  const orderNotes = order.notes || "";
  
  // Müşteri notu (notes içinden çıkar - sadece müşteri notunu al, diğer bilgileri hariç tut)
  const extractClientNote = (notes) => {
    if (!notes.includes("MÜŞTERİ NOTU:")) return "";
    const afterMusteriNotu = notes.split("MÜŞTERİ NOTU:")[1] || "";
    // | veya GETİR veya TESLİMAT veya ADRES ile başlayan kısmı kes
    const cleanNote = afterMusteriNotu.split(/\s*\|\s*GETİR|\s*\|\s*TESLİMAT|\s*\|\s*ADRES|\s*\|\s*İLERİ|\s*\|/)[0]?.trim();
    return cleanNote || "";
  };
  const clientNote = extractClientNote(orderNotes);
  
  // Plastik çatal bıçak istememe
  const doNotSendCutlery = order.getir_raw?.doNotSendCutlery || 
    orderNotes.includes("plastik çatal") || 
    orderNotes.includes("çatal, bıçak");

  // Yazdırma fonksiyonu
  const handlePrint = () => {
    setPrinting(true);
    
    const printContent = receiptRef.current;
    const printWindow = window.open("", "_blank", "width=350,height=600");
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Getir Sipariş Fişi</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 80mm;
            padding: 4mm;
            background: white;
            color: black;
          }
          .receipt {
            width: 100%;
          }
          .logo {
            text-align: center;
            margin-bottom: 8px;
          }
          .logo img {
            width: 50mm;
            height: auto;
            margin: 0 auto;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }
          .divider-double {
            border-top: 2px solid #000;
            margin: 8px 0;
          }
          .center {
            text-align: center;
          }
          .bold {
            font-weight: bold;
          }
          .verification-box {
            border: 2px solid #000;
            padding: 8px;
            text-align: center;
            margin: 8px 0;
            font-size: 18px;
            font-weight: bold;
          }
          .section-title {
            font-weight: bold;
            font-size: 11px;
            margin-top: 8px;
            margin-bottom: 4px;
            text-transform: uppercase;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          .row-left {
            flex: 1;
          }
          .row-right {
            text-align: right;
            min-width: 60px;
          }
          .item {
            margin: 4px 0;
            padding: 2px 0;
          }
          .item-name {
            font-weight: bold;
          }
          .item-note {
            font-size: 10px;
            font-style: italic;
            color: #333;
            margin-left: 8px;
          }
          .total-section {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px dashed #000;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
          }
          .grand-total {
            font-size: 16px;
            font-weight: bold;
            margin-top: 4px;
          }
          .discount {
            color: #000;
          }
          .note-box {
            border: 1px solid #000;
            padding: 6px;
            margin: 6px 0;
            font-size: 11px;
          }
          .note-title {
            font-weight: bold;
            margin-bottom: 2px;
          }
          .customer-section {
            margin: 8px 0;
          }
          .address {
            font-size: 11px;
            line-height: 1.3;
          }
          .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      setPrinting(false);
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Getir Sipariş Fişi</span>
            <Button onClick={handlePrint} disabled={printing} className="bg-purple-600 hover:bg-purple-700">
              <Printer className="w-4 h-4 mr-2" />
              {printing ? "Yazdırılıyor..." : "Yazdır"}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Fiş Önizleme */}
        <div className="bg-white border rounded-lg p-4 shadow-inner">
          <div 
            ref={receiptRef} 
            className="receipt font-mono text-xs"
            style={{ width: "80mm", margin: "0 auto", padding: "4mm", background: "white" }}
          >
            {/* Getir Logo */}
            <div className="logo text-center mb-2">
              <GetirLogo />
            </div>

            {/* Doğrulama Kodu */}
            <div className="verification-box border-2 border-black p-2 text-center my-2">
              <div className="text-[10px] mb-1">DOĞRULAMA KODU</div>
              <div className="text-2xl font-bold tracking-wider">{verificationCode}</div>
            </div>

            <div className="divider border-t border-dashed border-black my-2"></div>

            {/* Sipariş Bilgileri */}
            <div className="section-title font-bold text-[11px] uppercase">Sipariş Detayı</div>
            <div className="row flex justify-between text-[11px]">
              <span>Sipariş No:</span>
              <span className="font-bold">{order.order_number || order.external_id || "-"}</span>
            </div>
            <div className="row flex justify-between text-[11px]">
              <span>Tarih:</span>
              <span>{formatDate(order.created_at)}</span>
            </div>
            <div className="row flex justify-between text-[11px]">
              <span>Teslimat:</span>
              <span className="font-bold">{deliveryType}</span>
            </div>
            <div className="row flex justify-between text-[11px]">
              <span>Ödeme:</span>
              <span>{paymentMethod}</span>
            </div>

            <div className="divider border-t border-dashed border-black my-2"></div>

            {/* Müşteri Bilgileri */}
            <div className="section-title font-bold text-[11px] uppercase">Müşteri Bilgileri</div>
            <div className="customer-section">
              <div className="font-bold">{order.customer_name || "-"}</div>
              <div className="text-[11px]">{customerPhone}</div>
              <div className="address text-[11px] mt-1 leading-tight">
                {order.delivery_address || "-"}
              </div>
            </div>

            <div className="divider border-t border-dashed border-black my-2"></div>

            {/* Ürünler */}
            <div className="section-title font-bold text-[11px] uppercase">Ürünler</div>
            {order.items?.map((item, idx) => (
              <div key={idx} className="item my-1 py-1">
                <div className="flex justify-between">
                  <span className="font-bold">
                    {item.quantity}x {item.name}
                  </span>
                  <span>{formatCurrency(item.price * item.quantity)}</span>
                </div>
                {item.options && item.options.length > 0 && (
                  <div className="text-[10px] text-gray-600 ml-3">
                    {item.options.map((opt, i) => (
                      <div key={i}>+ {opt.quantity > 1 ? `${opt.quantity}x ` : ''}{opt.name}{opt.quantity > 1 && opt.unit_price > 0 ? ` (+${formatCurrency(opt.unit_price)} x${opt.quantity} = ${formatCurrency(opt.price)})` : opt.price > 0 ? ` (+${formatCurrency(opt.price)})` : ''}</div>
                    ))}
                  </div>
                )}
                {item.note && (
                  <div className="item-note text-[10px] italic ml-3 text-gray-600">
                    Not: {item.note}
                  </div>
                )}
              </div>
            ))}

            {/* Toplam */}
            <div className="total-section mt-2 pt-2 border-t border-dashed border-black">
              {order.total_price && order.total_discounted_price && order.total_price > order.total_discounted_price && (
                <>
                  <div className="total-row flex justify-between text-[11px]">
                    <span>Ara Toplam:</span>
                    <span className="line-through">{formatCurrency(order.total_price)}</span>
                  </div>
                  <div className="total-row flex justify-between text-[11px] discount">
                    <span>İndirim:</span>
                    <span>-{formatCurrency(order.total_price - order.total_discounted_price)}</span>
                  </div>
                </>
              )}
              <div className="grand-total flex justify-between text-base font-bold mt-1">
                <span>TOPLAM:</span>
                <span>{formatCurrency(order.total_amount)}</span>
              </div>
            </div>

            {/* Sipariş Notu */}
            {clientNote && (
              <>
                <div className="divider border-t border-dashed border-black my-2"></div>
                <div className="note-box border border-black p-2 my-2">
                  <div className="note-title font-bold text-[11px]">SİPARİŞ NOTU:</div>
                  <div className="text-[11px]">{clientNote}</div>
                </div>
              </>
            )}

            {/* Plastik Çatal Bıçak İstemiyor */}
            {doNotSendCutlery && (
              <div className="note-box border-2 border-black p-2 my-2 bg-gray-100">
                <div className="text-[11px] font-bold text-center">
                  ⚠️ ÇATAL-BIÇAK-PEÇETE GÖNDERMEYİN
                </div>
              </div>
            )}

            {/* Alt Bilgi */}
            <div className="divider-double border-t-2 border-black my-2"></div>
            <div className="footer text-center text-[10px] mt-3">
              <div>Getir Yemek</div>
              <div className="mt-1">Afiyet olsun!</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
