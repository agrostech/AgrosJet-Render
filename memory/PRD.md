# ShiftJet Kurye Yönetim Sistemi - Product Requirements Document

## Original Problem Statement
Kapsamlı bir kurye yönetim sistemi. Temel özellikler:
- Kurye yönetimi (ekleme, düzenleme, fesih, arşivleme)
- Vardiya planlama
- Muhasebe (gelir/gider, taksitler, faturalar)
- Zimmet takibi
- JetPuan market sistemi
- Akademi (eğitim içerikleri)
- Bildirim sistemi
- E-posta bildirimleri

## User Personas
1. **Süper Admin**: Tüm şirketleri yönetir
2. **Şirket Yöneticisi**: Kendi şirketinin kuryelerini ve operasyonlarını yönetir
3. **Kurye**: Kendi verilerini görüntüler, eğitimleri izler

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI
- Backend: FastAPI (Python)
- Database: MongoDB

---

## What's Been Implemented

### January 21, 2026 - İşletme Faturaları (Alınan + Kesilen) (Latest)

#### ✅ COMPLETED: İşletme Faturaları Özelliği
İşletmelerden alınan ve kesilen faturaları takip etmek için yeni modül.

**Yeni Dosyalar:**
- `/app/backend/routers/business_invoices.py`: İşletme faturaları API
- `/app/frontend/src/pages/muhasebe/IsletmeFaturalariTab.jsx`: Yeni tab bileşeni

**Alınan Faturalar Özellikleri:**
- "Faturalar" tab'ı "Kurye Faturaları" olarak yeniden adlandırıldı
- Yeni "İşletme Faturaları" tab'ı eklendi
- Ay seçici (varsayılan: önceki ay, son 12 ay limiti)
- Excel import: "Restoran Raporu.xlsx" dosyasından fatura tutarlarını otomatik aktarma
  - "Restoran Raporu" ve "Banka/Kredi Kartı" sütunları otomatik algılanır
  - Türkçe para formatı (₺1.234,56) desteklenir
- WhatsApp hatırlatma: Tutarı girilen işletmeler için mesaj şablonu ile hatırlatma
- **Birden fazla fatura yükleme desteği** - Aynı işletme için aynı ay birden fazla PDF/resim yüklenebilir
- **Toplu İndir** - Ayın tüm faturalarını ZIP olarak indir
- Fatura görüntüleme, indirme, silme işlemleri

**Kesilen Faturalar Özellikleri:**
- İşletmelere fatura kesildi işareti koyma
- Her tıklamada haftanın Pazartesi günü tarihi kaydedilir
- Birden fazla tıklanabilir (tarih güncellenir)
- Hangi işletmeye en son hangi tarihe kadar fatura kesildiğinin takibi

**API Endpoints:**
- `GET /api/business-invoices/{company_id}/{year}/{month}`: Ay bazlı fatura listesi
- `GET /api/business-invoices/company-details/{company_id}`: Şirket fatura bilgileri
- `POST /api/business-invoices/{company_id}/import-excel`: Excel import
- `POST /api/business-invoices/{company_id}/{year}/{month}/{business_id}/upload`: Fatura yükleme (çoklu)
- `GET /api/business-invoices/{company_id}/{year}/{month}/download-all`: Toplu indirme
- `GET /api/business-invoices/get-issued/{company_id}/{year}/{month}`: Kesilen fatura listesi
- `POST /api/business-invoices/mark-issued/{company_id}/{year}/{month}/{business_id}`: Fatura kesildi işaretle

**Test Sonuçları:** Tüm özellikler frontend ve backend'de test edildi ve çalışıyor.

---

### January 20, 2026 - İzin Güncelleme Otomatik Çıkış

#### ✅ COMPLETED: İzin Güncellendiğinde Otomatik Çıkış
Admin izinleri güncellendiğinde 10 saniye içinde otomatik çıkış yapılıyor.

**Akış:**
1. Superadmin izinleri günceller
2. Backend `permissions_updated_at` timestamp'i kaydeder
3. Frontend her 10 saniyede `/api/auth/check-permissions` endpoint'ini kontrol eder
4. Timestamp değişmişse warning toast gösterir ve login'e yönlendirir

**Önemli:**
- ✅ İzin güncellemesi şifreyi ETKİLEMİYOR
- ✅ Superadmin bu kontrolden muaf
- ✅ Warning toast: "İzinleriniz güncellendi. Yeniden giriş yapmanız gerekiyor."

**Test Sonuçları (iteration_22.json):** Tüm kritik testler geçti

---

### January 20, 2026 - Basit Sayfa Bazlı İzin Sistemi

#### ✅ COMPLETED: Basit Sayfa Bazlı İzin Sistemi
7 sayfa için boolean izinler: vardiya, muhasebe, zimmet, kuryeler, market, akademi, sistem

**Özellikler:**
- Yöneticiler sayfasında Shield (kalkan) butonu ile izin modalı
- Menü filtreleme + route koruması
- Varsayılan: Yeni admin tüm sayfalara erişebilir (sistem hariç)

---

### January 20, 2026 - Fatura Yükleme Düzeltmesi

#### ✅ COMPLETED: Kurye Hakediş Fatura Yükleme
Mobil görünümde dosya (PDF) + fotoğraf yükleme eklendi.

---

## Core Features (All Completed)
- ✅ Kurye yönetimi (CRUD, fesih, arşivleme)
- ✅ Vardiya sistemi
- ✅ Muhasebe (gelir/gider, taksitler, faturalar, cariler, işletmeler)
- ✅ Zimmet takibi
- ✅ JetPuan market sistemi
- ✅ Akademi (video/metin eğitim)
- ✅ Bildirim sistemi
- ✅ E-posta bildirimleri
- ✅ PDF export
- ✅ Sayfa bazlı izin sistemi
- ✅ İzin güncelleme otomatik çıkış

---

## Prioritized Backlog

### P0 - Critical (User Verification Required)
- [ ] **Mobil Dosya Yükleme Hatası** - `accept="*/*"` ile düzeltildi, GERÇEK CİHAZDA TEST GEREKLİ
- [ ] **Eksik Fatura İş Akışı** - E2E test gerekiyor
- [ ] **Kurye Birden Fazla Fatura Görünürlüğü** - Test gerekiyor

### P1 - High Priority
- [ ] İşletme Kesilen Faturalar (kullanıcı sonra istedi)

### P2 - Medium Priority
- [ ] Kod refactoring (büyük dosyaları parçalama) - Kullanıcı de-prioritize etti
- [ ] err.handled temizliği

### P3 - Low Priority
- [ ] Akademi için kalıcı dosya depolama

---

## January 28, 2026 - Mobil Dosya Yükleme Düzeltmesi

### ✅ COMPLETED: P0 Mobil File Upload Fix
Mobil cihazlarda "Dosyalar" seçeneğinin görünmemesi sorunu için `accept` attribute düzeltildi.

**Düzeltilen Dosyalar:**
- `/app/frontend/src/components/faturalar/CourierInvoicesCard.jsx`: `accept="*/*"` olarak güncellendi

**Teknik Detay:**
- Tüm dosya input'ları artık `accept="*/*"` kullanıyor
- iOS ve Android tarayıcıları bu ayarla tüm dosya kaynaklarını göstermeli
- Dosya türü validasyonu JavaScript'te yapılıyor (backend'de de doğrulanıyor)

**Test Edilmesi Gereken Sayfalar:**
1. Mütabakat - Excel yükleme
2. İşletme Faturaları - Fatura yükleme  
3. Kurye Hakediş Faturası - PDF yükleme
4. Kurye Evrak Yükleme - Belge yükleme

**KULLANICI TESTİ ZORUNLU** - Gerçek iOS/Android cihazda doğrulama gerekli.

---

## Test Credentials

### Super Admin
- Username: `onurertas`
- Password: `Delivery32..`

### Test Admin
- Username: `testpermadmin`
- Password: `test123`


---

## Architecture

```
/app/
├── backend/
│   ├── routers/
│   │   ├── auth.py         # Login (permissions field döner)
│   │   ├── admins.py       # Admin CRUD + permissions endpoint
│   │   ├── profile.py      # Profil güncelleme
│   │   ├── accounting.py   # Muhasebe
│   │   ├── shifts.py       # Vardiya
│   │   ├── zimmet.py       # Zimmet
│   │   ├── academy.py      # Akademi
│   │   ├── invoices.py     # Fatura (PDF + resim)
│   │   └── ...
│   └── services/
│       └── courier_service.py
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx      # İzin bazlı menü + route koruması
│       │   ├── admin/
│       │   │   ├── YoneticilerPage.jsx # İzin modalı (Shield butonu)
│       │   │   └── ...
│       │   └── courier/
│       │       └── CourierMuhasebePage.jsx  # Fatura yükleme
│       └── ...
└── memory/
    └── PRD.md
```

---

## January 20, 2026 - PWA "Tekrar Gösterme" Checkbox

### ✅ COMPLETED: PWA Bildiriminde "Bunu tekrar gösterme" Checkbox

PWA "Ana ekrana ekle" bildirimine checkbox eklendi. Kullanıcı işaretlerse bildirim bir daha gösterilmiyor.

**Değişiklikler:**
- `/app/frontend/src/hooks/usePWAInstall.js`: `pwa-install-never-show` localStorage key eklendi
- `/app/frontend/src/components/PWAInstallPrompt.jsx`: Checkbox bileşeni ve state eklendi

**Davranış:**
- Checkbox işaretlenmeden "Daha Sonra" → 7 gün sonra tekrar göster
- Checkbox işaretlenip "Daha Sonra" veya X → Bir daha gösterme

---

## January 20, 2026 - PWA İkon Güncellemesi

### ✅ COMPLETED: PWA İkonları Güncellendi

Masaüstüne eklendiğinde görünen PWA ikonu, ShiftJet logosu ile değiştirildi.

**Değişiklikler:**
- `/app/frontend/public/icon-192.png`: ShiftJet logosu ile yeniden oluşturuldu
- `/app/frontend/public/icon-512.png`: ShiftJet logosu ile yeniden oluşturuldu
- `/app/frontend/public/index.html`: Favicon linkleri yerel dosyalara güncellendi

**İkon Tasarımı:**
- Koyu mavi (#1e3a5f) arka plan
- Ortalanmış ShiftJet logosu (takvim + onay + jet simgesi)

---

## January 20, 2026 - Günlük Tahsilat ve Excel Karşılaştırma Sistemi

### ✅ COMPLETED: Kurye Tahsilat Takip Sistemi

Admin kuryelerden günlük nakit ve Z raporu (kredi kartı) tahsilatlarını kaydedebilir. Excel raporları yüklenip karşılaştırılabilir.

**Yeni Dosyalar:**
- `/app/backend/routers/daily_collections.py`: Günlük tahsilat API
- `/app/backend/routers/daily_reports.py`: Excel yükleme ve karşılaştırma API
- `/app/frontend/src/pages/muhasebe/GunlukTahsilatTab.jsx`: Tahsilat girişi UI
- `/app/frontend/src/pages/muhasebe/ExcelKarsilastirmaTab.jsx`: Excel karşılaştırma UI

**İşletme Vergi Dilimi:**
- İşletme ekleme/düzenleme: %1, %10, %20 vergi dilimi seçimi
- `/app/backend/routers/accounting.py`: `update_business` endpoint eklendi
- `/app/frontend/src/pages/muhasebe/IsletmelerTab.jsx`: Vergi dilimi form alanı ve düzenleme butonu

**Muhasebe Yeni Sekmeler:**
1. **Günlük Tahsilat**: Kurye listesi, nakit ve Z raporu girişi
2. **Excel Karşılaştırma**: Nakit/Kredi Kartı Excel yükle, karşılaştır, farkları işle

**Akış:**
1. Admin → Günlük Tahsilat → Kurye seç → Nakit + %1/%10/%20 kart gir → Kaydet
2. Admin → Excel Karşılaştırma → Nakit Excel + Kart Excel yükle → Karşılaştır
3. Farklar varsa → "İşle" butonu → Kuryeye yeşil (verilen) işlem otomatik eklenir
4. Yanlış vergi dilimi → %34 ceza hesaplanır ve kuryeye eklenir

**DB Collections:**
- `daily_collections`: Günlük tahsilat kayıtları
- `daily_excel_reports`: Yüklenen Excel raporları
