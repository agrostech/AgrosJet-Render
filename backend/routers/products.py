from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
import re
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/products", tags=["Products"])

# Database reference (will be set from server.py)
db = None

def set_db(database):
    global db
    db = database


class ScrapedProduct(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    category: str


class ScrapeRequest(BaseModel):
    url: str
    restaurant_id: str


class ScrapeResponse(BaseModel):
    restaurant_name: str
    categories: List[str]
    products: List[ScrapedProduct]
    total_products: int


class SaveProductsRequest(BaseModel):
    restaurant_id: str
    products: List[ScrapedProduct]


class Category(BaseModel):
    id: str
    name: str
    restaurant_id: str
    company_id: str
    created_at: str


class Product(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    price: float
    category_id: str
    category_name: str
    restaurant_id: str
    company_id: str
    is_active: bool = True
    created_at: str


def extract_price(price_text: str) -> float:
    """Fiyat metninden sayısal değeri çıkar"""
    # "420 TL" -> 420.0
    # "1.650 TL" -> 1650.0
    cleaned = re.sub(r'[^\d.,]', '', price_text)
    cleaned = cleaned.replace('.', '').replace(',', '.')
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def scrape_tgo_menu(html_content: str) -> dict:
    """TGO Yemek sayfasından menü bilgilerini çek"""
    soup = BeautifulSoup(html_content, 'lxml')
    
    # Restoran adını al
    restaurant_name = ""
    h1_tag = soup.find('h1')
    if h1_tag:
        restaurant_name = h1_tag.get_text(strip=True)
    
    products = []
    categories = set()
    
    # Tüm h6 etiketlerini (ürün başlıkları) bul
    all_h6 = soup.find_all('h6')
    current_category = "Genel"
    
    for h6 in all_h6:
        product_name = h6.get_text(strip=True)
        if not product_name:
            continue
        
        # Fiyatı bulmak için parent'lara çık (level 2 genellikle doğru)
        container = h6
        text = ""
        for _ in range(3):
            container = container.find_parent()
            if container:
                text = container.get_text(separator=' | ', strip=True)
                if 'TL' in text:
                    break
        
        if not text or 'TL' not in text:
            continue
        
        # Fiyatı bul
        price_match = re.search(r'([\d.,]+)\s*TL', text)
        price = extract_price(price_match.group(1)) if price_match else 0.0
        
        if price <= 0:
            continue
        
        # Açıklamayı bul
        parts = text.split(' | ')
        description = ""
        for part in parts:
            part = part.strip()
            # Ürün adı, fiyat, beğeni oranı veya buton değilse açıklama
            if (part != product_name and 
                'TL' not in part and 
                'Beğenildi' not in part and 
                'Sepete Ekle' not in part and
                'Değerlendirme' not in part and
                part not in ['(', ')'] and
                len(part) > 5):
                description = part
                break
        
        # En yakın h3'ü bul (kategori)
        prev_h3 = h6.find_previous('h3')
        if prev_h3:
            cat_name = prev_h3.get_text(strip=True)
            # Ürün sayısı parantezi varsa kaldır
            cat_name = re.sub(r'\s*\(\d+\s*Ürün\)', '', cat_name).strip()
            if cat_name and cat_name not in ['Kategoriler', 'Kampanyalar & Kuponlar', 'Sepet']:
                current_category = cat_name
        
        categories.add(current_category)
        products.append(ScrapedProduct(
            name=product_name,
            description=description if description else None,
            price=price,
            category=current_category
        ))
    
    # Tekrar eden ürünleri kaldır
    seen = set()
    unique_products = []
    for p in products:
        key = (p.name, p.category)
        if key not in seen:
            seen.add(key)
            unique_products.append(p)
    
    return {
        "restaurant_name": restaurant_name,
        "categories": sorted(list(categories)),
        "products": unique_products,
        "total_products": len(unique_products)
    }


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_menu(request: ScrapeRequest):
    """TGO Yemek URL'sinden menü bilgilerini çek"""
    
    # URL validasyonu
    if "tgoyemek.com" not in request.url and "trendyol" not in request.url:
        raise HTTPException(status_code=400, detail="Sadece TGO Yemek URL'leri desteklenmektedir")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            response = await client.get(request.url, headers=headers, follow_redirects=True)
            response.raise_for_status()
            
            result = scrape_tgo_menu(response.text)
            
            if result["total_products"] == 0:
                raise HTTPException(status_code=404, detail="Menü bilgisi bulunamadı. URL'i kontrol edin.")
            
            return ScrapeResponse(**result)
            
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Sayfa yüklenemedi: {e}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Bağlantı hatası: {str(e)}")


@router.post("/save")
async def save_products(request: SaveProductsRequest):
    """Çekilen ürünleri veritabanına kaydet"""
    
    if db is None:
        raise HTTPException(status_code=500, detail="Veritabanı bağlantısı yok")
    
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one({"id": request.restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant.get("company_id")
    now = datetime.now(timezone.utc).isoformat()
    
    # Mevcut kategorileri ve ürünleri temizle (opsiyonel - yeni import)
    await db.product_categories.delete_many({"restaurant_id": request.restaurant_id})
    await db.products.delete_many({"restaurant_id": request.restaurant_id})
    
    # Kategorileri oluştur
    category_map = {}  # category_name -> category_id
    unique_categories = set(p.category for p in request.products)
    
    for cat_name in unique_categories:
        cat_id = str(uuid.uuid4())
        category_map[cat_name] = cat_id
        
        await db.product_categories.insert_one({
            "id": cat_id,
            "name": cat_name,
            "restaurant_id": request.restaurant_id,
            "company_id": company_id,
            "created_at": now
        })
    
    # Ürünleri kaydet
    products_to_insert = []
    for product in request.products:
        products_to_insert.append({
            "id": str(uuid.uuid4()),
            "name": product.name,
            "description": product.description,
            "price": product.price,
            "category_id": category_map[product.category],
            "category_name": product.category,
            "restaurant_id": request.restaurant_id,
            "company_id": company_id,
            "is_active": True,
            "created_at": now
        })
    
    if products_to_insert:
        await db.products.insert_many(products_to_insert)
    
    return {
        "success": True,
        "message": f"{len(unique_categories)} kategori ve {len(products_to_insert)} ürün kaydedildi",
        "categories_count": len(unique_categories),
        "products_count": len(products_to_insert)
    }


@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_products(restaurant_id: str):
    """Restoranın ürünlerini getir"""
    
    if not db:
        raise HTTPException(status_code=500, detail="Veritabanı bağlantısı yok")
    
    # Kategorileri getir
    categories = await db.product_categories.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    ).to_list(100)
    
    # Ürünleri getir
    products = await db.products.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    ).to_list(1000)
    
    return {
        "categories": categories,
        "products": products,
        "categories_count": len(categories),
        "products_count": len(products)
    }


@router.delete("/restaurant/{restaurant_id}")
async def delete_restaurant_products(restaurant_id: str):
    """Restoranın tüm ürünlerini sil"""
    
    if not db:
        raise HTTPException(status_code=500, detail="Veritabanı bağlantısı yok")
    
    cat_result = await db.product_categories.delete_many({"restaurant_id": restaurant_id})
    prod_result = await db.products.delete_many({"restaurant_id": restaurant_id})
    
    return {
        "success": True,
        "deleted_categories": cat_result.deleted_count,
        "deleted_products": prod_result.deleted_count
    }
