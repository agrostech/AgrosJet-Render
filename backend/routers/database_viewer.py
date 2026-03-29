"""
Veritabanı Görüntüleyici API
Sadece admin kullanımı için
"""
from fastapi import APIRouter, Query, Depends
from typing import Optional
from utils.database import db
from utils.jwt_utils import require_system_admin
import os

router = APIRouter(prefix="/api/database", tags=["Database Viewer"], dependencies=[Depends(require_system_admin)])


@router.get("/info")
async def get_database_info():
    """Veritabanı bilgilerini getir"""
    db_name = os.environ.get('DB_NAME', 'unknown')
    collections = await db.list_collection_names()
    
    collection_stats = []
    for coll in sorted(collections):
        count = await db[coll].count_documents({})
        collection_stats.append({
            "name": coll,
            "count": count
        })
    
    return {
        "database_name": db_name,
        "collections": collection_stats,
        "total_collections": len(collections)
    }


@router.get("/collection/{collection_name}")
async def get_collection_data(
    collection_name: str,
    limit: int = Query(50, le=500),
    skip: int = Query(0, ge=0),
    sort_field: Optional[str] = Query(None),
    sort_order: int = Query(-1)  # -1 = desc, 1 = asc
):
    """Koleksiyon verilerini getir"""
    # Koleksiyon var mı kontrol et
    collections = await db.list_collection_names()
    if collection_name not in collections:
        return {"error": "Koleksiyon bulunamadı", "data": [], "total": 0}
    
    collection = db[collection_name]
    
    # Toplam kayıt sayısı
    total = await collection.count_documents({})
    
    # Veriyi çek
    cursor = collection.find({}, {"_id": 0})
    
    if sort_field:
        cursor = cursor.sort(sort_field, sort_order)
    
    cursor = cursor.skip(skip).limit(limit)
    data = await cursor.to_list(limit)
    
    # Alan isimlerini bul (ilk kayıttan)
    fields = []
    if data:
        fields = list(data[0].keys())
    
    return {
        "collection": collection_name,
        "total": total,
        "showing": len(data),
        "skip": skip,
        "limit": limit,
        "fields": fields,
        "data": data
    }
