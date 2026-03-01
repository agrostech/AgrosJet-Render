"""
Otomatik Atama Sistemi - Konfigürasyon ve Sabitler

Bu dosyada tüm sabit değerler ve varsayılan ayarlar tanımlıdır.
Değişiklik yapmak için bu dosyayı düzenleyin.
"""

# Varsayılan ayarlar (panel ayarları yoksa bunlar kullanılır)
DEFAULT_SETTINGS = {
    "enabled": False,  # Otomatik atama aktif mi
    "distance_tolerance": 500,  # metre - D_return ile D_idle arasındaki tolerans
    "max_wait_time": 5,  # dakika - Bekleme modunda maksimum süre
    "fairness_threshold": 200,  # metre - Adalet filtresi mesafe eşiği
    "fairness_enabled": False,  # Son 1 saat adalet sistemi aktif mi
    "max_detour": 700,  # metre - Pickup aşamasında maksimum rota sapması
    "check_interval": 30,  # saniye - Dispatch kontrolü aralığı
    "same_location_radius": 30,  # metre - "aynı konum" sayılacak mesafe
    "same_location_max_packages": 10,  # aynı konumda maksimum paket limiti
}

# Kurye varsayılan maksimum paket kapasitesi
DEFAULT_MAX_PACKAGES = 5

# Aday kurye durumları
ELIGIBLE_COURIER_STATUSES = ["active"]

# Aday sipariş durumları (kurye için)
# Boş kurye: 0 yolda
# 1 yolda kurye: tam 1 yolda
ACTIVE_ORDER_STATUSES = ["assigned", "confirmed", "preparing", "on_the_way"]
ON_THE_WAY_STATUS = "on_the_way"

# Sipariş durumu - sadece "ready" olanlar değerlendirilir
READY_ORDER_STATUS = "ready"

# Dispatch log seviyeleri
LOG_LEVELS = {
    "DEBUG": 10,
    "INFO": 20,
    "WARNING": 30,
    "ERROR": 40,
}
