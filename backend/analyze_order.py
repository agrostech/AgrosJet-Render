from pymongo import MongoClient
import json
from bson import ObjectId
from datetime import datetime

client = MongoClient('mongodb://localhost:27017')
db = client['agrosjet_32']

# Search for 'Orhan kaya' order
order = db.orders.find_one({
    "$or": [
        {"customer_name": {"$regex": "orhan", "$options": "i"}},
        {"customer.name": {"$regex": "orhan", "$options": "i"}},
        {"musteri_adi": {"$regex": "orhan", "$options": "i"}},
        {"recipient_name": {"$regex": "orhan", "$options": "i"}},
    ]
}, sort=[("created_at", -1)])

if order:
    print("=== SİPARİŞ BULUNDU ===")
    print(f"ID: {order.get('_id')}")
    print(f"Platform: {order.get('platform', '?')}")
    cname = order.get("customer_name", order.get("customer", {}).get("name", order.get("musteri_adi", "?")))
    print(f"Müşteri: {cname}")
    print(f"Mevcut Durum: {order.get('status', '?')}")
    print(f"Kurye ID: {order.get('courier_id', 'YOK')}")
    print(f"Oluşturulma: {order.get('created_at', '?')}")
    print()
    print("=== STATUS HISTORY (TAM ZAMAN ÇİZELGESİ) ===")
    for i, h in enumerate(order.get("status_history", [])):
        ts = h.get("timestamp", h.get("changed_at", "?"))
        status = h.get("status", h.get("new_status", "?"))
        actor = h.get("actor_type", h.get("actor", "?"))
        actor_name = h.get("actor_name", h.get("changed_by", "?"))
        note = h.get("note", "")
        print(f"  {i+1}. [{ts}] {status} | Actor: {actor} / {actor_name} {'| Not: ' + note if note else ''}")
    print()
    print("=== ÖNEMLI ALANLAR ===")
    important_keys = [
        "status", "platform", "platform_order_id", "source",
        "courier_id", "courier_name", "courier_fee",
        "restaurant_id", "restaurant_name", "company_id",
        "assigned_at", "delivered_at", "created_at", "updated_at",
        "actor_type", "is_auto_assigned", "auto_assigned",
        "adisyo_status", "external_status",
    ]
    for key in important_keys:
        if key in order:
            val = order[key]
            if isinstance(val, (ObjectId, datetime)):
                val = str(val)
            print(f"  {key}: {val}")
    print()
    print("=== TÜM ALANLAR (KEY LİSTESİ) ===")
    for key in sorted(order.keys()):
        if key != "_id":
            val = order[key]
            vtype = type(val).__name__
            if isinstance(val, list):
                print(f"  {key}: [{len(val)} items] ({vtype})")
            elif isinstance(val, dict):
                print(f"  {key}: {{...}} ({vtype})")
            else:
                print(f"  {key}: {val} ({vtype})")
else:
    print("Orhan kaya siparişi bulunamadı!")
    print()
    print("Son 10 sipariş:")
    recent = list(db.orders.find({}, sort=[("created_at", -1)]).limit(10))
    for o in recent:
        cname = o.get("customer_name", o.get("customer", {}).get("name", o.get("musteri_adi", "?")))
        print(f"  - {cname} | status={o.get('status')} | platform={o.get('platform')} | {o.get('created_at')}")

client.close()
