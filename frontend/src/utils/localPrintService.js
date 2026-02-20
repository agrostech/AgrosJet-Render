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
 * Fiş metni oluştur (Termal yazıcı için)
 */
const generateReceiptText = (order, width = 48) => {
  const lines = [];
  const sep = "=".repeat(width);
  const dash = "-".repeat(width);

  const orderNum = order.order_number || "---";
  const platform = PLATFORM_LABELS[order.platform] || order.platform || "";

  // Başlık
  lines.push(sep);
  lines.push(centerText(`#${orderNum}`, width));
  lines.push(centerText(`[ ${platform.toUpperCase()} ]`, width));
  lines.push(centerText(formatDate(order.created_at), width));
  lines.push(sep);

  // Müşteri
  lines.push("MUSTERI:");
  lines.push(`  ${order.customer_name || "-"}`);
  if (order.customer_phone) {
    lines.push(`  Tel: ${order.customer_phone}`);
  }
  lines.push(dash);

  // Adres
  lines.push("ADRES:");
  let address = order.delivery_address || "-";
  while (address.length > 0) {
    lines.push(`  ${address.slice(0, width - 2)}`);
    address = address.slice(width - 2);
  }
  lines.push(dash);

  // Ürünler
  lines.push("URUNLER:");
  const items = order.items || [];
  items.forEach((item) => {
    const qty = item.quantity || 1;
    const name = item.name || "Urun";
    const price = (item.price || 0) * qty;

    let itemText = `${qty}x ${name}`;
    const priceText = formatCurrency(price);

    if (itemText.length + priceText.length + 2 > width) {
      itemText = itemText.slice(0, width - priceText.length - 3) + "..";
    }

    const spaces = width - itemText.length - priceText.length;
    lines.push(`${itemText}${" ".repeat(Math.max(1, spaces))}${priceText}`);

    if (item.notes) {
      lines.push(`   > ${item.notes.slice(0, width - 5)}`);
    }
  });
  lines.push(sep);

  // Toplam
  const totalText = `TOPLAM: ${formatCurrency(order.total_amount || 0)}`;
  lines.push(rightText(totalText, width));

  // Ödeme yöntemi
  const payment = order.payment_method_detail || 
    PAYMENT_LABELS[order.payment_method] || 
    order.payment_method || "";
  lines.push(centerText(`[ ${payment} ]`, width));

  // Sipariş notu
  if (order.notes) {
    lines.push(dash);
    lines.push("SIPARIS NOTU:");
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${LOCAL_PRINT_SERVER}/status`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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
      message: "Sunucu yanıt vermiyor",
    };
  } catch (error) {
    return {
      available: false,
      connected: false,
      printers: [],
      defaultPrinter: null,
      message: "Yerel yazdırma sunucusu çalışmıyor",
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
