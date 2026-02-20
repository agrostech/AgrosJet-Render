# ShiftJet Yerel Yazdırma Sunucusu

Sessiz yazdırma için basit yerel sunucu. QZ Tray'e alternatif olarak geliştirilmiştir.

## Kurulum

### Gereksinimler
- Windows 10/11
- Python 3.8+ (https://python.org)

### Adım 1: Python Kur
1. https://python.org/downloads adresinden Python indirin
2. Kurulum sırasında **"Add Python to PATH"** seçeneğini işaretleyin
3. Kurulumu tamamlayın

### Adım 2: Gerekli Paketleri Yükle
Komut İstemi (CMD) açın ve şunu çalıştırın:
```
pip install pywin32 pillow
```

### Adım 3: Programı Çalıştır
```
python shiftjet_print_server.py
```

## Kullanım

1. Programı çalıştırın (CMD'de veya çift tıklayarak)
2. "Sunucu başlatıldı" mesajını görün
3. ShiftJet'te Ayarlar > Sessiz Yazdırma'yı açın
4. "Yerel Sunucu" seçeneğini etkinleştirin

## API Endpointleri

### Durum Kontrolü
```
GET http://localhost:5555/status
```

### Yazıcı Listesi
```
GET http://localhost:5555/printers
```

### Yazdırma
```
POST http://localhost:5555/print
Content-Type: application/json

{
  "order": { ... sipariş objesi ... },
  "printer": "Yazıcı Adı",  // opsiyonel, varsayılan yazıcı kullanılır
  "paper_size": "80mm",      // "58mm" veya "80mm"
  "raw": true                // ESC/POS modu
}
```

## .exe Olarak Derleme (Opsiyonel)

Programı .exe olarak derlemek için:

```
pip install pyinstaller
pyinstaller --onefile --noconsole shiftjet_print_server.py
```

Derlenen dosya `dist/shiftjet_print_server.exe` konumunda olacaktır.

## Sorun Giderme

### "Port 5555 zaten kullanımda" hatası
- Başka bir ShiftJet Print Server çalışıyor olabilir
- Görev Yöneticisi'nden kapatın veya bilgisayarı yeniden başlatın

### "Yazıcı bulunamadı" hatası
- Yazıcınızın bilgisayara bağlı ve açık olduğundan emin olun
- Windows Ayarlar > Yazıcılar bölümünde yazıcıyı kontrol edin

### Türkçe karakterler bozuk çıkıyor
- Yazıcınızın CP857 veya CP1254 kod sayfasını desteklediğinden emin olun
- Çoğu termal yazıcı bunu destekler

## Otomatik Başlatma (Windows)

Programın Windows başlangıcında otomatik çalışması için:

1. `Win + R` tuşlarına basın
2. `shell:startup` yazın ve Enter'a basın
3. `shiftjet_print_server.exe` dosyasının kısayolunu bu klasöre kopyalayın
