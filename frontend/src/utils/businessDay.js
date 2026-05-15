/**
 * Şirket iş günü (business day) yardımcıları.
 *
 * Backend'deki utils/business_day.py'nin frontend muadili.
 * Bir şirketin "günü" takvim 00:00 yerine `opening_time` (örn. 06:00) ile
 * başlar. Bu nedenle 06:00 öncesi yapılan kontroller önceki takvim gününe aittir.
 */

const WEEKDAYS_TR = [
  "pazar",
  "pazartesi",
  "sali",
  "carsamba",
  "persembe",
  "cuma",
  "cumartesi",
];

const DEFAULT_OPENING_TIME = "06:00";

/**
 * "HH:MM" → [hour, minute] (default 06:00)
 */
const parseHHMM = (value) => {
  try {
    const [h, m] = (value || DEFAULT_OPENING_TIME).split(":").map((n) => parseInt(n, 10));
    return [Number.isFinite(h) ? h : 6, Number.isFinite(m) ? m : 0];
  } catch {
    return [6, 0];
  }
};

/**
 * Şirketin iş gün anahtarını döner ("pazartesi"..."pazar"). Backend ile aynı.
 * Saat openingTime'dan ÖNCEYSE bir önceki takvim gününe atfedilir.
 */
export const getBusinessDayKey = (openingTime = DEFAULT_OPENING_TIME, now = new Date()) => {
  const [openH, openM] = parseHHMM(openingTime);
  const cutoffMinutes = openH * 60 + openM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const businessDate = new Date(now);
  if (nowMinutes < cutoffMinutes) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  return WEEKDAYS_TR[businessDate.getDay()];
};

/**
 * Vardiyanın iş günü içindeki başlangıç dakikası (açılış saatinden ofset).
 * Örnek opening=06:00 ile:
 *   "11:00"  → 5 saat = 300
 *   "23:00"  → 17 saat = 1020
 *   "00:00"  → 18 saat = 1080  (ertesi gün)
 *   "05:30"  → 23.5 saat = 1410 (ertesi gün)
 */
const businessMinutesFromOpening = (timeStr, openingMinutes) => {
  const [h, m] = parseHHMM(timeStr);
  let minutes = h * 60 + m - openingMinutes;
  if (minutes < 0) minutes += 24 * 60; // ertesi takvim gününe sarmala
  return minutes;
};

/**
 * Ardışık vardiyaları birleştir (gece-yarısı aşımı destekli).
 *
 * Örnek (opening=06:00):
 *   [{00:00-03:00}, {11:00-00:00}]  → [{11:00-03:00}]
 *   [{06:00-12:00}, {12:00-18:00}]  → [{06:00-18:00}]
 *   [{11:00-15:00}, {18:00-22:00}]  → değişmez (boşluk var)
 *
 * Sıralama iş gününün başlangıç saatine göre yapılır; birleştirme `end===next.start`
 * eşitliğine bakar.
 */
export const mergeConsecutiveShifts = (shifts, openingTime = DEFAULT_OPENING_TIME) => {
  if (!shifts || shifts.length === 0) return [];

  const [openH, openM] = parseHHMM(openingTime);
  const openingMinutes = openH * 60 + openM;

  // İş gününe göre sırala (açılıştan ofset)
  const sorted = [...shifts].sort((a, b) => {
    return (
      businessMinutesFromOpening(a.start_time, openingMinutes) -
      businessMinutesFromOpening(b.start_time, openingMinutes)
    );
  });

  const merged = [];
  let current = { start: sorted[0].start_time, end: sorted[0].end_time };
  for (let i = 1; i < sorted.length; i++) {
    const shift = sorted[i];
    if (current.end === shift.start_time) {
      current.end = shift.end_time;
    } else {
      merged.push(current);
      current = { start: shift.start_time, end: shift.end_time };
    }
  }
  merged.push(current);
  return merged;
};
