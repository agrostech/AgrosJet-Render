from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
import io

from utils.database import db

router = APIRouter(prefix="/api/google", tags=["Google Integration"])
logger = logging.getLogger(__name__)

# --- Pydantic Models ---
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


# --- Helper Functions ---
def get_redirect_uri_from_request(request: Request) -> str:
    """Get the OAuth redirect URI dynamically from the request"""
    # Get the origin from the request (works with any domain)
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost:3000"))
    
    # Remove port if it's default (80 for http, 443 for https)
    if ":" in host:
        host_name, port = host.rsplit(":", 1)
        if (scheme == "https" and port == "443") or (scheme == "http" and port == "80"):
            host = host_name
    
    base_url = f"{scheme}://{host}"
    return f"{base_url}/api/google/oauth/callback"


def get_frontend_url_from_request(request: Request) -> str:
    """Get the frontend URL dynamically from the request"""
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost:3000"))
    
    if ":" in host:
        host_name, port = host.rsplit(":", 1)
        if (scheme == "https" and port == "443") or (scheme == "http" and port == "80"):
            host = host_name
    
    return f"{scheme}://{host}"


async def get_google_settings(company_id: str):
    """Get Google settings for a company"""
    settings = await db.google_settings.find_one({"company_id": company_id}, {"_id": 0})
    return settings


async def get_drive_service(company_id: str):
    """Get authenticated Google Drive service"""
    settings = await get_google_settings(company_id)
    if not settings:
        raise HTTPException(status_code=400, detail="Google ayarları bulunamadı")
    
    creds_doc = await db.google_credentials.find_one({"company_id": company_id, "service": "drive"}, {"_id": 0})
    if not creds_doc:
        raise HTTPException(status_code=400, detail="Google Drive bağlı değil. Lütfen önce bağlantı kurun.")
    
    # Create credentials object
    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings["client_id"],
        client_secret=settings["client_secret"],
        scopes=creds_doc.get("scopes", ["https://www.googleapis.com/auth/drive.file"])
    )
    
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        logger.info(f"Refreshing expired token for company {company_id}")
        creds.refresh(GoogleRequest())
        
        # Update in database
        await db.google_credentials.update_one(
            {"company_id": company_id, "service": "drive"},
            {"$set": {
                "access_token": creds.token,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return build('drive', 'v3', credentials=creds)


async def get_gmail_service(company_id: str):
    """Get authenticated Gmail service"""
    settings = await get_google_settings(company_id)
    if not settings:
        raise HTTPException(status_code=400, detail="Google ayarları bulunamadı")
    
    creds_doc = await db.google_credentials.find_one({"company_id": company_id, "service": "gmail"}, {"_id": 0})
    if not creds_doc:
        raise HTTPException(status_code=400, detail="Gmail bağlı değil. Lütfen önce bağlantı kurun.")
    
    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings["client_id"],
        client_secret=settings["client_secret"],
        scopes=creds_doc.get("scopes", ["https://www.googleapis.com/auth/gmail.send"])
    )
    
    if creds.expired and creds.refresh_token:
        logger.info(f"Refreshing expired Gmail token for company {company_id}")
        creds.refresh(GoogleRequest())
        
        await db.google_credentials.update_one(
            {"company_id": company_id, "service": "gmail"},
            {"$set": {
                "access_token": creds.token,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return build('gmail', 'v1', credentials=creds)


# --- Settings Routes ---
@router.get("/settings/{company_id}")
async def get_settings(company_id: str):
    """Get Google integration settings for a company"""
    settings = await db.google_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings:
        return {"exists": False}
    
    # Check connection status
    drive_creds = await db.google_credentials.find_one({"company_id": company_id, "service": "drive"})
    gmail_creds = await db.google_credentials.find_one({"company_id": company_id, "service": "gmail"})
    
    # Mask client_secret for security
    masked_secret = "***" + settings.get("client_secret", "")[-4:] if settings.get("client_secret") else ""
    
    return {
        "exists": True,
        "id": settings.get("id", ""),
        "company_id": settings["company_id"],
        "client_id": settings.get("client_id", ""),
        "client_secret_masked": masked_secret,
        "drive_folder_id": settings.get("drive_folder_id", ""),
        "gmail_enabled": settings.get("gmail_enabled", False),
        "drive_enabled": settings.get("drive_enabled", False),
        "drive_connected": drive_creds is not None,
        "gmail_connected": gmail_creds is not None,
        "created_at": settings.get("created_at", ""),
        "updated_at": settings.get("updated_at")
    }


@router.post("/settings/{company_id}")
async def save_settings(company_id: str, data: GoogleSettingsCreate):
    """Save or update Google integration settings"""
    existing = await db.google_settings.find_one({"company_id": company_id})
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Update existing settings
        update_data = {
            "client_id": data.client_id,
            "drive_folder_id": data.drive_folder_id,
            "gmail_enabled": data.gmail_enabled,
            "drive_enabled": data.drive_enabled,
            "updated_at": now
        }
        # Only update client_secret if provided (not empty)
        if data.client_secret and not data.client_secret.startswith("***"):
            update_data["client_secret"] = data.client_secret
        
        await db.google_settings.update_one(
            {"company_id": company_id},
            {"$set": update_data}
        )
        return {"message": "Google ayarları güncellendi", "id": existing.get("id")}
    else:
        # Create new settings
        settings = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "client_id": data.client_id,
            "client_secret": data.client_secret,
            "drive_folder_id": data.drive_folder_id,
            "gmail_enabled": data.gmail_enabled,
            "drive_enabled": data.drive_enabled,
            "created_at": now
        }
        await db.google_settings.insert_one(settings)
        return {"message": "Google ayarları kaydedildi", "id": settings["id"]}


@router.delete("/settings/{company_id}")
async def delete_settings(company_id: str):
    """Delete Google integration settings and credentials"""
    await db.google_settings.delete_one({"company_id": company_id})
    await db.google_credentials.delete_many({"company_id": company_id})
    return {"message": "Google ayarları ve bağlantılar silindi"}


# --- OAuth Routes ---
@router.get("/oauth/connect/{company_id}/{service}")
async def start_oauth(company_id: str, service: str, request: Request):
    """Start OAuth flow for Google Drive or Gmail"""
    if service not in ["drive", "gmail"]:
        raise HTTPException(status_code=400, detail="Geçersiz servis. 'drive' veya 'gmail' olmalı.")
    
    settings = await get_google_settings(company_id)
    if not settings:
        raise HTTPException(status_code=400, detail="Önce Google API ayarlarını kaydedin")
    
    # Define scopes based on service
    if service == "drive":
        scopes = ['https://www.googleapis.com/auth/drive.file']
    else:  # gmail
        scopes = ['https://www.googleapis.com/auth/gmail.send']
    
    redirect_uri = get_redirect_uri_from_request(request)
    
    try:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings["client_id"],
                    "client_secret": settings["client_secret"],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=scopes,
            redirect_uri=redirect_uri
        )
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
            state=f"{company_id}:{service}"
        )
        
        logger.info(f"OAuth initiated for company {company_id}, service {service}, redirect_uri: {redirect_uri}")
        return {"authorization_url": authorization_url, "redirect_uri": redirect_uri}
    
    except Exception as e:
        logger.error(f"OAuth initiation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OAuth başlatılamadı: {str(e)}")


@router.get("/oauth/callback")
async def oauth_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    """Handle OAuth callback from Google"""
    try:
        # Parse state
        parts = state.split(":")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Geçersiz state parametresi")
        
        company_id, service = parts
        
        settings = await get_google_settings(company_id)
        if not settings:
            raise HTTPException(status_code=400, detail="Şirket ayarları bulunamadı")
        
        redirect_uri = get_redirect_uri_from_request(request)
        
        # Create flow without specifying scopes to accept whatever Google granted
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings["client_id"],
                    "client_secret": settings["client_secret"],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=None,
            redirect_uri=redirect_uri
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        logger.info(f"OAuth credentials obtained for company {company_id}, service {service}")
        
        # Store credentials in database
        creds_doc = {
            "company_id": company_id,
            "service": service,
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "scopes": list(credentials.scopes) if credentials.scopes else [],
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.google_credentials.update_one(
            {"company_id": company_id, "service": service},
            {"$set": creds_doc},
            upsert=True
        )
        
        logger.info(f"Credentials stored for company {company_id}, service {service}")
        
        # Redirect back to frontend using dynamic URL
        frontend_url = get_frontend_url_from_request(request)
        
        return RedirectResponse(url=f"{frontend_url}/admin/sistem?{service}_connected=true")
    
    except Exception as e:
        logger.error(f"OAuth callback failed: {str(e)}")
        frontend_url = get_frontend_url_from_request(request)
        return RedirectResponse(url=f"{frontend_url}/admin/sistem?error={str(e)}")


@router.post("/oauth/disconnect/{company_id}/{service}")
async def disconnect_service(company_id: str, service: str):
    """Disconnect a Google service"""
    await db.google_credentials.delete_one({"company_id": company_id, "service": service})
    return {"message": f"{service.capitalize()} bağlantısı kesildi"}


# --- Drive Operations ---
@router.post("/drive/upload/{company_id}")
async def upload_to_drive(company_id: str, file_path: str, file_name: str, mime_type: str = "application/pdf"):
    """Upload a file to Google Drive"""
    try:
        service = await get_drive_service(company_id)
        settings = await get_google_settings(company_id)
        
        file_metadata = {'name': file_name}
        
        # If folder ID is set, upload to that folder
        if settings.get("drive_folder_id"):
            file_metadata['parents'] = [settings["drive_folder_id"]]
        
        media = MediaFileUpload(file_path, mimetype=mime_type)
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        logger.info(f"File uploaded to Drive: {file.get('name')}, ID: {file.get('id')}")
        
        return {
            "success": True,
            "file_id": file.get('id'),
            "file_name": file.get('name'),
            "web_link": file.get('webViewLink')
        }
    
    except Exception as e:
        logger.error(f"Drive upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Drive yükleme hatası: {str(e)}")


@router.post("/drive/upload-bytes/{company_id}")
async def upload_bytes_to_drive(company_id: str, file_bytes: bytes, file_name: str, mime_type: str = "application/pdf"):
    """Upload bytes directly to Google Drive (for internal use)"""
    try:
        service = await get_drive_service(company_id)
        settings = await get_google_settings(company_id)
        
        file_metadata = {'name': file_name}
        
        if settings.get("drive_folder_id"):
            file_metadata['parents'] = [settings["drive_folder_id"]]
        
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type)
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        logger.info(f"Bytes uploaded to Drive: {file.get('name')}, ID: {file.get('id')}")
        
        return {
            "success": True,
            "file_id": file.get('id'),
            "file_name": file.get('name'),
            "web_link": file.get('webViewLink')
        }
    
    except Exception as e:
        logger.error(f"Drive upload bytes failed: {str(e)}")
        return {"success": False, "error": str(e)}


# --- Gmail Operations ---
@router.post("/gmail/send/{company_id}")
async def send_email(company_id: str, to: str, subject: str, html_body: str):
    """Send an email via Gmail"""
    try:
        service = await get_gmail_service(company_id)
        
        message = MIMEMultipart("alternative")
        message["To"] = to
        message["Subject"] = subject
        
        part = MIMEText(html_body, "html")
        message.attach(part)
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        
        result = service.users().messages().send(
            userId="me",
            body={"raw": raw_message}
        ).execute()
        
        logger.info(f"Email sent to {to}, message ID: {result.get('id')}")
        
        return {
            "success": True,
            "message_id": result.get('id')
        }
    
    except Exception as e:
        logger.error(f"Gmail send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"E-posta gönderme hatası: {str(e)}")


# --- Utility function for other routers to use ---
async def upload_file_to_drive_if_enabled(company_id: str, file_bytes: bytes, file_name: str, mime_type: str = "application/pdf"):
    """Helper function to upload file to Drive if enabled"""
    settings = await get_google_settings(company_id)
    if not settings or not settings.get("drive_enabled"):
        return None
    
    # Check if Drive is connected
    creds = await db.google_credentials.find_one({"company_id": company_id, "service": "drive"})
    if not creds:
        return None
    
    try:
        service = await get_drive_service(company_id)
        
        file_metadata = {'name': file_name}
        if settings.get("drive_folder_id"):
            file_metadata['parents'] = [settings["drive_folder_id"]]
        
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type)
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        return {
            "file_id": file.get('id'),
            "file_name": file.get('name'),
            "web_link": file.get('webViewLink')
        }
    except Exception as e:
        logger.error(f"Auto drive upload failed: {str(e)}")
        return None


async def send_notification_email_if_enabled(company_id: str, to: str, subject: str, html_body: str):
    """Helper function to send email if Gmail is enabled"""
    settings = await get_google_settings(company_id)
    if not settings or not settings.get("gmail_enabled"):
        return None
    
    # Check if Gmail is connected
    creds = await db.google_credentials.find_one({"company_id": company_id, "service": "gmail"})
    if not creds:
        return None
    
    try:
        service = await get_gmail_service(company_id)
        
        message = MIMEMultipart("alternative")
        message["To"] = to
        message["Subject"] = subject
        
        part = MIMEText(html_body, "html")
        message.attach(part)
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        
        result = service.users().messages().send(
            userId="me",
            body={"raw": raw_message}
        ).execute()
        
        return {"message_id": result.get('id')}
    except Exception as e:
        logger.error(f"Auto email send failed: {str(e)}")
        return None


# --- Test Connection ---
@router.get("/test/drive/{company_id}")
async def test_drive_connection(company_id: str):
    """Test Google Drive connection"""
    try:
        service = await get_drive_service(company_id)
        # Try to list files (limited to 1) to verify connection
        results = service.files().list(pageSize=1, fields="files(id, name)").execute()
        return {"success": True, "message": "Google Drive bağlantısı başarılı"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive bağlantı testi başarısız: {str(e)}")


@router.get("/test/gmail/{company_id}")
async def test_gmail_connection(company_id: str):
    """Test Gmail connection"""
    try:
        service = await get_gmail_service(company_id)
        # Try to get user profile to verify connection
        profile = service.users().getProfile(userId='me').execute()
        return {"success": True, "message": "Gmail bağlantısı başarılı", "email": profile.get("emailAddress")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gmail bağlantı testi başarısız: {str(e)}")
