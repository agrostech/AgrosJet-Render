"""
Excel Karşılaştırma ve Rapor Router
Nakit ve Kredi Kartı Excel dosyalarını yükleyip tahsilatlarla karşılaştırır
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import uuid
import io

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/daily-reports", tags=["Günlük Raporlar"], dependencies=[Depends(require_admin)])


# ============ HELPERS ============

def parse_turkish_number(value: str) -> float:
    """Parse Turkish formatted number (1.234,56 -> 1234.56)"""
    if not value or value == "":
        return 0.0
    # Remove currency symbol and whitespace
    value = str(value).replace("₺", "").replace(" ", "").strip()
    if not value:
        return 0.0
    # Turkish format: 1.234,56 -> 1234.56
    value = value.replace(".", "").replace(",", ".")
    try:
        return float(value)
    except:
        return 0.0


async def parse_excel_file(file_content: bytes) -> List[Dict]:
    """Parse Excel file and return list of courier totals by restaurant"""
    import openpyxl
    
    wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
    ws = wb.active
    
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 3:
        return []
    
    # Find the header row (row with restaurant names)
    # The Excel has 2 header rows - we need the second one with restaurant names
    # Check if second row contains restaurant-like names
    header_row_idx = 0
    for idx, row in enumerate(rows[:3]):
        if row and row[0]:
            first_cell = str(row[0]).lower().strip()
            # Skip title rows
            if "rapor" in first_cell or "hesap" in first_cell or "kurye/restoran" in first_cell:
                continue
            # Skip if it's a courier name (has actual data values in later columns)
            # Restaurant header row will have text in multiple columns
            non_empty_count = sum(1 for cell in row if cell and str(cell).strip())
            if non_empty_count > 5:  # Likely a header row with multiple restaurant names
                header_row_idx = idx
                break
    
    # Use second row as header if first row looks like a title
    if header_row_idx == 0:
        first_cell = str(rows[0][0]).lower().strip() if rows[0] and rows[0][0] else ""
        if "rapor" in first_cell or "hesap" in first_cell or "kurye" in first_cell:
            header_row_idx = 1
    
    headers = [str(h).strip() if h else "" for h in rows[header_row_idx]]
    
    # Find column indices
    courier_col = 0  # First column is courier name
    
    # Find the "Toplam" (Total) column
    total_col = len(headers) - 1
    for i, header in enumerate(headers):
        if header.lower() in ["toplam", "total", "genel toplam"]:
            total_col = i
            break
    
    # Find restaurant columns (between courier and total)
    restaurant_cols = {}
    for i, header in enumerate(headers):
        if i > 0 and i < total_col and header:
            # Skip empty or non-restaurant headers
            header_clean = header.strip()
            if header_clean and header_clean.lower() not in ["kurye adı", "kurye", "ad", "toplam", "total"]:
                restaurant_cols[i] = header_clean
    
    results = []
    # Start from row after header
    for row in rows[header_row_idx + 1:]:
        if not row or not row[0]:
            continue
        
        courier_name = str(row[0]).strip()
        if not courier_name or courier_name.lower() in ["toplam", "total", "genel toplam", ""]:
            continue
        
        # Skip internal/support rows
        if "destek" in courier_name.lower() or "agros" in courier_name.lower():
            continue
        
        # Skip if this looks like another header row (no numeric values)
        has_numeric = False
        for i in range(1, min(len(row), total_col + 1)):
            if row[i]:
                val = parse_turkish_number(str(row[i]))
                if val > 0:
                    has_numeric = True
                    break
        
        if not has_numeric:
            continue
        
        # Get total
        total_value = row[total_col] if total_col < len(row) else 0
        total = parse_turkish_number(str(total_value)) if total_value else 0
        
        if total == 0:
            continue
        
        # Get restaurant breakdown
        restaurants = {}
        for col_idx, restaurant_name in restaurant_cols.items():
            if col_idx < len(row) and row[col_idx]:
                amount = parse_turkish_number(str(row[col_idx]))
                if amount > 0:
                    restaurants[restaurant_name] = amount
        
        results.append({
            "courier_name": courier_name,
            "total": total,
            "restaurants": restaurants
        })
    
    return results


# ============ MODELS ============

class ComparisonResult(BaseModel):
    courier_id: str
    courier_name: str
    # Excel values
    excel_cash: float
    excel_card: float
    excel_card_restaurants: Dict[str, float]
    # Entered values (from daily collections)
    entered_cash: float
    entered_card_1: float
    entered_card_10: float
    entered_card_20: float
    entered_card_total: float
    # Differences
    cash_difference: float
    card_difference: float
    # Tax bracket issues
    tax_bracket_issues: List[Dict]
    # Total penalty
    total_penalty: float


class ProcessReportRequest(BaseModel):
    company_id: str
    date: str
    admin_id: str
    admin_name: str


# ============ ENDPOINTS ============

@router.get("/weekly-summary/{company_id}")
async def get_mutabakat_weekly_summary(company_id: str, week_start: str = None):
    """
    Haftalık mütabakat özeti - her gün için işlenmiş mi durumu
    week_start: Haftanın başlangıç tarihi (Pazartesi), yoksa bu haftanın Pazartesisi
    """
    # Haftanın başlangıcını hesapla
    if week_start:
        start_date = datetime.strptime(week_start, "%Y-%m-%d")
    else:
        today = datetime.now(TURKEY_TZ)
        # Pazartesiye git (weekday 0 = Pazartesi)
        start_date = today - timedelta(days=today.weekday())
    
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 7 gün için özet oluştur
    days = []
    day_names_tr = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    today_str = datetime.now(TURKEY_TZ).strftime("%Y-%m-%d")
    
    for i in range(7):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        
        # O gün için Excel yüklenmiş mi?
        cash_report = await db.daily_excel_reports.find_one({
            "company_id": company_id,
            "date": date_str,
            "report_type": "cash"
        })
        card_report = await db.daily_excel_reports.find_one({
            "company_id": company_id,
            "date": date_str,
            "report_type": "card"
        })
        
        # O gün için karşılaştırma yapılmış mı?
        comparison = await db.excel_comparisons.find_one({
            "company_id": company_id,
            "date": date_str
        })
        
        # İşlenmiş mi kontrol et - hem comparison hem de reports'tan
        is_processed_comparison = comparison.get("processed", False) if comparison else False
        is_processed_cash = cash_report.get("processed", False) if cash_report else False
        is_processed_card = card_report.get("processed", False) if card_report else False
        is_processed = is_processed_comparison or (is_processed_cash and is_processed_card)
        
        has_cash = cash_report is not None
        has_card = card_report is not None
        
        # Durum belirleme
        is_future = date_str > today_str
        is_today = date_str == today_str
        
        if is_future:
            status = "future"
        elif is_processed:
            status = "complete"
        elif has_cash and has_card:
            status = "ready"  # Excel'ler yüklü, karşılaştırma bekliyor
        elif has_cash or has_card:
            status = "partial"  # Sadece biri yüklü
        else:
            status = "empty"
        
        days.append({
            "date": date_str,
            "day_name": day_names_tr[i],
            "day_number": day_date.day,
            "has_cash_report": has_cash,
            "has_card_report": has_card,
            "is_processed": is_processed,
            "status": status,
            "is_today": is_today
        })
    
    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "days": days
    }


@router.post("/upload-excel/{company_id}")
async def upload_excel(
    company_id: str,
    date: str = Form(...),
    report_type: str = Form(...),  # "cash" or "card"
    file: UploadFile = File(...)
):
    """
    Excel dosyası yükle ve parse et
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Sadece Excel dosyası yüklenebilir (.xlsx, .xls)")
    
    content = await file.read()
    
    # Boyut kontrolü - Excel max 5MB
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Excel dosyası 5MB'ı geçemez")
    
    try:
        parsed_data = await parse_excel_file(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel parse hatası: {str(e)}")
    
    if not parsed_data:
        raise HTTPException(status_code=400, detail="Excel dosyasında veri bulunamadı")
    
    # Save to database for later comparison
    report = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "date": date,
        "report_type": report_type,
        "filename": file.filename,
        "data": parsed_data,
        "created_at": get_turkey_now()
    }
    
    # Upsert: Replace if exists for same company/date/type
    await db.daily_excel_reports.delete_many({
        "company_id": company_id,
        "date": date,
        "report_type": report_type
    })
    await db.daily_excel_reports.insert_one(report)
    
    return {
        "message": f"{'Nakit' if report_type == 'cash' else 'Kredi Kartı'} raporu yüklendi",
        "courier_count": len(parsed_data),
        "data": parsed_data
    }


@router.get("/excel-reports/{company_id}/{date}")
async def get_excel_reports(company_id: str, date: str):
    """
    Yüklenen Excel raporlarını ve karşılaştırma sonucunu getir
    """
    reports = await db.daily_excel_reports.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(10)
    
    result = {
        "cash": None,
        "card": None,
        "comparison": None
    }
    
    for report in reports:
        if report["report_type"] == "cash":
            result["cash"] = report
        elif report["report_type"] == "card":
            result["card"] = report
    
    # Get saved comparison result if exists
    comparison = await db.daily_comparisons.find_one(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    )
    if comparison:
        result["comparison"] = comparison
    
    return result


@router.post("/compare/{company_id}/{date}")
async def compare_reports(company_id: str, date: str):
    """
    Excel raporlarını günlük tahsilatlarla karşılaştır
    """
    # Get excel reports
    excel_reports = await db.daily_excel_reports.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(10)
    
    cash_report = None
    card_report = None
    for report in excel_reports:
        if report["report_type"] == "cash":
            cash_report = report
        elif report["report_type"] == "card":
            card_report = report
    
    if not cash_report and not card_report:
        raise HTTPException(status_code=400, detail="En az bir Excel raporu yüklenmiş olmalı")
    
    # Get daily collections
    collections = await db.daily_collections.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(500)
    
    # Aggregate collections by courier
    collection_map = {}
    for col in collections:
        cid = col["courier_id"]
        if cid not in collection_map:
            collection_map[cid] = {
                "courier_name": col["courier_name"],
                "cash_total": 0,
                "card_1": 0,
                "card_10": 0,
                "card_20": 0,
                "card_total": 0
            }
        collection_map[cid]["cash_total"] += col["cash_amount"]
        collection_map[cid]["card_1"] += col["card_percent_1"]
        collection_map[cid]["card_10"] += col["card_percent_10"]
        collection_map[cid]["card_20"] += col["card_percent_20"]
        collection_map[cid]["card_total"] += col["card_total"]
    
    # Get all businesses with tax brackets
    businesses = await db.businesses.find(
        {"company_id": company_id},
        {"_id": 0, "name": 1, "tax_bracket": 1}
    ).to_list(500)
    
    business_tax_map = {}
    for b in businesses:
        # Normalize business name for matching
        name_normalized = b["name"].lower().strip()
        business_tax_map[name_normalized] = b.get("tax_bracket")
    
    # Get all couriers for name -> id mapping
    company_couriers = await db.company_couriers.find(
        {"company_id": company_id},
        {"_id": 0, "courier_id": 1}
    ).to_list(1000)
    courier_ids = [cc["courier_id"] for cc in company_couriers]
    
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(1000)
    
    courier_name_to_id = {}
    for c in couriers:
        courier_name_to_id[c["name"].lower().strip()] = c["id"]
    
    # Build comparison results
    results = []
    all_courier_names = set()
    
    # Collect all courier names from both excel reports
    if cash_report:
        for item in cash_report["data"]:
            all_courier_names.add(item["courier_name"])
    if card_report:
        for item in card_report["data"]:
            all_courier_names.add(item["courier_name"])
    
    # Process each courier
    for courier_name in all_courier_names:
        # Find courier ID
        courier_name_lower = courier_name.lower().strip()
        courier_id = courier_name_to_id.get(courier_name_lower)
        
        if not courier_id:
            # Try partial match
            for name, cid in courier_name_to_id.items():
                if name in courier_name_lower or courier_name_lower in name:
                    courier_id = cid
                    break
        
        # Get excel values
        excel_cash = 0
        excel_card = 0
        excel_card_restaurants = {}
        
        if cash_report:
            for item in cash_report["data"]:
                if item["courier_name"].lower().strip() == courier_name_lower:
                    excel_cash = item["total"]
                    break
        
        if card_report:
            for item in card_report["data"]:
                if item["courier_name"].lower().strip() == courier_name_lower:
                    excel_card = item["total"]
                    excel_card_restaurants = item.get("restaurants", {})
                    break
        
        # Get entered values
        entered = collection_map.get(courier_id, {
            "cash_total": 0,
            "card_1": 0,
            "card_10": 0,
            "card_20": 0,
            "card_total": 0
        })
        
        # Calculate differences
        cash_diff = excel_cash - entered["cash_total"]
        card_diff = excel_card - entered["card_total"]
        
        # Check tax bracket issues for card transactions
        # New approach: Calculate expected totals per bracket from Excel restaurants
        # Then compare with what was actually entered
        tax_issues = []
        total_penalty = 0
        
        # Calculate expected amounts per bracket based on Excel restaurant data
        expected_by_bracket = {1: 0, 10: 0, 20: 0, "unknown": 0}
        restaurant_bracket_map = {}  # Track which bracket each restaurant should be in
        
        for restaurant_name, restaurant_amount in excel_card_restaurants.items():
            if restaurant_amount <= 0:
                continue
            
            # Find business tax bracket
            restaurant_name_lower = restaurant_name.lower().strip()
            expected_bracket = None
            
            for bname, bracket in business_tax_map.items():
                if bname in restaurant_name_lower or restaurant_name_lower in bname:
                    expected_bracket = bracket
                    break
            
            if expected_bracket and expected_bracket in [1, 10, 20]:
                expected_by_bracket[expected_bracket] += restaurant_amount
                restaurant_bracket_map[restaurant_name] = {
                    "amount": restaurant_amount,
                    "expected_bracket": expected_bracket
                }
            else:
                expected_by_bracket["unknown"] += restaurant_amount
        
        # Now check if amounts were entered in wrong brackets
        # Compare expected vs entered for each bracket
        entered_by_bracket = {
            1: entered.get("card_1", 0),
            10: entered.get("card_10", 0),
            20: entered.get("card_20", 0)
        }
        
        # Detect wrong bracket entries
        # If expected %1 > 0 but entered %1 < expected, check if it went to wrong bracket
        for restaurant_name, info in restaurant_bracket_map.items():
            expected_bracket = info["expected_bracket"]
            amount = info["amount"]
            
            # Check if this amount is in the wrong bracket
            # Logic: If expected bracket doesn't have enough, but another bracket does, it's wrong
            
            expected_in_bracket = expected_by_bracket[expected_bracket]
            entered_in_bracket = entered_by_bracket[expected_bracket]
            
            # If there's a shortfall in expected bracket
            if entered_in_bracket < amount:
                # Check which other bracket might have this amount
                actual_bracket = None
                for bracket in [1, 10, 20]:
                    if bracket != expected_bracket:
                        # Check if this bracket has at least the amount
                        # and more than what was expected there
                        entered_other = entered_by_bracket[bracket]
                        expected_other = expected_by_bracket[bracket]
                        if entered_other >= amount and entered_other > expected_other:
                            actual_bracket = bracket
                            break
                
                if actual_bracket and actual_bracket != expected_bracket:
                    # Wrong bracket detected!
                    # Calculate penalty: difference between brackets
                    bracket_diff = abs(actual_bracket - expected_bracket) / 100  # e.g., 20-1 = 19%
                    penalty = round(amount * bracket_diff, 2)
                    total_penalty += penalty
                    tax_issues.append({
                        "restaurant": restaurant_name,
                        "amount": amount,
                        "expected_bracket": expected_bracket,
                        "actual_bracket": actual_bracket,
                        "bracket_diff": abs(actual_bracket - expected_bracket),
                        "penalty": penalty
                    })
        
        results.append({
            "courier_id": courier_id,
            "courier_name": courier_name,
            "excel_cash": excel_cash,
            "excel_card": excel_card,
            "excel_card_restaurants": excel_card_restaurants,
            "entered_cash": entered["cash_total"],
            "entered_card_1": entered["card_1"],
            "entered_card_10": entered["card_10"],
            "entered_card_20": entered["card_20"],
            "entered_card_total": entered["card_total"],
            "cash_difference": cash_diff,
            "card_difference": card_diff,
            "tax_bracket_issues": tax_issues,
            "total_penalty": total_penalty,
            "has_issues": cash_diff != 0 or card_diff != 0 or len(tax_issues) > 0
        })
    
    # Sort: those with issues first
    results.sort(key=lambda x: (not x["has_issues"], x["courier_name"]))
    
    comparison_result = {
        "date": date,
        "results": results,
        "summary": {
            "total_couriers": len(results),
            "couriers_with_issues": len([r for r in results if r["has_issues"]]),
            "total_cash_difference": sum(r["cash_difference"] for r in results),
            "total_card_difference": sum(r["card_difference"] for r in results),
            "total_penalty": sum(r["total_penalty"] for r in results)
        }
    }
    
    # Save comparison result to database
    await db.daily_comparisons.delete_many({"company_id": company_id, "date": date})
    await db.daily_comparisons.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "date": date,
        "results": results,
        "summary": comparison_result["summary"],
        "processed": False,
        "processed_by": None,
        "processed_at": None,
        "created_at": get_turkey_now()
    })
    
    return comparison_result


@router.post("/process/{company_id}/{date}")
async def process_differences(
    company_id: str,
    date: str,
    admin_id: str = Form(...),
    admin_name: str = Form(...)
):
    """
    Farkları işle ve kurye muhasebesine otomatik işlem ekle
    """
    # First get comparison results
    comparison = await compare_reports(company_id, date)
    
    if not comparison["results"]:
        raise HTTPException(status_code=400, detail="Karşılaştırılacak veri bulunamadı")
    
    transactions_created = []
    
    for result in comparison["results"]:
        courier_id = result["courier_id"]
        if not courier_id:
            continue
        
        # Process cash difference (only shortages)
        if result["cash_difference"] > 0:
            # Eksik nakit - yeşil işlem (payment_out = verilen/borç)
            tx = {
                "id": str(uuid.uuid4()),
                "entity_type": "courier",
                "entity_id": courier_id,
                "company_id": company_id,
                "type": "payment_out",  # Yeşil = verilen
                "amount": result["cash_difference"],
                "description": f"{date} tarihli eksik nakit",
                "is_hakedis": False,
                "created_at": get_turkey_now(),
                "auto_generated": True,
                "source": "daily_report"
            }
            await db.transactions.insert_one(tx)
            transactions_created.append({
                "courier_name": result["courier_name"],
                "type": "eksik_nakit",
                "amount": result["cash_difference"]
            })
        # Fazla nakit şirkete kalır, işlem yapılmaz
        
        # Process card difference (only shortages)
        if result["card_difference"] > 0:
            # Eksik kart - yeşil işlem
            tx = {
                "id": str(uuid.uuid4()),
                "entity_type": "courier",
                "entity_id": courier_id,
                "company_id": company_id,
                "type": "payment_out",  # Yeşil = verilen
                "amount": result["card_difference"],
                "description": f"{date} tarihli eksik kart",
                "is_hakedis": False,
                "created_at": get_turkey_now(),
                "auto_generated": True,
                "source": "daily_report"
            }
            await db.transactions.insert_one(tx)
            transactions_created.append({
                "courier_name": result["courier_name"],
                "type": "eksik_kart",
                "amount": result["card_difference"]
            })
        # Fazla kart şirkete kalır, işlem yapılmaz
        
        # Process tax bracket penalties
        if result["total_penalty"] > 0:
            issues_desc = ", ".join([
                f"{i['restaurant']} (%{i['expected_bracket']}→%{i['actual_bracket']})"
                for i in result["tax_bracket_issues"]
            ])
            tx = {
                "id": str(uuid.uuid4()),
                "entity_type": "courier",
                "entity_id": courier_id,
                "company_id": company_id,
                "type": "payment_out",  # Yeşil = verilen
                "amount": result["total_penalty"],
                "description": f"{date} tarihli yanlış vergi dilimi - {issues_desc}",
                "is_hakedis": False,
                "created_at": get_turkey_now(),
                "auto_generated": True,
                "source": "daily_report_penalty"
            }
            await db.transactions.insert_one(tx)
            transactions_created.append({
                "courier_name": result["courier_name"],
                "type": "penalty",
                "amount": result["total_penalty"]
            })
    
    # Mark reports as processed
    await db.daily_excel_reports.update_many(
        {"company_id": company_id, "date": date},
        {"$set": {
            "processed": True,
            "processed_at": get_turkey_now(),
            "processed_by": admin_name
        }}
    )
    
    # Mark comparison as processed
    await db.daily_comparisons.update_one(
        {"company_id": company_id, "date": date},
        {"$set": {
            "processed": True,
            "processed_at": get_turkey_now(),
            "processed_by": admin_name
        }}
    )
    
    return {
        "message": "İşlemler oluşturuldu",
        "transactions_created": len(transactions_created),
        "details": transactions_created,
        "processed_by": admin_name
    }


@router.delete("/excel-reports/{company_id}/{date}/{report_type}")
async def delete_excel_report(company_id: str, date: str, report_type: str):
    """
    Yüklenen Excel raporunu sil
    """
    result = await db.daily_excel_reports.delete_one({
        "company_id": company_id,
        "date": date,
        "report_type": report_type
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rapor bulunamadı")
    
    return {"message": "Rapor silindi"}
