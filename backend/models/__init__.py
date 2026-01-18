"""
Models package for ShiftJet API
"""
from .schemas import (
    AdminLogin, CourierLogin, PasswordChange,
    CompanyCreate, CompanyUpdate,
    AdminCreate, AdminUpdate,
    CourierCreate, CourierUpdate,
    ShiftCreate, ShiftUpdate, ShiftAssignment, BulkShiftAssignment,
    LeaveCreate,
    TransactionCreate, InstallmentProductCreate, InstallmentPayment,
    ProductTypeCreate, ProductCreate, ZimmetAssign, ZimmetTransfer, ZimmetReturn,
    JetPuanCategoryCreate, JetPuanProductCreate, JetPuanProductUpdate, JetPuanOrderCreate, JetPuanPointsAdjust,
    InvoiceCreate,
    GoogleSettingsCreate, GoogleSettingsResponse,
    NotificationCreate,
    DocumentCreate,
)
