"""
Pydantic models for the ShiftJet API
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


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
class TransactionCreate(BaseModel):
    type: str  # "credit" or "debit"
    amount: float
    description: Optional[str] = ""
    date: Optional[str] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class InstallmentProductCreate(BaseModel):
    product_name: str
    total_amount: float
    installment_count: int
    installment_amount: float


class InstallmentPayment(BaseModel):
    amount: float
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


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
    icon: Optional[str] = "Package"


class JetPuanProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    points_cost: int
    stock: int = 0
    image_url: Optional[str] = ""
    category_id: Optional[str] = None
    is_active: bool = True


class JetPuanProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    points_cost: Optional[int] = None
    stock: Optional[int] = None
    image_url: Optional[str] = None
    category_id: Optional[str] = None
    is_active: Optional[bool] = None


class JetPuanOrderCreate(BaseModel):
    product_id: str
    quantity: int = 1


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
