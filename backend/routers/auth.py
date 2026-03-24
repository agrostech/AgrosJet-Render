from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import secrets
import pytz

from utils.database import db
from utils.helpers import hash_password, format_name, get_turkey_now
from utils.rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["Auth"])

TURKEY_TZ = pytz.timezone('Europe/Istanbul')


# --- Pydantic Models ---
class CourierRegister(BaseModel):
    name: str
    phone: str
    email: str  # Zorunlu
    address: str
    iban: str
    plate: str
    password: str


class VerifyEmail(BaseModel):
    email: str
    code: str
    registration_token: str


class CourierLogin(BaseModel):
    phone: str
    password: str


class ForgotPassword(BaseModel):
    phone: str
    email: str


class ResetPassword(BaseModel):
    token: str
    new_password: str


class AdminLogin(BaseModel):
    username: str
    password: str


# --- Courier Auth ---
@router.post("/courier/register")
@limiter.limit("5/minute")
async def register_courier(request: Request, data: CourierRegister):
    """
    Kurye kayıt - İlk adım: E-posta doğrulama kodu gönderir.
    Kayıt tamamlanmaz, pending_registrations'a kaydedilir.
    """
    # E-posta zorunlu
    if not data.email or not data.email.strip():
        raise HTTPException(status_code=400, detail="E-posta adresi zorunludur")
    
    email = data.email.strip().lower()
    
    # E-posta formatı kontrolü
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi giriniz")
    
    # Telefon numarası doğrulaması
    phone = data.phone.strip()
    
    # Başında 0 yoksa ekle
    if not phone.startswith("0"):
        phone = "0" + phone
    
    # 11 haneli olmalı
    if len(phone) != 11:
        raise HTTPException(status_code=400, detail="Telefon numarası 11 haneli olmalıdır (örn: 05527370032)")
    
    # Sadece rakam olmalı
    if not phone.isdigit():
        raise HTTPException(status_code=400, detail="Telefon numarası sadece rakam içermelidir")
    
    # 05 ile başlamalı (Türkiye mobil)
    if not phone.startswith("05"):
        raise HTTPException(status_code=400, detail="Geçerli bir cep telefonu numarası giriniz (05 ile başlamalı)")
    
    # Telefon kontrolü
    existing = await db.couriers.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="Bu telefon numarası zaten kayıtlı")
    
    # E-posta kontrolü
    existing_email = await db.couriers.find_one({"email": email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Doğrulama kodu oluştur
    verification_code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    registration_token = secrets.token_urlsafe(32)
    now_utc = datetime.now(timezone.utc)
    expires_at = now_utc + timedelta(minutes=15)
    
    # Pending kayıt oluştur
    pending_registration = {
        "registration_token": registration_token,
        "verification_code": verification_code,
        "name": format_name(data.name),
        "phone": phone,
        "email": email,
        "address": data.address,
        "iban": data.iban,
        "plate": data.plate.upper(),
        "password": hash_password(data.password),
        "expires_at": expires_at,
        "created_at": now_utc,
        "verified": False
    }
    
    # Eski pending kayıtları temizle (aynı telefon veya email)
    await db.pending_registrations.delete_many({
        "$or": [{"phone": phone}, {"email": email}]
    })
    await db.pending_registrations.insert_one(pending_registration)
    
    # E-posta gönder
    try:
        from services.email_service import EmailService
        
        email_service = EmailService()
        if await email_service.load_system_settings():
            subject = "[AgrosJet] E-posta Doğrulama Kodu"
            html_body = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #e13c10;">AgrosJet Kurye Kayıt</h2>
                <p>Merhaba {format_name(data.name)},</p>
                <p>Kurye kaydınızı tamamlamak için aşağıdaki doğrulama kodunu kullanın:</p>
                <div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">{verification_code}</span>
                </div>
                <p style="color: #666; font-size: 14px;">Bu kod 15 dakika geçerlidir.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">© 2026 AgrosJet</p>
            </div>
            """
            await email_service.send_email(email, subject, html_body)
    except Exception as e:
        print(f"Email verification error: {e}")
    
    return {
        "message": "Doğrulama kodu e-posta adresinize gönderildi",
        "registration_token": registration_token,
        "email": email,
        "requires_verification": True
    }


@router.post("/courier/verify-email")
@limiter.limit("10/minute")
async def verify_email_and_complete_registration(request: Request, data: VerifyEmail):
    """
    E-posta doğrulama ve kayıt tamamlama.
    """
    email = data.email.strip().lower()
    code = data.code.strip()
    
    # Pending kaydı bul
    pending = await db.pending_registrations.find_one({
        "registration_token": data.registration_token,
        "email": email,
        "verified": False
    }, {"_id": 0})
    
    if not pending:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş kayıt. Lütfen tekrar kayıt olun.")
    
    # Süre kontrolü
    now_utc = datetime.now(timezone.utc)
    expires_at = pending["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < now_utc:
        await db.pending_registrations.delete_one({"registration_token": data.registration_token})
        raise HTTPException(status_code=400, detail="Doğrulama kodunun süresi dolmuş. Lütfen tekrar kayıt olun.")
    
    # Kod kontrolü
    if pending["verification_code"] != code:
        raise HTTPException(status_code=400, detail="Geçersiz doğrulama kodu")
    
    # Telefon ve email tekrar kontrolü (race condition için)
    existing_phone = await db.couriers.find_one({"phone": pending["phone"]})
    if existing_phone:
        await db.pending_registrations.delete_one({"registration_token": data.registration_token})
        raise HTTPException(status_code=400, detail="Bu telefon numarası zaten kayıtlı")
    
    existing_email = await db.couriers.find_one({"email": pending["email"]})
    if existing_email:
        await db.pending_registrations.delete_one({"registration_token": data.registration_token})
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Kurye oluştur
    courier = {
        "id": str(uuid.uuid4()),
        "name": pending["name"],
        "phone": pending["phone"],
        "email": pending["email"],
        "address": pending["address"],
        "iban": pending["iban"],
        "plate": pending["plate"],
        "password": pending["password"],
        "status": "active",
        "email_verified": True,
        "created_at": get_turkey_now()
    }
    await db.couriers.insert_one(courier)
    
    # Pending kaydı sil
    await db.pending_registrations.delete_one({"registration_token": data.registration_token})
    
    return {"message": "Kayıt başarılı! Giriş yapabilirsiniz.", "id": courier["id"]}


@router.post("/courier/login")
@limiter.limit("5/minute")
async def login_courier(request: Request, data: CourierLogin):
    # Telefon numarasını normalize et
    phone = data.phone.strip()
    if not phone.startswith("0"):
        phone = "0" + phone
    
    courier = await db.couriers.find_one({"phone": phone}, {"_id": 0})
    if not courier or courier["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz telefon veya şifre")
    
    # Kurye tablosundaki pasif kontrolü
    if courier.get("is_active") == False:
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda. Yöneticinizle iletişime geçin.")
    
    # Get companies this courier belongs to
    # Status can be "approved" or "active" depending on when the relation was created
    company_relations = await db.company_couriers.find(
        {"courier_id": courier["id"], "status": {"$in": ["approved", "active"]}}, 
        {"_id": 0}
    ).to_list(100)
    
    # Tüm şirketlerde pasif mi kontrol et
    active_in_any_company = False
    companies = []
    for rel in company_relations:
        # Pasif değilse şirketi ekle
        if rel.get("is_active") != False:
            company = await db.companies.find_one({"id": rel["company_id"]}, {"_id": 0})
            if company:
                companies.append(company)
                active_in_any_company = True
    
    # Hiçbir şirkette aktif değilse giriş engelle
    if not active_in_any_company and len(company_relations) > 0:
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda. Yöneticinizle iletişime geçin.")
    
    # Hiçbir şirkete eklenmemişse giriş engelle
    if len(company_relations) == 0:
        raise HTTPException(status_code=403, detail="Henüz bir şirkete eklenmemişsiniz. Çalışacağınız şirketin yöneticisiyle iletişime geçin.")
    
    # Yeni session oluştur — eski cihazları geçersiz kıl
    # fcm_token'ı hemen temizle: eski cihaza bildirim GİTMESİN
    import secrets as _secrets
    push_session_id = _secrets.token_hex(16)
    await db.couriers.update_one(
        {"id": courier["id"]},
        {"$set": {
            "push_session_id": push_session_id,
            "fcm_token": "",
            "fcm_token_updated_at": get_turkey_now()
        }}
    )

    return {
        "id": courier["id"],
        "name": courier["name"],
        "phone": courier["phone"],
        "role": "courier",
        "companies": companies,
        "push_session_id": push_session_id
    }


@router.get("/courier/{courier_id}/check-status")
async def check_courier_status(courier_id: str, company_id: str = None, session_id: str = None):
    """Kurye durumunu kontrol et - pasif mi, başka cihazda mı, logout edilmeli mi"""
    # company_couriers'dan kontrol et
    query = {"courier_id": courier_id}
    if company_id:
        query["company_id"] = company_id
    
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(100)
    
    # Herhangi birinde pasif mi?
    for rel in relations:
        if rel.get("is_active") == False:
            return {
                "should_logout": True,
                "reason": "Hesabınız pasif durumda",
                "forced_logout_at": rel.get("forced_logout_at")
            }
    
    # Session kontrolü: başka cihazdan giriş yapılmış mı?
    if session_id:
        courier = await db.couriers.find_one(
            {"id": courier_id},
            {"_id": 0, "push_session_id": 1, "fcm_token": 1}
        )
        if courier:
            db_session = courier.get("push_session_id", "")
            db_token = courier.get("fcm_token", "")
            if db_session and db_session != session_id:
                # Farklı cihaz aktif → bu cihazı logout et
                return {
                    "should_logout": True,
                    "reason": "Başka bir cihazdan giriş yapıldı"
                }
            if not db_session or not db_token:
                # Önceki cihaz logout olmuş, token/session boş → bu cihaz token'ını tekrar göndersin
                return {
                    "should_logout": False,
                    "resend_token": True
                }
    
    return {"should_logout": False}


# --- Courier Password Reset ---
@router.post("/courier/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: ForgotPassword):
    """
    Kurye şifre sıfırlama isteği.
    Telefon ve e-posta eşleşirse sıfırlama e-postası gönderir.
    """
    # Telefon numarasını normalize et
    phone = data.phone.strip()
    if not phone.startswith("0"):
        phone = "0" + phone
    
    email = data.email.strip().lower()
    
    # Kurye bul
    courier = await db.couriers.find_one(
        {"phone": phone},
        {"_id": 0, "id": 1, "email": 1, "name": 1}
    )
    
    # Güvenlik: Kurye yoksa veya e-posta eşleşmiyorsa aynı mesajı ver
    if not courier or not courier.get("email") or courier.get("email").lower() != email:
        # Timing attack'lardan kaçınmak için aynı süre bekle
        return {"message": "Bilgiler doğruysa e-posta adresinize sıfırlama linki gönderilecektir."}
    
    # Token oluştur (6 haneli kod)
    reset_token = secrets.token_urlsafe(32)
    reset_code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    now_utc = datetime.now(timezone.utc)
    expires_at = now_utc + timedelta(hours=1)
    
    # Token'ı kaydet
    await db.password_reset_tokens.delete_many({"courier_id": courier["id"]})  # Eski tokenları sil
    await db.password_reset_tokens.insert_one({
        "token": reset_token,
        "code": reset_code,
        "courier_id": courier["id"],
        "email": email,
        "expires_at": expires_at,
        "created_at": now_utc,
        "used": False
    })
    
    # E-posta gönder
    try:
        from services.email_service import EmailService
        
        email_service = EmailService()
        if await email_service.load_system_settings():
            subject = "[AgrosJet] Şifre Sıfırlama"
            html_body = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #e13c10;">AgrosJet Şifre Sıfırlama</h2>
                <p>Merhaba {courier.get('name', 'Kurye')},</p>
                <p>Şifre sıfırlama talebiniz alınmıştır. Aşağıdaki kodu kullanarak şifrenizi sıfırlayabilirsiniz:</p>
                <div style="background: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">{reset_code}</span>
                </div>
                <p style="color: #666; font-size: 14px;">Bu kod 1 saat geçerlidir.</p>
                <p style="color: #666; font-size: 14px;">Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">© 2026 AgrosJet</p>
            </div>
            """
            await email_service.send_email(email, subject, html_body)
    except Exception as e:
        print(f"Password reset email error: {e}")
        # E-posta gönderilemese de hata verme (güvenlik)
    
    return {"message": "Bilgiler doğruysa e-posta adresinize sıfırlama kodu gönderilecektir."}


@router.post("/courier/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, data: ResetPassword):
    """
    Kurye şifre sıfırlama (kod ile).
    """
    # Token veya kod ile bul
    token_doc = await db.password_reset_tokens.find_one({
        "$or": [
            {"token": data.token},
            {"code": data.token}
        ],
        "used": False
    }, {"_id": 0})
    
    if not token_doc:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş kod")
    
    # Süre kontrolü - UTC kullan
    now_utc = datetime.now(timezone.utc)
    expires_at = token_doc["expires_at"]
    
    # MongoDB'den gelen datetime'ı UTC'ye çevir
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = expires_at.astimezone(timezone.utc)
    
    if expires_at < now_utc:
        raise HTTPException(status_code=400, detail="Kodun süresi dolmuş. Lütfen yeni kod talep edin.")
    
    # Şifre güncelle
    new_password_hash = hash_password(data.new_password)
    await db.couriers.update_one(
        {"id": token_doc["courier_id"]},
        {"$set": {"password": new_password_hash}}
    )
    
    # Token'ı kullanıldı olarak işaretle
    await db.password_reset_tokens.update_one(
        {"token": token_doc["token"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz."}


# --- Admin Auth ---
@router.post("/admin/login")
@limiter.limit("5/minute")
async def login_admin(request: Request, data: AdminLogin):
    admin = await db.admins.find_one({"username": data.username}, {"_id": 0})
    if not admin or admin["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
    # Get company_ids array (for multi-company access)
    company_ids = admin.get("company_ids", [])
    
    # If no company_ids array, fall back to single company_id
    if not company_ids and admin.get("company_id"):
        company_ids = [admin["company_id"]]
    
    # Get primary company (first in list or single company_id)
    primary_company_id = company_ids[0] if company_ids else admin.get("company_id")
    
    company = None
    if primary_company_id:
        company = await db.companies.find_one({"id": primary_company_id}, {"_id": 0})
    
    # Fetch all accessible companies
    accessible_companies = []
    if company_ids:
        companies_cursor = db.companies.find({"id": {"$in": company_ids}}, {"_id": 0, "id": 1, "name": 1, "logo_url": 1, "logo_light": 1, "logo_dark": 1, "city": 1})
        accessible_companies = await companies_cursor.to_list(100)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem", "raporlar", "basvurular"}
    
    # Get permissions and check if they use the new simple format
    db_permissions = admin.get("permissions", {})
    has_simple_format = any(key in db_permissions for key in simple_keys)
    
    if has_simple_format:
        # Extract only simple keys from permissions
        permissions = {k: db_permissions.get(k, False) for k in simple_keys}
    else:
        # No simple format found, assign defaults
        if admin["role"] == "superadmin":
            permissions = {
                "vardiya": True, "muhasebe": True, "zimmet": True,
                "kuryeler": True, "market": True, "akademi": True, "sistem": True,
                "raporlar": True, "basvurular": True
            }
        else:
            permissions = {
                "vardiya": True, "muhasebe": True, "zimmet": True,
                "kuryeler": True, "market": True, "akademi": True, "sistem": False,
                "raporlar": False, "basvurular": False
            }
    
    # Determine super admin status: either is_super_admin flag or role is superadmin
    is_super = admin.get("is_super_admin", False) or admin.get("role") == "superadmin"
    is_system = admin.get("is_system_admin", False)
    
    return {
        "id": admin["id"],
        "name": admin["name"],
        "username": admin["username"],
        "role": "superadmin" if is_super else admin["role"],
        "is_super_admin": is_super,
        "is_system_admin": is_system,
        "permissions": permissions,
        "permissions_updated_at": admin.get("permissions_updated_at"),
        "company_id": primary_company_id,
        "company_ids": company_ids,
        "company": company,
        "accessible_companies": accessible_companies,
        "email": admin.get("email")
    }


@router.put("/admin/{admin_id}/companies")
async def update_admin_companies(admin_id: str, company_ids: list[str]):
    """Update the list of companies an admin can access (superadmin only)"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin bulunamadı")
    
    # Validate all company_ids exist
    for cid in company_ids:
        company = await db.companies.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not company:
            raise HTTPException(status_code=400, detail=f"Şirket bulunamadı: {cid}")
    
    # Update admin with new company_ids
    primary_company_id = company_ids[0] if company_ids else None
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "company_ids": company_ids,
            "company_id": primary_company_id
        }}
    )
    
    return {"message": "Şirketler güncellendi", "company_ids": company_ids}


@router.get("/check-permissions/{admin_id}")
async def check_permissions_update(admin_id: str, timestamp: str = None):
    """Admin izinlerinin güncellenip güncellenmediğini kontrol et"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "permissions_updated_at": 1})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin bulunamadı")
    
    current_timestamp = admin.get("permissions_updated_at")
    
    # Eğer timestamp verilmişse ve farklıysa, izinler güncellenmiş demektir
    if timestamp and current_timestamp and timestamp != current_timestamp:
        return {"updated": True, "new_timestamp": current_timestamp}
    
    return {"updated": False, "current_timestamp": current_timestamp}


class CourierDeleteAccount(BaseModel):
    phone: str
    password: str


@router.post("/courier/delete-account")
async def delete_courier_account(data: CourierDeleteAccount):
    """Kurye hesabını kalıcı olarak sil"""
    # Telefon numarasını normalize et
    phone = data.phone.strip()
    if not phone.startswith("0"):
        phone = "0" + phone
    
    # Kurye bul
    courier = await db.couriers.find_one({"phone": phone})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Şifre doğrula
    if courier.get("password") != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz şifre")
    
    courier_id = courier["id"]
    
    # Şirket bağlantılarını sil
    await db.company_couriers.delete_many({"courier_id": courier_id})
    
    # Kurye belgelerini sil
    await db.courier_documents.delete_many({"courier_id": courier_id})
    
    # Kurye status loglarını sil
    await db.courier_status_logs.delete_many({"courier_id": courier_id})
    
    # Bildirimleri sil
    await db.notifications.delete_many({"user_id": courier_id})
    
    # Kurye kaydını sil
    await db.couriers.delete_one({"id": courier_id})
    
    return {"message": "Hesabınız başarıyla silindi"}
