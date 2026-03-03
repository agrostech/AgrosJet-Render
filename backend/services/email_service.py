"""
Email Service using SMTP
Sends email notifications to super admins
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from typing import Optional
from utils.database import db

logger = logging.getLogger(__name__)


class EmailService:
    """SMTP Email Service"""
    
    def __init__(self):
        self.smtp_host = None
        self.smtp_port = None
        self.smtp_user = None
        self.smtp_password = None
        self.from_email = None
        self.from_name = "AgrosJet"
    
    async def load_settings(self, company_id: str) -> bool:
        """Load SMTP settings from database"""
        settings = await db.email_settings.find_one({"company_id": company_id}, {"_id": 0})
        if not settings:
            return False
        
        self.smtp_host = settings.get("smtp_host")
        self.smtp_port = settings.get("smtp_port", 587)
        self.smtp_user = settings.get("smtp_user")
        self.smtp_password = settings.get("smtp_password")
        self.from_email = settings.get("from_email") or self.smtp_user
        self.from_name = settings.get("from_name", "AgrosJet")
        
        return all([self.smtp_host, self.smtp_user, self.smtp_password])
    
    def send_email(self, to_email: str, subject: str, html_body: str, plain_body: str = None) -> dict:
        """Send email via SMTP. Returns dict with success status and error message."""
        if not all([self.smtp_host, self.smtp_user, self.smtp_password]):
            logger.warning("SMTP settings not configured")
            return {"success": False, "error": "SMTP ayarları eksik"}
        
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email
            
            # Plain text version
            if plain_body:
                part1 = MIMEText(plain_body, "plain", "utf-8")
                msg.attach(part1)
            
            # HTML version
            part2 = MIMEText(html_body, "html", "utf-8")
            msg.attach(part2)
            
            # Create SSL context
            context = ssl.create_default_context()
            
            # Connect and send
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())
            
            logger.info(f"Email sent successfully to {to_email}")
            return {"success": True}
            
        except smtplib.SMTPAuthenticationError as e:
            error_msg = "SMTP kimlik doğrulama hatası. Gmail kullanıyorsanız App Password (Uygulama Şifresi) oluşturun."
            logger.error(f"SMTP Auth Error: {str(e)}")
            return {"success": False, "error": error_msg}
        except smtplib.SMTPConnectError as e:
            error_msg = f"SMTP sunucusuna bağlanılamadı: {self.smtp_host}:{self.smtp_port}"
            logger.error(f"SMTP Connect Error: {str(e)}")
            return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return {"success": False, "error": str(e)}


async def get_superadmin_email(company_id: str) -> Optional[str]:
    """Get super admin email for a company"""
    superadmin = await db.admins.find_one(
        {"company_id": company_id, "role": "superadmin"},
        {"_id": 0, "email": 1}
    )
    return superadmin.get("email") if superadmin else None


async def send_notification_email(company_id: str, title: str, message: str, notification_type: str = None) -> bool:
    """Send notification email to super admin"""
    # Check if email settings exist and are enabled
    settings = await db.email_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        return False
    
    # Check if this notification type is enabled
    type_to_setting = {
        "muhasebe_hareket": "notify_muhasebe",
        "zimmet_hareket": "notify_zimmet",
        "evrak_yuklendi": "notify_evrak",
        "jetpuan_siparis": "notify_jetpuan",
        "fesih_3_gun": "notify_fesih",
        "fesih_yarin": "notify_fesih",
    }
    
    setting_key = type_to_setting.get(notification_type)
    if setting_key and not settings.get(setting_key, True):
        logger.info(f"Email notification disabled for type: {notification_type}")
        return False
    
    # Get super admin email
    email = await get_superadmin_email(company_id)
    if not email:
        logger.warning(f"No super admin email found for company {company_id}")
        return False
    
    # Initialize email service
    service = EmailService()
    if not await service.load_settings(company_id):
        logger.warning(f"SMTP settings incomplete for company {company_id}")
        return False
    
    # Create email content
    icon_map = {
        "muhasebe_hareket": "💰",
        "zimmet_hareket": "📦",
        "jetpuan_siparis": "🛒",
        "evrak_yuklendi": "📄",
        "fesih_3_gun": "⚠️",
        "fesih_yarin": "🚨",
        "fatura_eksik": "📋",
        "fatura_istendi": "📝",
    }
    icon = icon_map.get(notification_type, "🔔")
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }}
            .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            .header {{ background: #0f172a; color: white; padding: 20px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 24px; }}
            .notification-box {{ background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 4px; }}
            .notification-title {{ font-size: 18px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }}
            .notification-message {{ color: #475569; line-height: 1.6; }}
            .footer {{ background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }}
            .btn {{ display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>AgrosJet</h1>
            </div>
            <div class="content">
                <div class="notification-box">
                    <div class="notification-title">{icon} {title}</div>
                    <div class="notification-message">{message}</div>
                </div>
                <p style="color: #64748b; font-size: 14px;">Bu bildirim otomatik olarak gönderilmiştir.</p>
            </div>
            <div class="footer">
                AgrosJet Kurye Yönetim Sistemi<br>
                Bu e-postayı almak istemiyorsanız, Sistem &gt; E-posta Ayarları'ndan bildirimleri kapatabilirsiniz.
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_body = f"""
    {title}
    
    {message}
    
    ---
    AgrosJet Kurye Yönetim Sistemi
    """
    
    subject = f"[AgrosJet] {title}"
    
    result = service.send_email(email, subject, html_body, plain_body)
    return result.get("success", False)
