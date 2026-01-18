# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi.

## What's Been Implemented

### Kurye Dashboard (17 Ocak 2026 - YENİ)
- [x] **CourierDashboard.jsx** - Ana layout (sidebar, routing)
- [x] **CourierVardiyalarPage.jsx** - Kuryenin haftalık vardiya programı (read-only)
- [x] **CourierMuhasebePage.jsx** - İşlem geçmişi, bakiye, taksitli ürünler (read-only)
- [x] **CourierZimmetPage.jsx** - Zimmetli ürünler listesi (read-only)
- [x] **Backend API** - `/api/zimmet/courier/{id}/assignments`
- [x] Admin dashboard tasarım dili korundu
- [x] Modüler yapı (courier/ klasörü altında)

### Taksitli Ürün Özelliği (17 Ocak 2026)
- [x] Ürün ekleme, taksit alma, ilerleme takibi
- [x] İşlem silinirse taksit geri eklenir

### Sistem Sekmesi (17 Ocak 2026)
- [x] Sidebar'a eklendi (SlidersHorizontal ikonu)
- [x] Placeholder sayfa

### Muhasebe İşlem Düzenleme (17 Ocak 2026)
- [x] Tüm sekmelerde düzenleme modalı

### Backend/Frontend Refactoring (Tamamlandı)
- [x] Modüler yapı

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Kurye**: `05551234567` / `123456`

## Kurye Dashboard Test Durumu (17 Ocak 2026)
- [x] Vardiyalarım - Çalışıyor (haftalık program görüntüleniyor)
- [x] Muhasebe - Çalışıyor (bakiye renkleri ters çevrilmiş, taksitli ürünler gösteriliyor)
- [x] Zimmetlerim - Çalışıyor (sadece ürün listesi, özet kartlar kaldırıldı)
- [x] Sidebar - Admin ile aynı tasarım (collapse özelliği mevcut)

### Vardiya Görüntüleme İyileştirmeleri (17 Ocak 2026)
- [x] Ardışık vardiyalar birleştiriliyor (10:00-11:00, 11:00-12:00 → 10:00-12:00)
- [x] Vardiya yoksa veya izinliyse "İzinli" gösteriliyor
- [x] 06:00 gün başlangıcı kuralı ile sıralama
- [x] POS cihazı zimmetinde "Pos SN:" gösterimi

### Fatura Yönetimi Sistemi (17 Ocak 2026)
- [x] **Backend**: `/api/invoices/` endpoint'leri (upload, delete, download, bulk download)
- [x] **Kurye Paneli**: Hakediş işlemlerinde "Fatura Yükle" butonu
- [x] **Kurye Paneli**: Yüklenen faturaları görme, indirme, silme (24 saat içinde)
- [x] **Admin Paneli**: Muhasebe → Faturalar alt sekmesi
- [x] **Admin Paneli**: 2x2 grid layout (Kuryeler, Kurye Faturaları, Ay Faturaları, Eksik Faturalar)
- [x] **Admin Paneli**: Ay bazında filtreleme, tekli/toplu indirme (ZIP)
- [x] Dosya isimlendirme: KuryeAdSoyad_HaftaninSalisi.pdf

### Fesih (Termination) Özelliği (17 Ocak 2026)
- [x] Admin kuryeler için 15 günlük fesih süreci başlatabilir
- [x] Kurye panelinde fesih uyarısı ve geri sayım gösterimi
- [x] Admin fesih sürecini iptal edebilir

### Evraklar (Documents) Sistemi (18 Ocak 2026)
- [x] **Backend**: `/api/documents/` endpoint'leri (upload, view, delete, download-all ZIP)
- [x] **Kurye Paneli**: Yeni "Evraklar" sekmesi (evraklar eksikse görünür)
- [x] **8 Evrak Türü:**
  - Şirket Sözleşmesi (14 fotoğraf)
  - Kimlik Ön Yüz (1 fotoğraf)
  - Kimlik Arka Yüz (1 fotoğraf)
  - Ehliyet Ön Yüz (1 fotoğraf)
  - Ehliyet Arka Yüz (1 fotoğraf)
  - Araç Ruhsatı (1 fotoğraf)
  - Adli Sicil Kaydı (1 PDF)
  - İkametgah Belgesi (1 PDF)
- [x] İlerleme çubuğu ve yüzde gösterimi (0/21 → 100%)
- [x] Tüm evraklar yüklenince sekme otomatik gizlenir
- [x] **Admin Paneli**: Kurye detaylarında Bilgiler/Evraklar sekmeleri
- [x] Admin evrakları görüntüleyebilir, silebilir, toplu ZIP indirebilir
- [x] Admin evrak silerse kurye tarafında sekme tekrar görünür
- [x] Dosya isimlendirme: KuryeAdi_EvrakTuru_Index.uzanti

### JetPuan Market Sistemi (18 Ocak 2026)
- [x] **Backend**: `/api/jetpuan/` endpoint'leri (categories, products, orders, settings, balance, transactions)
- [x] **Otomatik Puan Yükleme**: Hakediş girişinde otomatik JetPuan yükleme (100 TL = 1.17 JP, oran ayarlanabilir)
- [x] **Hakediş Silinirse**: JetPuan da otomatik silinir
- [x] **Admin Paneli - JetPuan Market sekmesi:**
  - Siparişler: Bekleyen/Teslim Edilmiş, Teslim Et, İptal Et (ilk sekme)
  - Kategoriler: CRUD işlemleri (sadece isim)
  - Ürünler: CRUD işlemleri (isim, açıklama, fiyat, stok, kategori, görsel URL)
  - Ayarlar: Puan oranı ayarı, Manuel JetPuan Ekle/Sil
- [x] **Kurye Paneli - JetPuan Market sekmesi:**
  - Market → Siparişlerim → Puan Geçmişi (sekme sıralaması)
  - Bakiye gösterimi, Sepet, Sipariş oluşturma

### Bildirim Sistemi (18 Ocak 2026 - YENİ)
- [x] **Backend**: `/api/notifications/` endpoint'leri
- [x] **Güncel Durum sayfasında**: "Bildirimler" butonu (Yenile yanında)
- [x] **Bildirim Kaynakları:**
  - Muhasebe hareketler logları (yeni işlem, silme, güncelleme)
  - Zimmet hareketleri (atama, alma, ürün ekleme/silme)
  - JetPuan Market yeni sipariş
  - Evrak yüklendi
  - Kurye fesih süresi 3 gün kaldı
  - Kurye fesih süresi yarın doluyor
- [x] Okundu işaretleme, toplu okundu, silme özellikleri
- [x] Badge ile okunmamış bildirim sayısı

### Vardiya Sayfası Mobil Uyumluluk (18 Ocak 2026)
- [x] **Responsive tasarım** - Mobil ve masaüstü görünüm ayrı optimizasyon
- [x] **Mobil görünüm:**
  - Gün başlıkları kısa: Pt, Sa, Ça, Pe, Cu, Ct, Pa
  - Vardiya sütunu "V" olarak kısaltıldı
  - Vardiya saatleri iki satıra ayrıldı (06:00 / 14:00)
  - Kurye sayısı sadece rakam (1, 12)
  - Küçültülmüş padding ve font boyutları
  - İzinliler satırı "İzin" olarak kısaltıldı
- [x] **Masaüstü görünüm korundu:**
  - Tam gün isimleri: Pzt, Sal, Çar, Per, Cum, Cmt, Paz
  - "Vardiya" sütun başlığı
  - Vardiya saatleri tek satırda: 06:00-14:00
  - "X kişi" badge formatı
  - "İzinliler" tam yazı

### Güncel Durum - Vardiya Takibi Mobil İyileştirmesi (18 Ocak 2026)
- [x] **Collapse/Expand sistemi** - Mobilde kurye listesi varsayılan kapalı
- [x] **Mobil görünüm:**
  - Her vardiya kartı kompakt (sadece sayı ve saat görünür)
  - Aşağı ok (chevron) ile kurye listesi açılır
  - Açılan liste badge'ler halinde kurye isimlerini gösterir
  - Sayfa uzamaz, sadece seçilen vardiya genişler
- [x] **Masaüstü görünüm korundu:**
  - Kurye isimleri inline badge olarak görünür
  - Expand butonu gizli (sm:hidden)
  - 2 sütunlu grid layout

### Google Entegrasyonu (18 Ocak 2026 - YENİ)
- [x] **Backend**: `/api/google/` router'ı eklendi
  - `/api/google/settings/{company_id}` - GET/POST/DELETE ayarlar
  - `/api/google/oauth/connect/{company_id}/{service}` - OAuth akışı başlatma
  - `/api/google/oauth/callback` - OAuth callback
  - `/api/google/oauth/disconnect/{company_id}/{service}` - Bağlantı kesme
  - `/api/google/drive/upload/{company_id}` - Drive'a dosya yükleme
  - `/api/google/gmail/send/{company_id}` - Gmail ile e-posta gönderme
  - `/api/google/test/drive/{company_id}` - Drive bağlantı testi
  - `/api/google/test/gmail/{company_id}` - Gmail bağlantı testi
- [x] **Frontend - Sistem Sayfası**: Google Entegrasyonu kartı
  - Google Cloud Console kurulum talimatları
  - Client ID, Client Secret, Drive Klasör ID form alanları
  - Google Drive servisi - Bağlan/Bağlantıyı Kes/Test Et butonları
  - Gmail servisi - Bağlan/Bağlantıyı Kes/Test Et butonları
  - Aktif/Pasif toggle switch'leri
- [x] **Dinamik Domain Desteği**: OAuth redirect URI'leri request'ten otomatik alınır
  - Deploy sonrası domain değişse bile sistem otomatik uyum sağlar
  - Her şirket kendi Google hesabını bağlayabilir (multi-tenant)
- [x] **Mobil Uyumluluk**: Sistem sayfası tamamen responsive
  - Collapsible kartlar (Şirket Bilgileri varsayılan kapalı)
  - Mobil için optimize edilmiş form ve butonlar
- [x] **Yardımcı Fonksiyonlar**: `upload_file_to_drive_if_enabled()`, `send_notification_email_if_enabled()`
- [x] **MongoDB Koleksiyonları**: `google_settings`, `google_credentials`

## Prioritized Backlog
- [ ] Toplu Hakediş Girişi (ON HOLD)
- [ ] Google entegrasyonunu mevcut evrak/fatura yükleme akışlarına bağlama
- [ ] Gmail entegrasyonunu bildirim sistemine bağlama

### Refactoring ve Sistem Sağlığı (18 Ocak 2026)
- [x] **Health Check Endpoint**: `/api/health` - Veritabanı ve sistem durumu kontrolü
- [x] **Pydantic Modeller**: `/app/backend/models/schemas.py` dosyasına taşındı
- [x] **Kurye Aktif/Pasif Sistemi**: Kuryeler artık silinmek yerine pasife alınabiliyor
  - Zimmet ve bakiye kontrolü (pasife almadan önce)
  - Aktif/Pasif sekmeleri
- [x] **Loading Spinner**: Tüm sayfalarda ShiftJet logosu ile merkezi spinner
- [x] **Akademi Modülü**: Placeholder sayfalar (admin + kurye paneli)
- [x] **İsim Değişiklikleri**: 
  - "Güncel Durum" → "Anasayfa"
  - "JetPuan Market" → "Market"
- [x] **Alfabetik Sıralama**: Muhasebe listeleri ve kurye listesi
