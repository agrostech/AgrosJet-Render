/**
 * AgrosJet Yerel Yazdırma Sunucusu İstemcisi
 * localhost:5555'te çalışan yazdırma sunucusu
 */

const LOCAL_PRINT_SERVER = "http://localhost:5555";

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
 * Para formatla
 */
const formatCurrency = (amount) => {
  try {
    return `${parseFloat(amount).toFixed(2).replace('.', ',')} TL`;
  } catch {
    return `${amount} TL`;
  }
};

/**
 * Tarih formatla
 */
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const dt = new Date(dateStr);
    return dt.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr.slice(0, 16);
  }
};

/**
 * Metni ortala
 */
const centerText = (text, width) => {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return " ".repeat(pad) + text;
};

/**
 * Metni sağa yasla
 */
const rightText = (text, width) => {
  if (text.length >= width) return text;
  return " ".repeat(width - text.length) + text;
};

/**
 * Türkçe karakterleri büyük harfe çevir
 */
const toUpperCaseTurkish = (text) => {
  if (!text) return "";
  return text
    .replace(/i/g, 'İ')
    .replace(/ı/g, 'I')
    .replace(/ş/g, 'Ş')
    .replace(/ğ/g, 'Ğ')
    .replace(/ü/g, 'Ü')
    .replace(/ö/g, 'Ö')
    .replace(/ç/g, 'Ç')
    .toUpperCase();
};

// ESC/POS Komutları
const ESC = '\x1B';
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const ALIGN_CENTER = ESC + 'a' + '\x01';
const ALIGN_LEFT = ESC + 'a' + '\x00';
const ALIGN_RIGHT = ESC + 'a' + '\x02';
const DOUBLE_HEIGHT_ON = ESC + '!' + '\x10';
const DOUBLE_HEIGHT_OFF = ESC + '!' + '\x00';

/**
 * Fiş metni oluştur (Termal yazıcı için - ESC/POS destekli)
 */
const generateReceiptText = (order, width = 48) => {
  const lines = [];
  const sep = "=".repeat(width);
  const dash = "-".repeat(width);

  const restaurantName = order.restaurant_name || "RESTORAN";

  // Başlık - Kalın ve Ortalı
  lines.push(sep);
  lines.push(ALIGN_CENTER + BOLD_ON + DOUBLE_HEIGHT_ON);
  lines.push(`[ ${toUpperCaseTurkish(restaurantName)} ]`);
  lines.push(DOUBLE_HEIGHT_OFF + BOLD_OFF + ALIGN_LEFT);
  lines.push(centerText(formatDate(order.created_at), width));
  lines.push(sep);

  // Müşteri - Başlık Kalın
  lines.push(BOLD_ON + "MÜŞTERİ:" + BOLD_OFF);
  lines.push(`  ${order.customer_name || "-"}`);
  if (order.customer_phone) {
    lines.push(`  Tel: ${order.customer_phone}`);
  }
  lines.push(dash);

  // Adres - Başlık Kalın
  lines.push(BOLD_ON + "ADRES:" + BOLD_OFF);
  let address = order.delivery_address || "-";
  while (address.length > 0) {
    lines.push(`  ${address.slice(0, width - 2)}`);
    address = address.slice(width - 2);
  }
  lines.push(dash);

  // Ürünler - Başlık Kalın
  lines.push(BOLD_ON + "ÜRÜNLER:" + BOLD_OFF);
  const items = order.items || [];
  items.forEach((item) => {
    const qty = item.quantity || 1;
    const name = item.name || "Ürün";
    const price = (item.price || 0) * qty;

    const itemText = `${qty}x ${name}`;
    const priceText = formatCurrency(price);

    // Ürün ismi ASLA kısaltılmaz - gerekirse satır kaydırılır
    if (itemText.length + priceText.length + 2 <= width) {
      // Tek satıra sığıyor
      const spaces = width - itemText.length - priceText.length;
      lines.push(`${itemText}${" ".repeat(Math.max(1, spaces))}${priceText}`);
    } else if (itemText.length <= width) {
      // Ürün adı tek satıra sığıyor ama fiyatla birlikte sığmıyor
      lines.push(itemText);
      lines.push(rightText(priceText, width));
    } else {
      // Ürün adı bile tek satıra sığmıyor - satır kaydır
      let remaining = itemText;
      while (remaining.length > 0) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      lines.push(rightText(priceText, width));
    }

    // Ürün notu - bu da uzunsa satır kaydır
    if (item.notes) {
      let note = `   > ${item.notes}`;
      while (note.length > 0) {
        lines.push(note.slice(0, width));
        note = note.length > width ? `     ${note.slice(width)}` : "";
      }
    }
  });
  lines.push(sep);

  // Toplam - Kalın
  lines.push(ALIGN_RIGHT + BOLD_ON);
  lines.push(`TOPLAM: ${formatCurrency(order.total_amount || 0)}`);
  lines.push(BOLD_OFF + ALIGN_LEFT);

  // Ödeme yöntemi - Ortalı
  const payment = order.payment_method_detail || 
    PAYMENT_LABELS[order.payment_method] || 
    order.payment_method || "";
  lines.push(centerText(`[ ${payment} ]`, width));

  // Sipariş notu - Başlık Kalın
  if (order.notes) {
    lines.push(dash);
    lines.push(BOLD_ON + "SİPARİŞ NOTU:" + BOLD_OFF);
    let note = order.notes;
    while (note.length > 0) {
      lines.push(`  ${note.slice(0, width - 2)}`);
      note = note.slice(width - 2);
    }
  }

  // Footer
  lines.push(dash);
  lines.push(centerText("AgrosJet", width));
  lines.push("");
  lines.push("");

  return lines.join("\n");
};

/**
 * Yerel yazdırma sunucusunun çalışıp çalışmadığını kontrol et
 */
export const checkLocalPrintServer = async () => {
  try {
    const response = await Promise.race([
      fetch(`${LOCAL_PRINT_SERVER}/status`, { mode: 'cors' }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 3000)
      )
    ]);

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        connected: true,
        printers: data.printers || [],
        defaultPrinter: data.default_printer,
        message: "Yerel yazdırma sunucusu bağlı",
      };
    }
    return {
      available: false,
      connected: false,
      printers: [],
      defaultPrinter: null,
      message: `Sunucu yanıt vermiyor (${response.status})`,
    };
  } catch (error) {
    let message = "Yerel yazdırma sunucusu çalışmıyor";
    
    if (error.message === 'timeout') {
      message = "Bağlantı zaman aşımına uğradı";
    } else if (error.message?.includes('Failed to fetch')) {
      message = "Sunucuya erişilemiyor. Program çalışıyor mu?";
    } else if (error.message?.includes('NetworkError')) {
      message = "Ağ hatası. Güvenlik duvarını kontrol edin.";
    }
    
    return {
      available: false,
      connected: false,
      printers: [],
      defaultPrinter: null,
      message: message,
    };
  }
};

/**
 * Yazıcı listesini al
 */
export const getLocalPrinters = async () => {
  try {
    const response = await fetch(`${LOCAL_PRINT_SERVER}/printers`);
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        printers: data.printers || [],
        defaultPrinter: data.default,
      };
    }
    return { success: false, printers: [], error: "Sunucu hatası" };
  } catch (error) {
    return { success: false, printers: [], error: "Bağlantı hatası" };
  }
};

/**
 * Siparişi yerel sunucu üzerinden yazdır (sessiz)
 */
export const printOrderLocal = async (order, printerName = null, paperSize = "80mm") => {
  try {
    // Fiş metnini frontend'de oluştur
    const width = paperSize === "58mm" ? 32 : 48;
    const receiptText = generateReceiptText(order, width);

    const response = await fetch(`${LOCAL_PRINT_SERVER}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: receiptText,
        printer: printerName,
        paper_size: paperSize,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return { success: true, message: data.message || "Yazdırıldı" };
    }
    return { success: false, error: data.error || "Yazdırma hatası" };
  } catch (error) {
    return { success: false, error: "Yazdırma sunucusuna bağlanılamadı" };
  }
};

/**
 * Yerel sunucu ayarlarını localStorage'dan al
 */
export const getLocalPrintSettings = (restaurantId) => {
  const stored = localStorage.getItem(`local_print_settings_${restaurantId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Yerel yazdırma ayarları okunamadı:", e);
    }
  }
  return {
    enabled: false,
    printerName: null,
    paperSize: "80mm",
  };
};

/**
 * Yerel sunucu ayarlarını kaydet
 */
export const saveLocalPrintSettings = (restaurantId, settings) => {
  localStorage.setItem(`local_print_settings_${restaurantId}`, JSON.stringify(settings));
};

export default {
  checkLocalPrintServer,
  getLocalPrinters,
  printOrderLocal,
  getLocalPrintSettings,
  saveLocalPrintSettings,
};
