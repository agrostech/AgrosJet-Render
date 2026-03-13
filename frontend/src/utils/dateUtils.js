/**
 * Yerel tarih yardımcı fonksiyonları
 * toISOString() UTC tarih döner - Türkiye (UTC+3) için gece 00:00-03:00 arası yanlış gün verir.
 * Bu fonksiyonlar yerel (tarayıcı) saat dilimini kullanır.
 */

/**
 * Yerel tarihi "YYYY-MM-DD" formatında döner.
 * @param {Date} [date=new Date()] - Tarih objesi
 * @returns {string} "YYYY-MM-DD"
 */
export function toLocalDateString(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
