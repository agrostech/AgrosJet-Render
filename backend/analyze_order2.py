from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
import json

client = MongoClient('mongodb://localhost:27017')
db = client['agrosjet_32']

# List all collections
print("=== TÜM COLLECTION'LAR ===")
for coll in db.list_collection_names():
    count = db[coll].count_documents({})
    print(f"  {coll}: {count} kayıt")

print()

# Search across ALL collections for "orhan"
print("=== 'ORHAN' ARAMA (Tüm Collection'lar) ===")
for coll_name in db.list_collection_names():
    coll = db[coll_name]
    # Try text search in all string fields
    docs = list(coll.find({"$or": [
        {"customer_name": {"$regex": "orhan", "$options": "i"}},
        {"customer.name": {"$regex": "orhan", "$options": "i"}},
        {"musteri_adi": {"$regex": "orhan", "$options": "i"}},
        {"name": {"$regex": "orhan", "$options": "i"}},
        {"recipient_name": {"$regex": "orhan", "$options": "i"}},
    ]}).limit(5))
    if docs:
        print(f"\n  {coll_name}: {len(docs)} sonuç bulundu!")
        for d in docs:
            print(f"    ID: {d.get('_id')}")
            for k, v in d.items():
                if k != '_id':
                    if isinstance(v, (ObjectId, datetime)):
                        v = str(v)
                    elif isinstance(v, (dict, list)):
                        v = json.dumps(v, default=str, ensure_ascii=False)[:150]
                    print(f"      {k}: {v}")

# Also search in Adisyo-specific orders
print()
print("=== ADİSYO SİPARİŞLERİ (Son 10) ===")
adisyo_orders = list(db.orders.find(
    {"$or": [
        {"platform": "adisyo"},
        {"source": "adisyo"},
        {"platform": {"$regex": "adisyo", "$options": "i"}},
    ]},
    sort=[("created_at", -1)]
).limit(10))

if adisyo_orders:
    for o in adisyo_orders:
        cname = o.get("customer_name", o.get("customer", {}).get("name", "?"))
        print(f"  - {cname} | status={o.get('status')} | {o.get('created_at')}")
        for h in o.get("status_history", []):
            print(f"      [{h.get('timestamp', '?')}] {h.get('status', '?')} | {h.get('actor_type', '?')}/{h.get('actor_name', '?')}")
else:
    print("  Adisyo siparişi bulunamadı")

# Check order_logs or activity_logs collection
print()
print("=== LOG COLLECTION'LARI ===")
for coll_name in ["order_logs", "activity_logs", "logs", "audit_logs", "status_logs"]:
    if coll_name in db.list_collection_names():
        count = db[coll_name].count_documents({})
        print(f"  {coll_name}: {count} kayıt")
        sample = db[coll_name].find_one(sort=[("created_at", -1)])
        if sample:
            for k, v in sample.items():
                if k != '_id':
                    print(f"    {k}: {str(v)[:100]}")

client.close()
