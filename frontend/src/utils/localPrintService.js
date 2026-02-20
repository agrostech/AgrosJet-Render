/**
 * ShiftJet Yerel Yazdırma Sunucusu İstemcisi
 * QZ Tray'e alternatif olarak localhost:5555'te çalışan basit yazdırma sunucusu
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
    const response = await fetch(`${LOCAL_PRINT_SERVER}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: order,
        printer: printerName,
        paper_size: paperSize,
        raw: true,
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
