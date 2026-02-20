# ShiftJet PRD - Sipariş Yönetim Sistemi

## Orijinal Problem Bildirimi
Kullanıcı Getir Yemek entegrasyonundaki hataları düzelttikten sonra, kod tabanının karmaşıklığı ve sürekli ortaya çıkan yeni problemler nedeniyle hayal kırıklığına uğradı. Backend (`orders.py`, `getir_service.py`) ve frontend (`RestaurantAnasayfa.jsx`) için derin bir analiz ve büyük bir refactoring çalışması talep edildi.

## Tamamlanan İşler

### Refactoring Özeti (20 Şubat 2025)

#### Backend - orders.py
| İşlem | Detay |
|-------|-------|
| `update_order_status_core()` | Merkezi status güncelleme fonksiyonu - 12 endpoint kullanıyor |
| `assign_courier_core()` | Merkezi kurye atama fonksiyonu - 2 endpoint kullanıyor |
| `check_preparation_times()` | İki ayrı fonksiyon birleştirildi |
| `calculate_distance()` | Duplicate fonksiyonlar birleştirildi |
| Admin status endpoint | Merkezi fonksiyona bağlandı |
| Kurye endpoint'leri | confirm, pickup, not-ready, deliver, reject sadeleştirildi |
| **Kazanım** | **2710 → 2676 = -34 satır** |

#### Backend - getir_service.py
| İşlem | Detay |
|-------|-------|
| `_extract_customer_info()` | Helper fonksiyon - müşteri bilgisi çıkarma |
| `_extract_address_info()` | Helper fonksiyon - adres bilgisi çıkarma |
| `_extract_items()` | Helper fonksiyon - ürün listesi çıkarma |
| `_calculate_scheduled_preparation()` | Helper fonksiyon - ileri tarih hesaplama |
| `_check_timing_wait()` | Helper fonksiyon - 70sn kuralı kontrolü |
| `_extract_error()` | Helper fonksiyon - API hata çıkarma |
| `convert_getir_order_to_shiftjet()` | 247 satırdan ~100 satıra sadeleştirildi |
| `smart_advance_getir_order()` | 153 satırdan ~90 satıra sadeleştirildi |
| `auto_verify_and_prepare` alias | Silindi |
| **Kazanım** | **1995 → 1916 = -79 satır** |

#### Frontend - CourierSiparisPage.jsx
| İşlem | Detay |
|-------|-------|
| `orderUtils.js` import | Duplicate fonksiyonlar kaldırıldı |
| formatTime, formatCurrency | orderUtils'den kullanılıyor |
| calculateDistance, getOrderDistance | orderUtils'den kullanılıyor |
| **Kazanım** | **1674 → 1624 = -50 satır** |

### Toplam Refactoring Kazanımı
```
BAŞLANGIÇ: 6379 satır
FİNAL:     6216 satır
KAZANIM:   163 satır (~%2.5)
```

### Yapısal İyileştirmeler
1. **Merkezi Fonksiyonlar**: Status güncelleme ve kurye atama tek yerden yönetiliyor
2. **Helper Fonksiyonlar**: Kod tekrarı azaltıldı, okunabilirlik arttı
3. **Lint Temizliği**: Kullanılmayan değişkenler ve duplicate kodlar silindi
4. **Backward Compatibility**: Tüm mevcut API'ler çalışmaya devam ediyor

## Bekleyen İşler

### P0 - Kritik
- [ ] SepetTakip entegrasyonu (3. taraf yanıtı bekliyor - BLOKE)

### P1 - Yüksek Öncelik
- [ ] Yemeksepeti entegrasyonu (kullanıcı credentials bekliyor)
- [ ] Raporlar sayfası işlevselliği
- [ ] Adisyo sipariş senkronizasyonu (kullanıcı doğrulaması bekliyor)

### P2 - Orta Öncelik
- [ ] Background task güvenilirliği (kurye uygulaması)
- [ ] Mobile sidebar kurye listesi collapse hatası
- [ ] Migros Yemek entegrasyonu (duraklatıldı)

### P3 - Düşük Öncelik
- [ ] Native kurye uygulaması geliştirme
- [ ] Chat sistemi yeniden etkinleştirme
- [ ] Dark mode tema
- [ ] Motosikletim özelliği geliştirmeleri

## Teknik Borç
- [ ] Historical accounting data tutarsızlığı (migration script gerekli)
- [ ] Mobile file upload sorunu

## 3. Parti Entegrasyonlar
| Platform | Durum | Tip |
|----------|-------|-----|
| Getir Yemek | ✅ Aktif | Polling/Webhook |
| Trendyol Yemek | ✅ Aktif | Polling |
| Adisyo | ⚠️ Doğrulama bekliyor | Polling |
| Yemeksepeti | 🔄 Beklemede | Webhook |
| SepetTakip | ⛔ Bloke | Webhook |
| Migros Yemek | ⏸️ Duraklatıldı | Polling |
| Google Maps | ✅ Aktif | API |

## Test Credentials
- **Super Admin**: onurertas / 125594
- **Restaurant**: bostonddisparta / 123456
- **Getir Test**: development API
