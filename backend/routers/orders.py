"""
Sipariş Yönetimi API
Mock data ile başlangıç - Adisyo entegrasyonu sonra eklenecek
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random

from utils.database import db

router = APIRouter(prefix="/api/orders", tags=["Sipariş Yönetimi"])


# --- Pydantic Models ---
class OrderAssign(BaseModel):
    courier_id: str
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: str  # preparing, ready, assigned, on_the_way, delivered, cancelled
    preparation_time: Optional[int] = None  # Hazırlanıyor durumu için süre (dakika)
    courier_id: Optional[str] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


# --- Sipariş Durumları ---
ORDER_STATUSES = {
    "preparing": {"label": "Hazırlanıyor", "color": "yellow"},
    "ready": {"label": "Hazır", "color": "orange"},
    "assigned": {"label": "Kurye Atandı", "color": "purple"},
    "confirmed": {"label": "Onaylandı", "color": "blue"},  # Kurye siparişi onayladı
    "on_the_way": {"label": "Yolda", "color": "cyan"},
    "delivered": {"label": "Teslim Edildi", "color": "green"},
    "cancelled": {"label": "İptal Edildi", "color": "red"}
}

# Kurye ataması kaldırılacak durumlar
COURIER_REMOVAL_STATUSES = ["preparing", "ready", "cancelled"]

# Admin tarafından seçilemeyen durumlar (sadece kurye seçebilir veya otomatik atanır)
COURIER_ONLY_STATUSES = ["assigned", "confirmed"]


# --- Mock Data Generator ---
async def generate_mock_orders(company_id: str, count: int = 5):
    """Test amaçlı mock sipariş oluştur - Şirketin bulunduğu şehirden"""
    
    # Şirket bilgilerini al (şehir koordinatları için)
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "city": 1, "city_lat": 1, "city_lng": 1}
    )
    
    # Şirketin restoranlarını al (hazırlık süresi dahil)
    restaurants = await db.restaurants.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "preparation_time": 1}
    ).to_list(50)
    
    if not restaurants:
        return []
    
    # Şirket şehrine göre mahalle ve sokak bilgileri
    city_neighborhoods = {
        "Mersin": {
            "neighborhoods": [
                "Akdeniz", "Mezitli", "Yenişehir", "Toroslar", "Pozcu",
                "Forum", "Liparis", "Güvenevler", "Çankaya", "Bahçe"
            ],
            "streets": [
                "Gazi Mustafa Kemal Bulvarı", "İsmet İnönü Bulvarı", "Atatürk Caddesi",
                "Silifke Caddesi", "Hal Caddesi", "Çankaya Caddesi", "Kuvai Milliye Caddesi",
                "Hastane Caddesi", "Liman Caddesi", "Sahil Yolu"
            ],
            "base_lat": 36.8121,
            "base_lng": 34.6415
        },
        "Isparta": {
            "neighborhoods": [
                "Merkez", "Çünür", "Pirimehmet", "İstiklal", "Yayla",
                "Emre", "Sermet", "Turan", "Keçeci", "Modernevler"
            ],
            "streets": [
                "Süleyman Demirel Bulvarı", "İstasyon Caddesi", "Mimar Sinan Caddesi",
                "Cengiz Topel Caddesi", "113. Cadde", "Doğancı Caddesi", "Gazi Kemal Caddesi",
                "Yaşar Kemal Caddesi", "SDÜ Caddesi", "Gölcük Yolu"
            ],
            "base_lat": 37.7648,
            "base_lng": 30.5566
        },
        "İstanbul": {
            "neighborhoods": [
                "Kadıköy", "Beşiktaş", "Üsküdar", "Maltepe", "Ataşehir",
                "Şişli", "Bakırköy", "Fatih", "Beyoğlu", "Sarıyer"
            ],
            "streets": [
                "Bağdat Caddesi", "Barbaros Bulvarı", "İstiklal Caddesi", "Halaskargazi Caddesi",
                "Moda Caddesi", "Vatan Caddesi", "Bağlarbaşı Caddesi", "Maslak Caddesi"
            ],
            "base_lat": 41.0082,
            "base_lng": 28.9784
        },
        "Ankara": {
            "neighborhoods": [
                "Çankaya", "Kızılay", "Bahçelievler", "Keçiören", "Yenimahalle",
                "Etimesgut", "Mamak", "Altındağ", "Sincan", "Pursaklar"
            ],
            "streets": [
                "Atatürk Bulvarı", "Tunalı Hilmi Caddesi", "Kızılay Caddesi", "Bahçelievler Caddesi",
                "Hoşdere Caddesi", "Çetin Emeç Bulvarı", "Eskişehir Yolu"
            ],
            "base_lat": 39.9334,
            "base_lng": 32.8597
        },
        "İzmir": {
            "neighborhoods": [
                "Alsancak", "Konak", "Karşıyaka", "Bornova", "Buca",
                "Bayraklı", "Çiğli", "Gaziemir", "Balçova", "Narlıdere"
            ],
            "streets": [
                "Kordon Boyu", "Atatürk Caddesi", "Cumhuriyet Bulvarı", "Fevzipaşa Bulvarı",
                "Alsancak Caddesi", "Kıbrıs Şehitleri Caddesi"
            ],
            "base_lat": 38.4192,
            "base_lng": 27.1287
        },
        "Antalya": {
            "neighborhoods": [
                "Muratpaşa", "Konyaaltı", "Kepez", "Lara", "Kaleiçi",
                "Varsak", "Hurma", "Güzeloba", "Şirinyalı", "Meltem"
            ],
            "streets": [
                "Atatürk Caddesi", "Lara Caddesi", "Konyaaltı Caddesi", "Fener Caddesi",
                "Işıklar Caddesi", "Şarampol Caddesi", "Ali Çetinkaya Caddesi"
            ],
            "base_lat": 36.8969,
            "base_lng": 30.7133
        },
        "Bursa": {
            "neighborhoods": [
                "Osmangazi", "Nilüfer", "Yıldırım", "Görükle", "Altıparmak",
                "Çekirge", "Heykel", "Setbaşı", "Mudanya", "Gemlik"
            ],
            "streets": [
                "Atatürk Caddesi", "Altıparmak Caddesi", "Çekirge Caddesi", "Stadyum Caddesi",
                "İzmir Yolu", "FSM Bulvarı", "Mudanya Caddesi"
            ],
            "base_lat": 40.1828,
            "base_lng": 29.0665
        }
    }
    
    # Bilinmeyen şehirler için genel Türkiye mahalle/sokak isimleri
    default_city_data = {
        "neighborhoods": [
            "Merkez", "Yenimahalle", "Cumhuriyet", "Atatürk", "İstiklal",
            "Fatih", "Bahçelievler", "Yeşilyurt", "Güneşli", "Çarşı"
        ],
        "streets": [
            "Atatürk Caddesi", "Cumhuriyet Caddesi", "İstiklal Caddesi", "Hürriyet Caddesi",
            "Gazi Caddesi", "Çarşı Caddesi", "İnönü Caddesi", "Hastane Caddesi"
        ]
    }
    
    # Şirketin şehrini al veya varsayılan kullan
    city_name = company.get("city", "") if company else ""
    city_data = city_neighborhoods.get(city_name, default_city_data)
    
    # Şirketin koordinatlarını kullan veya şehir varsayılanını
    base_lat = company.get("city_lat", city_data["base_lat"]) if company else city_data["base_lat"]
    base_lng = company.get("city_lng", city_data["base_lng"]) if company else city_data["base_lng"]
    
    # Dinamik adresler oluştur (şirket konumu etrafında ~3km yarıçapta)
    def generate_address():
        neighborhood = random.choice(city_data["neighborhoods"])
        street = random.choice(city_data["streets"])
        building_no = random.randint(1, 200)
        
        # Rastgele konum (merkez etrafında ~3km)
        lat_offset = random.uniform(-0.025, 0.025)  # ~2.5km
        lng_offset = random.uniform(-0.025, 0.025)
        
        return {
            "address": f"{neighborhood}, {street} No:{building_no}",
            "lat": base_lat + lat_offset,
            "lng": base_lng + lng_offset
        }
    
    sample_customers = [
        "Ahmet Yılmaz", "Mehmet Demir", "Ayşe Kaya", "Fatma Öztürk", "Ali Çelik",
        "Zeynep Arslan", "Hüseyin Şahin", "Emine Yıldız", "Mustafa Aydın", "Hatice Koç"
    ]
    
    sample_items = [
        [{"name": "Lahmacun", "quantity": 3, "price": 45}],
        [{"name": "Adana Kebap", "quantity": 2, "price": 180}, {"name": "Ayran", "quantity": 2, "price": 15}],
        [{"name": "İskender", "quantity": 1, "price": 220}],
        [{"name": "Pide Karışık", "quantity": 2, "price": 120}, {"name": "Cacık", "quantity": 1, "price": 35}],
        [{"name": "Döner Dürüm", "quantity": 4, "price": 85}],
        [{"name": "Tavuk Şiş", "quantity": 2, "price": 150}, {"name": "Pilav", "quantity": 2, "price": 30}],
        [{"name": "Köfte Ekmek", "quantity": 3, "price": 65}],
        [{"name": "Pizza Margarita", "quantity": 1, "price": 180}, {"name": "Kola", "quantity": 2, "price": 25}],
    ]
    
    orders = []
    
    for i in range(count):
        restaurant = random.choice(restaurants)
        delivery = generate_address()  # Dinamik adres oluştur
        customer = random.choice(sample_customers)
        items = random.choice(sample_items)
        
        total = sum(item["price"] * item["quantity"] for item in items)
        
        # Şimdi oluştur (geri sayım için)
        created_at = datetime.now(timezone.utc)
        
        # Restoran hazırlık süresi (varsayılan 15 dakika)
        prep_time = restaurant.get("preparation_time", 15)
        preparation_end_at = created_at + timedelta(minutes=prep_time)
        
        order = {
            "id": str(uuid.uuid4()),
            "order_number": f"ORD-{random.randint(1000, 9999)}",
            "company_id": company_id,
            "restaurant_id": restaurant["id"],
            "restaurant_name": restaurant["name"],
            "restaurant_location": {
                "latitude": restaurant.get("latitude", base_lat),
                "longitude": restaurant.get("longitude", base_lng)
            },
            "customer_name": customer,
            "customer_phone": f"05{random.randint(30, 59)}{random.randint(1000000, 9999999)}",
            "delivery_address": delivery["address"],
            "delivery_location": {
                "latitude": delivery["lat"],
                "longitude": delivery["lng"]
            },
            "items": items,
            "total_amount": total,
            "payment_method": random.choice(["cash", "card", "online"]),
            "status": "preparing",  # Yeni siparişler hazırlanıyor ile başlar
            "preparation_time": prep_time,  # Hazırlık süresi (dakika)
            "preparation_end_at": preparation_end_at.isoformat(),  # Hazırlık bitiş zamanı
            "courier_id": None,
            "courier_name": None,
            "assigned_at": None,
            "confirmed_at": None,
            "delivered_at": None,
            "notes": random.choice(["", "", "Kapıda ödeme", "Zile basma, ara", "Acele"]),
            "source": "mock",  # mock veya adisyo
            "created_at": created_at.isoformat(),
            "updated_at": created_at.isoformat(),
            "status_history": [
                {
                    "status": "preparing",
                    "label": "Sipariş Alındı",
                    "timestamp": created_at.isoformat(),
                    "note": f"Hazırlık süresi: {prep_time} dakika",
                    "actor_type": "system",  # system, admin, courier
                    "actor_name": "Sistem"
                }
            ]
        }
        
        orders.append(order)
    
    # Veritabanına kaydet
    if orders:
        await db.orders.insert_many(orders)
    
    return orders


# --- Endpoints ---

@router.get("/{company_id}")
async def get_orders(
    company_id: str, 
    status: Optional[str] = None,
    courier_id: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    limit: int = 50
):
    """Şirkete ait siparişleri getir"""
    # Önce hazırlık süresi dolan siparişleri güncelle
    await check_preparation_times(company_id)
    
    query = {"company_id": company_id}
    
    if status:
        if status == "active":
            # Aktif siparişler: teslim edilmemiş ve iptal edilmemiş
            query["status"] = {"$nin": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    
    if courier_id:
        query["courier_id"] = courier_id
    
    if restaurant_id:
        query["restaurant_id"] = restaurant_id
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    return orders


# --- Mock Data Endpoints (order_id'den önce olmalı) ---

@router.post("/{company_id}/generate-mock")
async def generate_mock(company_id: str, count: int = 5):
    """Test amaçlı mock sipariş oluştur"""
    orders = await generate_mock_orders(company_id, count)
    return {"message": f"{len(orders)} mock sipariş oluşturuldu", "count": len(orders)}


@router.delete("/{company_id}/clear-mock")
async def clear_mock_orders(company_id: str):
    """Tüm mock siparişleri sil"""
    result = await db.orders.delete_many({"company_id": company_id, "source": "mock"})
    return {"message": f"{result.deleted_count} mock sipariş silindi"}


# --- İstatistikler (order_id'den önce olmalı) ---

@router.get("/{company_id}/stats/summary")
async def get_order_stats(company_id: str):
    """Sipariş özet istatistikleri"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Bugünkü siparişler
    today_orders = await db.orders.count_documents({
        "company_id": company_id,
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Aktif siparişler
    active = await db.orders.count_documents({
        "company_id": company_id,
        "status": {"$nin": ["delivered", "cancelled"]}
    })
    
    # Teslim edilen
    delivered = await db.orders.count_documents({
        "company_id": company_id,
        "status": "delivered",
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "today_orders": today_orders,
        "active_orders": active,
        "delivered_today": delivered
    }


# --- Tek sipariş işlemleri ---

async def check_preparation_times(company_id: str):
    """Hazırlık süresi dolan siparişleri otomatik 'Hazır' durumuna güncelle"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Hazırlanıyor durumunda ve hazırlık süresi dolmuş siparişleri bul
    expired_orders = await db.orders.find(
        {
            "company_id": company_id,
            "status": "preparing",
            "preparation_end_at": {"$lte": now}
        },
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    # Her birini güncelle ve history'ye ekle
    for order in expired_orders:
        history_entry = {
            "status": "ready",
            "label": "Hazır",
            "timestamp": now,
            "note": "Hazırlık süresi doldu",
            "actor_type": "auto",
            "actor_name": "Otomatik"
        }
        
        await db.orders.update_one(
            {"id": order["id"]},
            {
                "$set": {
                    "status": "ready",
                    "updated_at": now
                },
                "$push": {"status_history": history_entry}
            }
        )
    
    return len(expired_orders)


@router.get("/{company_id}/{order_id}")
async def get_order(company_id: str, order_id: str):
    """Tek bir sipariş detayı"""
    order = await db.orders.find_one(
        {"id": order_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    return order


@router.post("/{company_id}/{order_id}/assign")
async def assign_courier(company_id: str, order_id: str, data: OrderAssign):
    """Siparişe kurye ata"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History'ye ekle
    history_entry = {
        "status": "assigned",
        "label": "Kurye Atandı",
        "timestamp": now,
        "note": f"Kurye: {courier['name']}",
        "actor_type": "admin" if data.admin_name else "system",
        "actor_name": data.admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": data.courier_id,
                "courier_name": courier["name"],
                "status": "assigned",
                "assigned_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    # TODO: Kuryeye push notification gönder
    
    return {"message": f"Sipariş {courier['name']} kuryesine atandı"}


@router.delete("/{company_id}/{order_id}/assign")
async def unassign_courier(company_id: str, order_id: str, admin_name: Optional[str] = None):
    """Siparişten kurye atamasını kaldır"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if not order.get("courier_id"):
        raise HTTPException(status_code=400, detail="Bu siparişe kurye atanmamış")
    
    # Sipariş teslim edilmiş veya yoldaysa atama kaldırılamaz
    if order.get("status") in ["delivered", "on_the_way"]:
        raise HTTPException(status_code=400, detail="Bu durumda kurye ataması kaldırılamaz")
    
    now = datetime.now(timezone.utc).isoformat()
    courier_name = order.get("courier_name", "Bilinmiyor")
    
    # History'ye ekle
    history_entry = {
        "status": "ready",
        "label": "Kurye Ataması Kaldırıldı",
        "timestamp": now,
        "note": f"Önceki kurye: {courier_name}",
        "actor_type": "admin" if admin_name else "system",
        "actor_name": admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": None,
                "courier_name": None,
                "status": "ready",
                "assigned_at": None,
                "confirmed_at": None,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Kurye ataması kaldırıldı"}


@router.post("/{company_id}/{order_id}/status")
async def update_order_status(company_id: str, order_id: str, data: OrderStatusUpdate):
    """Sipariş durumunu güncelle (Admin için)"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if data.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz durum")
    
    # Admin sadece kurye onaylayabileceği durumları seçemez
    if data.status in COURIER_ONLY_STATUSES:
        raise HTTPException(
            status_code=400, 
            detail=f"'{ORDER_STATUSES[data.status]['label']}' durumu sadece kurye tarafından seçilebilir"
        )
    
    # Hazırlanıyor durumuna geçişte süre zorunlu
    if data.status == "preparing" and not data.preparation_time:
        raise HTTPException(
            status_code=400,
            detail="Hazırlanıyor durumu için süre belirtilmeli"
        )
    
    now = datetime.now(timezone.utc)
    
    update_fields = {
        "status": data.status,
        "updated_at": now.isoformat()
    }
    
    # History için note
    history_note = ""
    
    # Durum değiştiğinde geri sayımı sıfırla
    update_fields["preparation_end_at"] = None
    update_fields["preparation_time"] = None
    
    # Hazırlanıyor durumuna geçişte yeni geri sayım başlat
    if data.status == "preparing" and data.preparation_time:
        preparation_end_at = now + timedelta(minutes=data.preparation_time)
        update_fields["preparation_time"] = data.preparation_time
        update_fields["preparation_end_at"] = preparation_end_at.isoformat()
        history_note = f"Hazırlık süresi: {data.preparation_time} dakika"
    
    # Kurye ataması kaldırılacak durumlara geçişte kurye bilgisini sil
    if data.status in COURIER_REMOVAL_STATUSES:
        update_fields["courier_id"] = None
        update_fields["courier_name"] = None
        update_fields["assigned_at"] = None
        update_fields["confirmed_at"] = None
    
    if data.status == "delivered":
        update_fields["delivered_at"] = now.isoformat()
    
    # History'ye ekle
    history_entry = {
        "status": data.status,
        "label": ORDER_STATUSES[data.status]["label"],
        "timestamp": now.isoformat(),
        "note": history_note,
        "actor_type": "admin" if data.admin_name else "system",
        "actor_name": data.admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_fields,
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": f"Sipariş durumu güncellendi: {ORDER_STATUSES[data.status]['label']}"}


@router.delete("/{company_id}/{order_id}")
async def delete_order(company_id: str, order_id: str):
    """Siparişi sil (sadece mock siparişler için)"""
    result = await db.orders.delete_one({"id": order_id, "company_id": company_id, "source": "mock"})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı veya silinemez")
    
    return {"message": "Sipariş silindi"}


# --- Kurye için Endpoints ---

@router.get("/courier/{courier_id}/active")
async def get_courier_active_orders(courier_id: str):
    """Kuryenin aktif siparişlerini getir"""
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "status": {"$nin": ["delivered", "cancelled"]}
        },
        {"_id": 0}
    ).sort("assigned_at", 1).to_list(20)
    
    return orders


@router.post("/courier/{courier_id}/order/{order_id}/confirm")
async def courier_confirm_order(courier_id: str, order_id: str):
    """Kurye siparişi kabul eder (Siparişi Gördüm)"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "assigned":
        raise HTTPException(status_code=400, detail="Bu sipariş onaylanamaz")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "confirmed",
        "label": "Onaylandı",
        "timestamp": now,
        "note": "Kurye siparişi gördü",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "confirmed",
                "confirmed_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş onaylandı"}


@router.post("/courier/{courier_id}/order/{order_id}/pickup")
async def courier_pickup_order(courier_id: str, order_id: str):
    """Kurye siparişi restorandan aldı - Yola Çık"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="Önce siparişi onaylamalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "on_the_way",
        "label": "Yolda",
        "timestamp": now,
        "note": "Kurye yola çıktı",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "on_the_way",
                "picked_up_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş yola çıktı"}


@router.post("/courier/{courier_id}/order/{order_id}/deliver")
async def courier_deliver_order(courier_id: str, order_id: str):
    """Kurye siparişi teslim etti"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "on_the_way":
        raise HTTPException(status_code=400, detail="Önce yola çıkmalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "delivered",
        "label": "Teslim Edildi",
        "timestamp": now,
        "note": "Sipariş müşteriye teslim edildi",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "delivered",
                "delivered_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    # TODO: Kurye kazancını hesapla ve transaction oluştur
    
    return {"message": "Sipariş teslim edildi"}


@router.post("/courier/{courier_id}/order/{order_id}/reject")
async def courier_reject_order(courier_id: str, order_id: str, reason: Optional[str] = None):
    """Kurye siparişi reddeder"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] not in ["assigned", "confirmed"]:
        raise HTTPException(status_code=400, detail="Bu sipariş reddedilemez")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "ready",
        "label": "Kurye Reddetti",
        "timestamp": now,
        "note": f"Kurye: {courier_name}" + (f", Sebep: {reason}" if reason else ""),
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    # Kuryeyi siparişten çıkar, sipariş tekrar atanabilir duruma gelir
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": None,
                "courier_name": None,
                "status": "ready",  # Tekrar atanmaya hazır
                "rejection_reason": reason,
                "rejected_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş reddedildi, başka kuryeye atanabilir"}
