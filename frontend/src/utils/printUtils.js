/**
 * Termal Yazıcı Yazdırma Utility
 * 58mm ve 80mm termal yazıcılar için fiş yazdırma
 */

// Ödeme yöntemi etiketleri
const PAYMENT_LABELS = {
  cash: "NAKİT",
  card: "KREDİ KARTI",
  online: "ONLINE",
  meal_card: "YEMEK KARTI",
  online_meal_card: "ONLINE YEMEK KARTI",
};

// Platform etiketleri
const PLATFORM_LABELS = {
  adisyo: "Adisyo",
  getir: "Getir",
  trendyol: "Trendyol",
  yemeksepeti: "Yemeksepeti",
  migros: "Migros",
  phone: "Telefon",
  manual: "Manuel",
  test: "Test",
};

/**
 * Tarihi formatla
 */
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Para formatla
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(amount || 0);
};

/**
 * 58mm termal fiş HTML'i oluştur
 * Genişlik: ~32 karakter
 */
const generate58mmReceipt = (order, logoUrl = "") => {
  const items = order.items || [];
  const platform = PLATFORM_LABELS[order.platform] || PLATFORM_LABELS[order.source] || order.platform || order.source || "Sipariş";
  const paymentMethod = order.payment_method_detail || PAYMENT_LABELS[order.payment_method] || order.payment_method;

  let itemsHtml = items.map(item => `
    <tr>
      <td style="text-align:left;font-size:11px;padding:2px 0;">
        ${item.quantity}x ${item.name}
        ${item.notes ? `<br><small style="font-size:9px;">Not: ${item.notes}</small>` : ""}
      </td>
      <td style="text-align:right;font-size:11px;padding:2px 0;white-space:nowrap;">
        ${formatCurrency(item.price * item.quantity)}
      </td>
    </tr>
  `).join("");

  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:112px;max-width:95%;object-fit:contain;margin-bottom:4px;" />` : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sipariş Fişi - ${order.order_number}</title>
      <style>
        @page { 
          size: 58mm auto; 
          margin: 0; 
        }
        body { 
          font-family: 'Courier New', monospace; 
          font-size: 11px; 
          width: 58mm; 
          margin: 0; 
          padding: 4mm;
          box-sizing: border-box;
          color: #000;
        }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .header-info { font-size: 10px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; }
        .platform { font-size: 10px; background: #000; color: #fff; padding: 2px 6px; display: inline-block; }
        .section { margin: 8px 0; padding: 8px 0; border-bottom: 1px dashed #000; }
        .label { font-size: 9px; font-weight: bold; }
        .value { font-size: 11px; font-weight: bold; }
        .items-table { width: 100%; border-collapse: collapse; }
        .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 8px; }
        .payment { text-align: center; padding: 4px; margin-top: 8px; font-weight: bold; border: 1px solid #000; }
        .notes { padding: 6px; margin-top: 8px; font-size: 10px; border: 1px dashed #000; }
        .footer { text-align: center; font-size: 9px; margin-top: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${logoHtml}
        <div class="header-info">
          <span class="platform">${platform}</span>
          <span>${formatDate(order.created_at)}</span>
        </div>
      </div>

      <div class="section">
        <div class="label">MUSTERI</div>
        <div class="value">${order.customer_name || "-"}</div>
        <div style="font-size:11px;">${order.customer_phone || ""}</div>
      </div>

      <div class="section">
        <div class="label">ADRES</div>
        <div style="font-size:10px;">${order.delivery_address || "-"}</div>
      </div>

      <div class="section">
        <div class="label">URUNLER</div>
        <table class="items-table">
          ${itemsHtml}
        </table>
      </div>

      <div class="total">
        TOPLAM: ${formatCurrency(order.total_amount)}
      </div>

      <div class="payment">
        ${paymentMethod}
      </div>

      ${order.notes ? `<div class="notes"><strong>NOT:</strong> ${order.notes}</div>` : ""}
    </body>
    </html>
  `;
};

/**
 * 80mm termal fiş HTML'i oluştur
 * Genişlik: ~48 karakter
 */
const generate80mmReceipt = (order, logoUrl = "") => {
  const items = order.items || [];
  const platform = PLATFORM_LABELS[order.platform] || PLATFORM_LABELS[order.source] || order.platform || order.source || "Sipariş";
  const paymentMethod = order.payment_method_detail || PAYMENT_LABELS[order.payment_method] || order.payment_method;

  let itemsHtml = items.map(item => `
    <tr>
      <td style="text-align:left;padding:4px 0;">
        <strong>${item.quantity}x</strong> ${item.name}
        ${item.notes ? `<br><small>Not: ${item.notes}</small>` : ""}
      </td>
      <td style="text-align:right;padding:4px 0;white-space:nowrap;font-weight:bold;">
        ${formatCurrency(item.price * item.quantity)}
      </td>
    </tr>
  `).join("");

  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:128px;max-width:95%;object-fit:contain;margin-bottom:6px;" />` : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sipariş Fişi - ${order.order_number}</title>
      <style>
        @page { 
          size: 80mm auto; 
          margin: 0; 
        }
        body { 
          font-family: 'Arial', sans-serif; 
          font-size: 12px; 
          width: 80mm; 
          margin: 0; 
          padding: 5mm;
          box-sizing: border-box;
          color: #000;
        }
        .header { 
          text-align: center; 
          border-bottom: 2px solid #000; 
          padding-bottom: 10px; 
          margin-bottom: 10px; 
        }
        .header-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 6px;
          font-size: 11px;
        }
        .platform { 
          font-size: 11px; 
          background: #000; 
          color: #fff; 
          padding: 3px 10px; 
          display: inline-block; 
        }
        .section { 
          margin: 10px 0; 
          padding: 10px 0; 
          border-bottom: 1px dashed #000; 
        }
        .section-title { 
          font-size: 10px; 
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
          font-weight: bold;
        }
        .section-value { 
          font-size: 13px; 
          font-weight: bold; 
        }
        .customer-phone {
          font-size: 14px;
          font-family: monospace;
          padding: 4px 0;
          display: inline-block;
          margin-top: 4px;
        }
        .items-table { 
          width: 100%; 
          border-collapse: collapse; 
        }
        .items-table td {
          font-size: 12px;
        }
        .total-section {
          padding: 10px 0;
          margin-top: 10px;
          text-align: right;
          border-top: 1px dashed #000;
        }
        .total-label {
          font-size: 12px;
        }
        .total-amount { 
          font-size: 20px; 
          font-weight: bold; 
        }
        .payment { 
          text-align: center; 
          padding: 8px; 
          margin-top: 10px; 
          font-weight: bold;
          font-size: 14px;
          border: 2px solid #000;
        }
        .notes { 
          border: 1px dashed #000;
          padding: 8px 12px; 
          margin-top: 10px; 
          font-size: 11px; 
        }
        .footer { 
          text-align: center; 
          font-size: 10px; 
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px dashed #000;
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${logoHtml}
        <div class="header-info">
          <span class="platform">${platform}</span>
          <span>${formatDate(order.created_at)}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Musteri Bilgileri</div>
        <div class="section-value">${order.customer_name || "-"}</div>
        ${order.customer_phone ? `<div class="customer-phone">${order.customer_phone}</div>` : ""}
      </div>

      <div class="section">
        <div class="section-title">Teslimat Adresi</div>
        <div style="font-size:12px;line-height:1.4;">${order.delivery_address || "-"}</div>
      </div>

      <div class="section">
        <div class="section-title">Siparis Detayi</div>
        <table class="items-table">
          ${itemsHtml}
        </table>
      </div>

      <div class="total-section">
        <div class="total-label">TOPLAM TUTAR</div>
        <div class="total-amount">${formatCurrency(order.total_amount)}</div>
      </div>

      <div class="payment">
        ${paymentMethod}
      </div>

      ${order.notes ? `<div class="notes"><strong>Siparis Notu:</strong><br>${order.notes}</div>` : ""}
    </body>
    </html>
  `;
};

/**
 * Siparişi yazdır
 * @param {Object} order - Sipariş objesi
 * @param {string} paperSize - "58mm" veya "80mm"
 */
export const printOrder = (order, paperSize = "80mm", logoUrl = "") => {
  if (!order) {
    console.error("Yazdırılacak sipariş yok");
    return;
  }

  const html = paperSize === "58mm" 
    ? generate58mmReceipt(order, logoUrl) 
    : generate80mmReceipt(order, logoUrl);

  // Yeni pencere aç ve yazdır
  const printWindow = window.open("", "_blank", "width=400,height=600");
  
  if (!printWindow) {
    console.error("Popup engellenmiş olabilir");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Yazdırma dialogunu aç
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      // Yazdırma sonrası pencereyi kapat (opsiyonel)
      // printWindow.close();
    }, 250);
  };
};

/**
 * Sipariş fişini önizleme olarak aç (yazdırma komutu göndermeden)
 * @param {Object} order - Sipariş objesi
 * @param {string} paperSize - "58mm" veya "80mm"
 */
export const previewOrder = (order, paperSize = "80mm", logoUrl = "") => {
  if (!order) {
    console.error("Önizlenecek sipariş yok");
    return;
  }

  const html = paperSize === "58mm" 
    ? generate58mmReceipt(order, logoUrl) 
    : generate80mmReceipt(order, logoUrl);

  const previewWindow = window.open("", "_blank", "width=400,height=600");
  
  if (!previewWindow) {
    console.error("Popup engellenmiş olabilir");
    return;
  }

  previewWindow.document.write(html);
  previewWindow.document.close();
};

/**
 * Yazdırma ayarlarını localStorage'dan al
 */
export const getPrintSettings = (restaurantId) => {
  const stored = localStorage.getItem(`restaurant_print_settings_${restaurantId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Yazdırma ayarları okunamadı:", e);
    }
  }
  return {
    autoPrint: false,
    paperSize: "80mm",
    printSound: true,
  };
};

/**
 * Otomatik yazdırma kontrolü
 */
export const shouldAutoPrint = (restaurantId) => {
  const settings = getPrintSettings(restaurantId);
  return settings.autoPrint === true;
};

export default {
  printOrder,
  previewOrder,
  getPrintSettings,
  shouldAutoPrint,
};
