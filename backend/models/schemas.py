"""
Pydantic models for the ShiftJet API
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


# ============ AUTH MODELS ============
class AdminLogin(BaseModel):
    username: str
    password: str


class CourierLogin(BaseModel):
    phone: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ============ COMPANY MODELS ============
class CompanyCreate(BaseModel):
    name: str
    logo_url: Optional[str] = ""


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    tckn_vkn: Optional[str] = None
    address: Optional[str] = None
    tax_office: Optional[str] = None
    email: Optional[str] = None


# ============ ADMIN MODELS ============
class AdminCreate(BaseModel):
    name: str
    username: str
    password: str
    role: str = "admin"
    permissions: dict = {}


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None


# ============ COURIER MODELS ============
class CourierCreate(BaseModel):
    name: str
    phone: str
    plate: str
    address: Optional[str] = ""
    password: str


class CourierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    plate: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None


# ============ SHIFT MODELS ============
class ShiftCreate(BaseModel):
    name: str
    start_time: str
    end_time: str


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class ShiftAssignment(BaseModel):
    courier_id: str
    shift_id: str
    date: str


class BulkShiftAssignment(BaseModel):
    courier_ids: List[str]
    shift_id: str
    dates: List[str]


# ============ LEAVE MODELS ============
class LeaveCreate(BaseModel):
    courier_id: str
    date: str
    reason: Optional[str] = ""


# ============ ACCOUNTING MODELS ============
class BusinessCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_bracket: Optional[int] = None  # 1, 10, or 20 (percent)


class VendorCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None


class TransactionCreate(BaseModel):
    entity_type: str  # "courier", "business", "vendor"
    entity_id: str
    company_id: str
    type: str  # "payment_in" (ödeme al - tahsil), "payment_out" (ödeme yap - borçlandır)
    amount: float
    description: Optional[str] = None
    is_hakedis: Optional[bool] = False
    add_jetpuan: Optional[bool] = True  # JetPuan eklensin mi? (hakediş için)
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
    custom_date: Optional[str] = None


class TransactionDeleteRequest(BaseModel):
    admin_id: str
    admin_name: str


class TransactionUpdateRequest(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    is_hakedis: Optional[bool] = None
    admin_id: str
    admin_name: str


class ActivityLogCreate(BaseModel):
    company_id: str
    admin_id: str
    admin_name: str
    action: str
    entity_type: str
    entity_id: str
    entity_name: str
    details: Optional[dict] = None


class InstallmentProductCreate(BaseModel):
    courier_id: str
    company_id: str
    name: str
    # Tip: "fixed" (mevcut) veya "percent" (yeni yüzdeli)
    installment_type: Optional[str] = "fixed"
    # Fixed tip alanları (eski uyumluluk için zorunlu görünür ama percent'te 0 olur)
    installment_amount: float = 0
    installment_count: int = 0
    # Percent tip alanları
    total_amount: Optional[float] = None  # Toplam borç
    withdrawal_percent: Optional[float] = None  # Her ödeme talebinde kesilecek yüzde (0-100)
    admin_id: str
    admin_name: str


class InstallmentPayment(BaseModel):
    amount: float
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class InstallmentPayRequest(BaseModel):
    admin_id: str
    admin_name: str
    custom_date: Optional[str] = None


# ============ ZIMMET MODELS ============
class ProductTypeCreate(BaseModel):
    name: str
    requires_serial: bool = False
    fields: List[str] = []


class ProductCreate(BaseModel):
    product_type_id: str
    serial_number: Optional[str] = None
    custom_fields: dict = {}


class ZimmetAssign(BaseModel):
    product_id: str
    courier_id: str
    notes: Optional[str] = ""


class ZimmetTransfer(BaseModel):
    product_id: str
    from_courier_id: str
    to_courier_id: str
    notes: Optional[str] = ""


class ZimmetReturn(BaseModel):
    product_id: str
    courier_id: str
    notes: Optional[str] = ""


# ============ JETPUAN MODELS ============
class JetPuanCategoryCreate(BaseModel):
    name: str


class JetPuanCategoryUpdate(BaseModel):
    name: Optional[str] = None


class JetPuanProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: int  # JetPuan fiyatı
    stock: int
    category_id: str
    image_url: Optional[str] = ""


class JetPuanProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    stock: Optional[int] = None
    category_id: Optional[str] = None
    image_url: Optional[str] = None


class JetPuanOrderItem(BaseModel):
    product_id: str
    quantity: int


class JetPuanOrderCreate(BaseModel):
    items: List[JetPuanOrderItem]


class JetPuanSettingsUpdate(BaseModel):
    puan_per_100tl: float


class JetPuanPointsAdjust(BaseModel):
    amount: int
    reason: str


# ============ INVOICE MODELS ============
class InvoiceCreate(BaseModel):
    transaction_id: str
    file_url: str
    file_name: str


# ============ GOOGLE INTEGRATION MODELS ============
class GoogleSettingsCreate(BaseModel):
    client_id: str
    client_secret: str
    drive_folder_id: Optional[str] = ""
    gmail_enabled: bool = False
    drive_enabled: bool = False


class GoogleSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    company_id: str
    client_id: str
    drive_folder_id: Optional[str] = ""
    gmail_enabled: bool = False
    drive_enabled: bool = False
    drive_connected: bool = False
    gmail_connected: bool = False
    created_at: str
    updated_at: Optional[str] = None


# ============ NOTIFICATION MODELS ============
class NotificationCreate(BaseModel):
    type: str
    title: str
    message: str
    data: dict = {}


# ============ DOCUMENT MODELS ============
class DocumentCreate(BaseModel):
    document_type: str
    file_url: str
    file_name: str
