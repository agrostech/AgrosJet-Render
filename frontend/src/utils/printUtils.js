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
 * Sipariş kaynağını belirle
 */
const getPlatformLabel = (order) => {
  if (order.platform && PLATFORM_LABELS[order.platform]) return PLATFORM_LABELS[order.platform];
  if (order.order_number && order.order_number.startsWith("TEL-")) return "Telefon";
  if (order.source && PLATFORM_LABELS[order.source]) return PLATFORM_LABELS[order.source];
  return order.platform || order.source || "Sipariş";
};

/**
 * 58mm termal fiş HTML'i oluştur
 * Genişlik: ~32 karakter
 */
const generate58mmReceipt = (order, logoUrl = "") => {
  const items = order.items || [];
  const platform = getPlatformLabel(order);
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

  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-width:48%;object-fit:contain;display:block;margin:14px auto;" />` : "";

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Sipariş Fişi - ${order.order_number}</title>
      <style>
        * { margin: 0; padding: 0; }
        html, body { margin: 0 !important; padding: 0 !important; }
        @page { size: 58mm auto; margin: 0; }
        body { 
          font-family: 'Courier New', monospace; 
          font-size: 11px; 
          width: 58mm; 
          padding: 0 3mm !important;
          box-sizing: border-box;
          color: #000;
        }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px; }
        .header-info { font-size: 11px; display: flex; justify-content: space-between; align-items: center; }
        .platform { font-size: 11px; color: #000; font-weight: bold; display: inline-block; }
        .section { padding: 6px 0; border-bottom: 1px dashed #000; line-height: 1.5; }
        .label { font-size: 9px; font-weight: bold; }
        .value { font-size: 11px; font-weight: bold; }
        .items-table { width: 100%; border-collapse: collapse; }
        .items-table td { padding: 3px 0; }
        .total { font-size: 14px; font-weight: bold; text-align: right; padding-top: 4px; }
        .payment { text-align: center; padding: 4px; font-weight: bold; border: 1px solid #000; margin-top: 4px; }
        .notes { padding: 5px; font-size: 10px; border: 1px dashed #000; margin-top: 4px; line-height: 1.4; }
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
        <div class="label">MÜŞTERİ</div>
        <div class="value">${order.customer_name || "-"}</div>
        <div style="font-size:11px;">${order.customer_phone || ""}</div>
      </div>

      <div class="section">
        <div class="label">ADRES</div>
        <div style="font-size:10px;">${order.delivery_address || "-"}</div>
      </div>

      <div class="section">
        <div class="label">ÜRÜNLER</div>
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

      <div style="text-align:center;margin-top:6px;padding-top:4px;border-top:1px dashed #000;font-size:9px;line-height:1.5;">
        www.AgrosJet.com.tr<br>
        Afiyet olsun
      </div>
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
  const platform = getPlatformLabel(order);
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

  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-width:48%;object-fit:contain;display:block;margin:14px auto;" />` : "";

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Sipariş Fişi - ${order.order_number}</title>
      <style>
        * { margin: 0; padding: 0; }
        html, body { margin: 0 !important; padding: 0 !important; }
        @page { size: 80mm auto; margin: 0; }
        body { 
          font-family: 'Arial', sans-serif; 
          font-size: 13px; 
          width: 80mm; 
          padding: 0 4mm !important;
          box-sizing: border-box;
          color: #000;
        }
        .header { 
          text-align: center; 
          border-bottom: 2px solid #000; 
          padding-bottom: 4px; 
        }
        .header-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }
        .platform { 
          font-size: 13px; 
          color: #000; 
          font-weight: bold;
          display: inline-block; 
        }
        .section { 
          padding: 6px 0; 
          border-bottom: 1px dashed #000; 
          line-height: 1.5;
        }
        .section-title { 
          font-size: 11.5px; 
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 2px;
          font-weight: bold;
        }
        .section-value { 
          font-size: 14px; 
          font-weight: bold; 
        }
        .customer-phone {
          font-size: 15px;
          font-family: monospace;
        }
        .items-table { 
          width: 100%; 
          border-collapse: collapse; 
        }
        .items-table td {
          font-size: 13px;
          padding: 4px 0;
        }
        .total-section {
          padding: 4px 0;
          text-align: right;
          border-top: 1px dashed #000;
        }
        .total-label {
          font-size: 13px;
        }
        .total-amount { 
          font-size: 22px; 
          font-weight: bold; 
        }
        .payment { 
          text-align: center; 
          padding: 4px; 
          font-weight: bold;
          font-size: 15px;
          border: 2px solid #000;
          margin-top: 4px;
        }
        .notes { 
          border: 1px dashed #000;
          padding: 4px 8px; 
          font-size: 13px; 
          margin-top: 4px;
          line-height: 1.4;
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
        <div class="section-title">Müşteri Bilgileri</div>
        <div class="section-value">${order.customer_name || "-"}</div>
        ${order.customer_phone ? `<div class="customer-phone">${order.customer_phone}</div>` : ""}
      </div>

      <div class="section">
        <div class="section-title">Teslimat Adresi</div>
        <div style="font-size:12px;line-height:1.4;">${order.delivery_address || "-"}</div>
      </div>

      <div class="section">
        <div class="section-title">Sipariş Detayı</div>
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

      ${order.notes ? `<div class="notes"><strong>Sipariş Notu:</strong><br>${order.notes}</div>` : ""}

      <div style="text-align:center;margin-top:8px;padding-top:6px;border-top:1px dashed #000;font-size:11px;line-height:1.6;">
        www.AgrosJet.com.tr<br>
        Afiyet olsun
      </div>
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

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank", "width=400,height=600");
  
  if (!printWindow) {
    console.error("Popup engellenmiş olabilir");
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
};

/**
 * Sipariş fişini önizleme olarak aç (yazdırma komutu göndermeden)
 */
export const previewOrder = (order, paperSize = "80mm", logoUrl = "") => {
  if (!order) {
    console.error("Önizlenecek sipariş yok");
    return;
  }

  const html = paperSize === "58mm" 
    ? generate58mmReceipt(order, logoUrl) 
    : generate80mmReceipt(order, logoUrl);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open(url, "_blank", "width=400,height=600");
  
  if (!previewWindow) {
    console.error("Popup engellenmiş olabilir");
    URL.revokeObjectURL(url);
  }
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
