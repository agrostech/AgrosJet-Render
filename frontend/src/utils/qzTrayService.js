/**
 * QZ Tray Entegrasyonu
 * Sessiz yazdırma için QZ Tray ile iletişim
 * https://qz.io/
 */

// QZ Tray bağlantı durumu
let qzConnection = null;
let isConnecting = false;
let connectionPromise = null;

// Ödeme yöntemi etiketleri
const PAYMENT_LABELS = {
  cash: "NAKİT",
  card: "KREDI KARTI",
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
};

/**
 * QZ Tray kütüphanesinin yüklü olup olmadığını kontrol et
 */
export const isQzAvailable = () => {
  // qz objesi global scope'ta mı kontrol et
  return typeof window !== "undefined" && typeof window.qz !== "undefined" && window.qz !== null;
};

/**
 * QZ Tray'in çalışır durumda olup olmadığını kontrol et
 */
export const isQzConnected = () => {
  try {
    return isQzAvailable() && window.qz.websocket && window.qz.websocket.isActive();
  } catch (e) {
    return false;
  }
};

/**
 * QZ Tray'e bağlan
 */
export const connectToQz = async () => {
  // Zaten bağlıysa
  if (isQzConnected()) {
    return { success: true, message: "Zaten bağlı" };
  }

  // Bağlantı devam ediyorsa bekle
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // QZ Tray kütüphanesi yüklü değilse
  if (!isQzAvailable()) {
    console.log("QZ Tray kütüphanesi bulunamadı. window.qz:", typeof window.qz);
    return { 
      success: false, 
      error: "QZ Tray kütüphanesi yüklenemedi. Sayfayı yenileyin veya QZ Tray'in çalıştığından emin olun.",
      notInstalled: true
    };
  }

  isConnecting = true;
  
  connectionPromise = new Promise(async (resolve) => {
    try {
      // Güvenlik sertifikası için (demo için override)
      window.qz.security.setCertificatePromise(function(resolve, reject) {
        // Demo sertifikası - production'da gerçek sertifika kullanılmalı
        resolve("-----BEGIN CERTIFICATE-----\n" +
          "MIIECzCCAvOgAwIBAgIJALZsL/4J9XOTMA0GCSqGSIb3DQEBCwUAMIGaMQswCQYD\n" +
          "VQQGEwJVUzELMAkGA1UECAwCTlkxETAPBgNVBAcMCE5ldyBZb3JrMRQwEgYDVQQK\n" +
          "DAtRWiBJbmR1c3RyeTEUMBIGA1UECwwLRW5naW5lZXJpbmcxFDASBgNVBAMMC3F6\n" +
          "LWluZHVzdHJ5MSkwJwYJKoZIhvcNAQkBFhpzdXBwb3J0QHF6LWluZHVzdHJpZXMu\n" +
          "Y29tMB4XDTE5MTIxMjAwMDAwMFoXDTQ3MDUwMTAwMDAwMFowgZoxCzAJBgNVBAYT\n" +
          "AlVTMQswCQYDVQQIDAJOWTERMA8GA1UEBwwITmV3IFlvcmsxFDASBgNVBAoMC1Fa\n" +
          "IEluZHVzdHJ5MRQwEgYDVQQLDAtFbmdpbmVlcmluZzEUMBIGA1UEAwwLcXotaW5k\n" +
          "dXN0cnkxKTAnBgkqhkiG9w0BCQEWGnN1cHBvcnRAcXotaW5kdXN0cmllcy5jb20w\n" +
          "ggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC+JzSdN0m+cRfTJvMvwfKp\n" +
          "Gu7T7X5l8rXMfMwqPNvN1L1MpOhvMxMaM2X8NvNmMvN7MvNmMxMvNmMvNmMvNmMv\n" +
          "NmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMv\n" +
          "NmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMv\n" +
          "NmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMv\n" +
          "NmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMvNmMv\n" +
          "NmMvNmMvNmMvNmMvAgMBAAGjUzBRMB0GA1UdDgQWBBQ1234567890abcdefghij\n" +
          "klmnopqrstuvwxyzAB0GA1UdDwEB/wQEAwIHgDAMBgNVHRMBAf8EAjAAMAoGCCqG\n" +
          "SM49BAMCA0kAMEYCIQC1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH\n" +
          "-----END CERTIFICATE-----");
      });
      
      // İmza için (demo - boş bırakılabilir)
      window.qz.security.setSignaturePromise(function(toSign) {
        return function(resolve, reject) {
          resolve(); // Demo için imza yok
        };
      });

      // Bağlantı oluştur
      await window.qz.websocket.connect();
      qzConnection = true;
      console.log("QZ Tray bağlantısı başarılı");
      resolve({ success: true, message: "QZ Tray bağlantısı başarılı" });
    } catch (error) {
      console.error("QZ Tray bağlantı hatası:", error);
      qzConnection = null;
      
      const errorMsg = error?.message || String(error);
      
      if (errorMsg.includes("Unable to connect") || errorMsg.includes("WebSocket")) {
        resolve({ 
          success: false, 
          error: "QZ Tray çalışmıyor. Lütfen QZ Tray uygulamasını başlatın ve tekrar deneyin."
        });
      } else if (errorMsg.includes("Certificate") || errorMsg.includes("security")) {
        resolve({ 
          success: false, 
          error: "Güvenlik sertifikası hatası. QZ Tray'i yeniden başlatın."
        });
      } else {
        resolve({ success: false, error: errorMsg || "Bağlantı hatası" });
      }
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  });

  return connectionPromise;
};

/**
 * QZ Tray bağlantısını kes
 */
export const disconnectFromQz = async () => {
  if (window.qz?.websocket?.isActive()) {
    try {
      await window.qz.websocket.disconnect();
      qzConnection = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: true };
};

/**
 * Mevcut yazıcıları listele
 */
export const getPrinters = async () => {
  const connection = await connectToQz();
  if (!connection.success) {
    return { success: false, error: connection.error, printers: [] };
  }

  try {
    const printers = await window.qz.printers.find();
    return { success: true, printers };
  } catch (error) {
    return { success: false, error: error.message, printers: [] };
  }
};

/**
 * Varsayılan yazıcıyı al
 */
export const getDefaultPrinter = async () => {
  const connection = await connectToQz();
  if (!connection.success) {
    return { success: false, error: connection.error, printer: null };
  }

  try {
    const printer = await window.qz.printers.getDefault();
    return { success: true, printer };
  } catch (error) {
    return { success: false, error: error.message, printer: null };
  }
};

/**
 * Tarih formatla
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0) + " TL";
};

/**
 * Metni belirli genişliğe sığdır (ESC/POS için)
 */
const padText = (text, width, align = "left") => {
  const str = String(text || "").substring(0, width);
  const padding = width - str.length;
  
  if (align === "right") {
    return " ".repeat(padding) + str;
  } else if (align === "center") {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return " ".repeat(leftPad) + str + " ".repeat(rightPad);
  }
  return str + " ".repeat(padding);
};

/**
 * Çizgi oluştur
 */
const line = (char = "-", width = 32) => char.repeat(width);

/**
 * ESC/POS komutları ile fiş oluştur (RAW format)
 * 58mm yazıcı için 32 karakter genişlik
 * 80mm yazıcı için 48 karakter genişlik
 */
const generateEscPosReceipt = (order, paperSize = "80mm") => {
  const width = paperSize === "58mm" ? 32 : 48;
  const platform = PLATFORM_LABELS[order.platform] || order.platform || "Siparis";
  const paymentMethod = order.payment_method_detail || PAYMENT_LABELS[order.payment_method] || order.payment_method;
  
  // ESC/POS Komutları
  const ESC = "\x1B";
  const GS = "\x1D";
  const INIT = ESC + "@";           // Yazıcıyı sıfırla
  const BOLD_ON = ESC + "E\x01";    // Kalın yazı aç
  const BOLD_OFF = ESC + "E\x00";   // Kalın yazı kapat
  const CENTER = ESC + "a\x01";     // Ortala
  const LEFT = ESC + "a\x00";       // Sola hizala
  const RIGHT = ESC + "a\x02";      // Sağa hizala
  const DOUBLE_HEIGHT = GS + "!\x10";  // Çift yükseklik
  const NORMAL = GS + "!\x00";      // Normal boyut
  const CUT = GS + "V\x00";         // Kağıdı kes
  const FEED = ESC + "d\x03";       // 3 satır boşluk
  
  let receipt = [];
  
  // Başlatma
  receipt.push(INIT);
  
  // Başlık
  receipt.push(CENTER);
  receipt.push(BOLD_ON);
  receipt.push(DOUBLE_HEIGHT);
  receipt.push(`#${order.order_number}\n`);
  receipt.push(NORMAL);
  receipt.push(`[ ${platform.toUpperCase()} ]\n`);
  receipt.push(BOLD_OFF);
  receipt.push(`${formatDate(order.created_at)}\n`);
  receipt.push(line("=", width) + "\n");
  
  // Müşteri Bilgileri
  receipt.push(LEFT);
  receipt.push(BOLD_ON);
  receipt.push("MUSTERI\n");
  receipt.push(BOLD_OFF);
  receipt.push(`${order.customer_name || "-"}\n`);
  if (order.customer_phone) {
    receipt.push(`Tel: ${order.customer_phone}\n`);
  }
  receipt.push(line("-", width) + "\n");
  
  // Adres
  receipt.push(BOLD_ON);
  receipt.push("ADRES\n");
  receipt.push(BOLD_OFF);
  const address = order.delivery_address || "-";
  // Adresi satırlara böl
  const addressLines = [];
  let remaining = address;
  while (remaining.length > 0) {
    addressLines.push(remaining.substring(0, width));
    remaining = remaining.substring(width);
  }
  receipt.push(addressLines.join("\n") + "\n");
  receipt.push(line("-", width) + "\n");
  
  // Ürünler
  receipt.push(BOLD_ON);
  receipt.push("URUNLER\n");
  receipt.push(BOLD_OFF);
  
  const items = order.items || [];
  items.forEach(item => {
    const qty = `${item.quantity}x`;
    const name = item.name || "Urun";
    const price = formatCurrency(item.price * item.quantity);
    
    // Ürün satırı
    const nameWidth = width - price.length - qty.length - 2;
    const truncatedName = name.substring(0, nameWidth);
    receipt.push(`${qty} ${padText(truncatedName, nameWidth)} ${price}\n`);
    
    // Ürün notu varsa
    if (item.notes) {
      receipt.push(`   > ${item.notes.substring(0, width - 5)}\n`);
    }
  });
  
  receipt.push(line("=", width) + "\n");
  
  // Toplam
  receipt.push(BOLD_ON);
  receipt.push(DOUBLE_HEIGHT);
  receipt.push(RIGHT);
  receipt.push(`TOPLAM: ${formatCurrency(order.total_amount)}\n`);
  receipt.push(NORMAL);
  receipt.push(CENTER);
  receipt.push(`[ ${paymentMethod} ]\n`);
  receipt.push(BOLD_OFF);
  
  // Sipariş notu
  if (order.notes) {
    receipt.push(LEFT);
    receipt.push(line("-", width) + "\n");
    receipt.push(BOLD_ON);
    receipt.push("SIPARIS NOTU:\n");
    receipt.push(BOLD_OFF);
    const noteLines = [];
    let noteRemaining = order.notes;
    while (noteRemaining.length > 0) {
      noteLines.push(noteRemaining.substring(0, width));
      noteRemaining = noteRemaining.substring(width);
    }
    receipt.push(noteLines.join("\n") + "\n");
  }
  
  // Footer
  receipt.push(CENTER);
  receipt.push(line("-", width) + "\n");
  receipt.push("ShiftJet Siparis Sistemi\n");
  receipt.push(line("-", width) + "\n");
  
  // Boşluk ve kesme
  receipt.push(FEED);
  receipt.push(CUT);
  
  return receipt.join("");
};

/**
 * HTML formatında fiş oluştur (Normal yazıcılar için)
 */
const generateHtmlReceipt = (order, paperSize = "80mm") => {
  const width = paperSize === "58mm" ? "58mm" : "80mm";
  const platform = PLATFORM_LABELS[order.platform] || order.platform || "Siparis";
  const paymentMethod = order.payment_method_detail || PAYMENT_LABELS[order.payment_method] || order.payment_method;
  const items = order.items || [];

  let itemsHtml = items.map(item => `
    <tr>
      <td style="text-align:left;padding:4px 0;">
        <strong>${item.quantity}x</strong> ${item.name}
        ${item.notes ? `<br><small style="color:#666;">${item.notes}</small>` : ""}
      </td>
      <td style="text-align:right;padding:4px 0;white-space:nowrap;">
        ${formatCurrency(item.price * item.quantity)}
      </td>
    </tr>
  `).join("");

  return `
    <html>
    <head>
      <style>
        body { font-family: monospace; font-size: 12px; width: ${width}; margin: 0; padding: 5mm; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
        .order-number { font-size: 20px; font-weight: bold; }
        .platform { background: #000; color: #fff; padding: 3px 8px; display: inline-block; margin-top: 5px; }
        .section { margin: 10px 0; padding: 10px 0; border-bottom: 1px dashed #000; }
        .label { font-size: 10px; font-weight: bold; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 10px; }
        .payment { text-align: center; background: #f0f0f0; padding: 8px; margin-top: 10px; font-weight: bold; }
        .notes { background: #fffde7; padding: 8px; margin-top: 10px; }
        .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="order-number">#${order.order_number}</div>
        <div class="platform">${platform}</div>
        <div style="margin-top:5px;">${formatDate(order.created_at)}</div>
      </div>
      
      <div class="section">
        <div class="label">MUSTERI</div>
        <div><strong>${order.customer_name || "-"}</strong></div>
        <div>${order.customer_phone || ""}</div>
      </div>
      
      <div class="section">
        <div class="label">ADRES</div>
        <div>${order.delivery_address || "-"}</div>
      </div>
      
      <div class="section">
        <div class="label">URUNLER</div>
        <table>${itemsHtml}</table>
      </div>
      
      <div class="total">TOPLAM: ${formatCurrency(order.total_amount)}</div>
      <div class="payment">${paymentMethod}</div>
      
      ${order.notes ? `<div class="notes"><strong>NOT:</strong> ${order.notes}</div>` : ""}
      
      <div class="footer">
        --------------------------------<br>
        ShiftJet Siparis Sistemi
      </div>
    </body>
    </html>
  `;
};

/**
 * QZ Tray ile sessiz yazdırma
 * @param {Object} order - Sipariş objesi
 * @param {string} printerName - Yazıcı adı (opsiyonel, varsayılan yazıcı kullanılır)
 * @param {string} paperSize - "58mm" veya "80mm"
 * @param {boolean} useRaw - ESC/POS raw komutları kullan (termal yazıcılar için)
 */
export const silentPrint = async (order, printerName = null, paperSize = "80mm", useRaw = true) => {
  // QZ Tray'e bağlan
  const connection = await connectToQz();
  if (!connection.success) {
    return connection;
  }

  try {
    // Yazıcı seç
    let printer = printerName;
    if (!printer) {
      const defaultPrinter = await getDefaultPrinter();
      if (!defaultPrinter.success || !defaultPrinter.printer) {
        return { success: false, error: "Varsayılan yazıcı bulunamadı" };
      }
      printer = defaultPrinter.printer;
    }

    // Yazıcı konfigürasyonu
    const config = window.qz.configs.create(printer);
    
    let data;
    
    if (useRaw) {
      // ESC/POS komutları ile yazdır (termal yazıcılar için önerilen)
      const rawData = generateEscPosReceipt(order, paperSize);
      data = [{ type: "raw", format: "plain", data: rawData }];
    } else {
      // HTML olarak yazdır (normal yazıcılar için)
      const htmlData = generateHtmlReceipt(order, paperSize);
      data = [{ type: "html", format: "plain", data: htmlData }];
    }

    // Yazdır
    await window.qz.print(config, data);
    
    console.log(`Sipariş #${order.order_number} yazıcıya gönderildi: ${printer}`);
    return { success: true, message: "Yazdırma başarılı", printer };
    
  } catch (error) {
    console.error("QZ Tray yazdırma hatası:", error);
    return { success: false, error: error.message || "Yazdırma hatası" };
  }
};

/**
 * QZ Tray durumunu kontrol et
 */
export const getQzStatus = async () => {
  if (!isQzAvailable()) {
    return {
      installed: false,
      connected: false,
      message: "QZ Tray yüklü değil"
    };
  }

  const isConnected = window.qz?.websocket?.isActive() || false;
  
  if (!isConnected) {
    // Bağlanmayı dene
    const connection = await connectToQz();
    return {
      installed: true,
      connected: connection.success,
      message: connection.success ? "QZ Tray bağlı" : connection.error
    };
  }

  return {
    installed: true,
    connected: true,
    message: "QZ Tray bağlı ve hazır"
  };
};

/**
 * QZ Tray ayarlarını localStorage'dan al
 */
export const getQzSettings = (restaurantId) => {
  const stored = localStorage.getItem(`qz_settings_${restaurantId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("QZ ayarları okunamadı:", e);
    }
  }
  return {
    enabled: false,
    printerName: null,
    paperSize: "80mm",
    useRawMode: true, // ESC/POS komutları kullan
  };
};

/**
 * QZ Tray ayarlarını kaydet
 */
export const saveQzSettings = (restaurantId, settings) => {
  localStorage.setItem(`qz_settings_${restaurantId}`, JSON.stringify(settings));
};

export default {
  isQzAvailable,
  connectToQz,
  disconnectFromQz,
  getPrinters,
  getDefaultPrinter,
  silentPrint,
  getQzStatus,
  getQzSettings,
  saveQzSettings,
};
