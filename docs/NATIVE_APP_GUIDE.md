# AgrosJet Native Mobil Uygulama Geliştirme Rehberi

Bu döküman, AgrosJet kurye panelini WebView tabanlı native uygulamaya dönüştürmek için gerekli tüm bilgileri içerir.

---

## 1. Genel Mimari

```
┌─────────────────────────────────────────────────────────┐
│                    NATIVE APP                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │                  WebView                         │    │
│  │     https://app.agrosjet.com/kurye/{id}         │    │
│  └─────────────────────────────────────────────────┘    │
│                         ↕                                │
│              JavaScript Bridge                           │
│                         ↕                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Konum      │  │    Push      │  │   Harita     │   │
│  │   Servisi    │  │ Notification │  │   Yönlendirme│   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. URL Yapısı

### Ana URL Format
```
https://app.agrosjet.com/kurye/{courier_id}
```

### Örnek
```
https://app.agrosjet.com/kurye/feae169f-222b-45df-b9e8-0664a186031a
```

### Alt Sayfalar
```
/kurye/{id}              → Siparişler (ana sayfa)
/kurye/{id}/vardiyalar   → Vardiyalarım
/kurye/{id}/muhasebe     → Muhasebe
/kurye/{id}/raporlar     → Raporlar
/kurye/{id}/zimmet       → Zimmetlerim
/kurye/{id}/motosikletim → Motosikletim
/kurye/{id}/akademi      → Akademi
/kurye/{id}/jetpuan      → Market
/kurye/{id}/evraklar     → Evraklar
/kurye/{id}/kvkk         → KVKK ve Gizlilik
```

### Courier ID Alma
URL'den courier_id'yi parse edin:
```javascript
// URL: /kurye/abc123def456/vardiyalar
const pathParts = url.split('/');
const kuryeIndex = pathParts.indexOf('kurye');
const courierId = pathParts[kuryeIndex + 1]; // "abc123def456"
```

---

## 3. JavaScript Bridge Kurulumu

### Native → Web İletişim

Native taraftan web'e veri göndermek için `window` objesine fonksiyonlar ekleyin:

```javascript
// Native app başlatıldığında WebView'a enjekte edin
window.isAgrosJetApp = true;

window.AgrosJetNative = {
    // Push token'ı web'e gönder
    getPushToken: function() {
        // Native'den token al, sonra web'e gönder
        window.dispatchEvent(new CustomEvent('nativeMessage', {
            detail: { type: 'PUSH_TOKEN', data: fcmToken }
        }));
    },
    
    // Konum bilgisini web'e gönder (opsiyonel)
    sendLocation: function(lat, lng) {
        window.dispatchEvent(new CustomEvent('nativeMessage', {
            detail: { type: 'LOCATION_UPDATE', data: { lat, lng } }
        }));
    },
    
    // Login bildir
    notifyLogin: function() {
        // Login başarılı olduğunda çağrılır
    }
};
```

### Web → Native İletişim

Web tarafı `ReactNativeWebView.postMessage()` kullanır:

```javascript
// Web'den native'e mesaj gönderme
if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MESSAGE_TYPE',
        data: { ... }
    }));
}
```

### Mesaj Tipleri (Web → Native)

| Tip | Açıklama | Data |
|-----|----------|------|
| `OPEN_ROUTE` | Harita rotası aç | `{ origin, destination, waypoints, mapsUrl }` |
| `SET_COURIER_ID` | Login sonrası ID bildir | `courierId` |

### Mesaj Tipleri (Native → Web)

| Tip | Açıklama | Data |
|-----|----------|------|
| `PUSH_TOKEN` | FCM token gönder | `"fcm_token_string"` |
| `LOCATION_UPDATE` | Konum bilgisi | `{ lat, lng }` |

---

## 4. Konum Takibi

### Endpoint
```
PUT /api/couriers/{courier_id}/location
```

### Request Body
```json
{
    "latitude": 41.0082,
    "longitude": 28.9784,
    "accuracy": 10.5,
    "speed": 5.2,
    "timestamp": 1740587123456
}
```

### Response
```json
{
    "message": "Konum güncellendi"
}
```

### Uygulama Akışı

```
1. Uygulama açılır
2. Konum izni istenir (foreground + background)
3. Kurye login olur → /kurye/{id} sayfasına gider
4. URL'den courier_id parse edilir
5. Konum takibi başlar (foreground service)
6. Her 10-15 saniyede PUT /api/couriers/{id}/location
7. Uygulama arka plana alınsa bile konum gönderimi devam eder
```

### Android Örnek (Kotlin)
```kotlin
class LocationService : Service() {
    private var courierId: String? = null
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { location ->
                sendLocationToServer(location)
            }
        }
    }
    
    private fun sendLocationToServer(location: Location) {
        val url = "https://app.agrosjet.com/api/couriers/$courierId/location"
        val body = JSONObject().apply {
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("accuracy", location.accuracy)
            put("speed", location.speed)
            put("timestamp", System.currentTimeMillis())
        }
        // HTTP PUT request gönder
    }
}
```

### iOS Örnek (Swift)
```swift
class LocationManager: NSObject, CLLocationManagerDelegate {
    var courierId: String?
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, let id = courierId else { return }
        
        let url = URL(string: "https://app.agrosjet.com/api/couriers/\(id)/location")!
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "speed": location.speed,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request).resume()
    }
}
```

---

## 5. Push Notification (Firebase Cloud Messaging)

### Firebase Projesi
- Project ID: `agrosjet-87852`
- Console: https://console.firebase.google.com/project/agrosjet-87852

### FCM Token Kaydetme

#### Endpoint
```
PUT /api/couriers/{courier_id}/fcm-token
```
veya
```
POST /api/courier/fcm-token
```

#### Request Body
```json
{
    "fcm_token": "dGVzdF90b2tlbl8xMjM0NTY3ODkw...",
    "courier_id": "feae169f-222b-45df-b9e8-0664a186031a"  // POST için gerekli
}
```

#### Response
```json
{
    "success": true,
    "message": "FCM token kaydedildi"
}
```

### Token Alma ve Gönderme Akışı

```
1. Firebase SDK'yı initialize et
2. FCM token al
3. Token'ı web'e gönder (JavaScript Bridge ile)
4. Web otomatik olarak backend'e kaydeder
   VEYA
5. Direkt native'den backend'e POST et
```

### Android Örnek
```kotlin
class MyFirebaseService : FirebaseMessagingService() {
    
    override fun onNewToken(token: String) {
        // Token'ı backend'e gönder
        sendTokenToServer(token)
        
        // Veya WebView'a gönder
        webView.evaluateJavascript("""
            window.dispatchEvent(new CustomEvent('nativeMessage', {
                detail: { type: 'PUSH_TOKEN', data: '$token' }
            }));
        """, null)
    }
    
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        
        when (data["type"]) {
            "NEW_ORDER" -> {
                showOrderNotification(
                    title = message.notification?.title ?: "Yeni Sipariş!",
                    body = message.notification?.body ?: "",
                    orderId = data["order_id"]
                )
            }
            "ORDER_CANCELLED" -> {
                showCancelNotification(data["order_id"])
            }
        }
    }
    
    private fun sendTokenToServer(token: String) {
        val url = "https://app.agrosjet.com/api/couriers/$courierId/fcm-token"
        // PUT request
    }
}
```

### iOS Örnek
```swift
extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        
        // WebView'a gönder
        webView.evaluateJavaScript("""
            window.dispatchEvent(new CustomEvent('nativeMessage', {
                detail: { type: 'PUSH_TOKEN', data: '\(token)' }
            }));
        """)
        
        // Veya direkt backend'e gönder
        sendTokenToServer(token)
    }
}
```

### Bildirim Payload Formatı

Backend'den gelen bildirim:
```json
{
    "notification": {
        "title": "Yeni Sipariş!",
        "body": "Restaurant ABC - Örnek Mahallesi..."
    },
    "data": {
        "type": "NEW_ORDER",
        "order_id": "ORD123456",
        "restaurant_name": "Restaurant ABC",
        "address": "Örnek Mahallesi, Örnek Sokak No:1"
    },
    "android": {
        "priority": "high",
        "notification": {
            "channel_id": "orders",
            "sound": "default"
        }
    }
}
```

### Android Notification Channel
```kotlin
// Uygulama başlatıldığında
val channel = NotificationChannel(
    "orders",
    "Sipariş Bildirimleri",
    NotificationManager.IMPORTANCE_HIGH
).apply {
    description = "Yeni sipariş bildirimleri"
    enableVibration(true)
    setSound(defaultSoundUri, audioAttributes)
}
notificationManager.createNotificationChannel(channel)
```

---

## 6. Harita Entegrasyonu

### Rota Açma (Web → Native)

Web, rota açmak istediğinde şu mesajı gönderir:

```javascript
window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'OPEN_ROUTE',
    data: {
        origin: { lat: 41.0082, lng: 28.9784 },
        destination: { lat: 41.0122, lng: 28.9760 },
        waypoints: [
            { lat: 41.0095, lng: 28.9770, address: "Adres 1", orderId: "ORD001" },
            { lat: 41.0110, lng: 28.9755, address: "Adres 2", orderId: "ORD002" }
        ],
        mapsUrl: "https://www.google.com/maps/dir/?api=1&origin=41.0082,28.9784&destination=41.0122,28.9760&waypoints=41.0095,28.9770|41.0110,28.9755&travelmode=driving"
    }
}));
```

### Native Tarafta İşleme

```kotlin
// Android
fun handleRouteMessage(data: JSONObject) {
    val mapsUrl = data.getString("mapsUrl")
    
    // Kullanıcıya harita seçtir
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(mapsUrl))
    
    // Veya direkt Google Maps
    val gmmIntentUri = Uri.parse(mapsUrl)
    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
    mapIntent.setPackage("com.google.android.apps.maps")
    startActivity(mapIntent)
}
```

### Waypoints Formatı
Google Maps URL'inde waypoints `|` ile ayrılır ve URL encode edilmelidir:
```
&waypoints=41.0095,28.9770%7C41.0110,28.9755
```

---

## 7. Önemli Notlar

### WebView Ayarları
```kotlin
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true  // localStorage için
    allowFileAccess = true
    allowContentAccess = true
    geolocationEnabled = true
    mediaPlaybackRequiresUserGesture = false
}
```

### CORS ve Güvenlik
- WebView'da `*` origin kabul edilir
- Native HTTP isteklerinde header gerekmez
- SSL certificate pinning önerilir (production)

### Offline Handling
- Konum verisi offline'da cache'lenir
- İnternet gelince toplu gönderilir
- WebView offline sayfası gösterilir

### Battery Optimization
- Konum güncelleme sıklığı: 10-15 saniye
- Background'da daha seyrek (30 saniye)
- Doze mode için foreground service kullan

### Test Checklist
- [ ] Login akışı çalışıyor
- [ ] URL'den courier_id parse ediliyor
- [ ] Konum izni alınıyor
- [ ] Konum backend'e gönderiliyor (PUT /api/couriers/{id}/location)
- [ ] FCM token alınıyor
- [ ] FCM token backend'e kaydediliyor
- [ ] Push notification alınıyor
- [ ] Rota açma çalışıyor (tüm waypoints ile)
- [ ] Background'da konum gönderimi devam ediyor

---

## 8. API Endpoint Özeti

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| PUT | `/api/couriers/{id}/location` | Konum güncelle |
| PUT | `/api/couriers/{id}/fcm-token` | FCM token güncelle |
| POST | `/api/courier/fcm-token` | FCM token kaydet (alternatif) |
| GET | `/api/couriers/{id}` | Kurye bilgisi al |
| PUT | `/api/couriers/{id}/availability` | Durum güncelle (active/offline/on_break) |

---

## 9. Troubleshooting

### Konum Gönderilmiyor
1. Konum izni verilmiş mi? (foreground + background)
2. courier_id doğru parse edilmiş mi?
3. Network bağlantısı var mı?
4. Backend 200 dönüyor mu?

### Push Gelmiyor
1. FCM token kaydedilmiş mi? (DB'de kontrol et)
2. Firebase project doğru mu?
3. Notification channel oluşturulmuş mu? (Android)
4. Background notification izni var mı? (iOS)

### Rota Tek Nokta Gösteriyor
1. Waypoints URL encode edilmiş mi?
2. `|` karakteri `%7C` olarak encode edilmeli
3. Web'den gelen mapsUrl'i direkt kullan

---

## 10. İletişim

Backend API Base URL: `https://app.agrosjet.com/api`

Test için örnek courier_id: `feae169f-222b-45df-b9e8-0664a186031a`
