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
    """SMTP Email Service - Sistem ayarlarından SMTP kullanır"""
    
    def __init__(self):
        self.smtp_host = None
        self.smtp_port = None
        self.smtp_user = None
        self.smtp_password = None
        self.from_email = None
        self.from_name = "AgrosJet"
        self.enabled = True
    
    async def load_system_settings(self) -> bool:
        """Load SMTP settings from system settings (central configuration)"""
        settings = await db.system_settings.find_one({"type": "smtp"}, {"_id": 0})
        if not settings:
            return False
        
        if not settings.get("enabled", True):
            return False
        
        self.smtp_host = settings.get("smtp_host")
        self.smtp_port = settings.get("smtp_port", 587)
        self.smtp_user = settings.get("smtp_user")
        self.smtp_password = settings.get("smtp_password")
        self.from_email = settings.get("from_email") or self.smtp_user
        self.from_name = settings.get("from_name", "AgrosJet")
        self.enabled = settings.get("enabled", True)
        
        return all([self.smtp_host, self.smtp_user, self.smtp_password])
    
    async def load_settings(self, company_id: str = None) -> bool:
        """
        Load SMTP settings - Artık sistem ayarlarını kullanır.
        company_id parametresi geriye uyumluluk için tutuldu.
        """
        return await self.load_system_settings()
    
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


async def get_all_superadmin_emails(company_id: str) -> list:
    """Return all configured superadmin email addresses for a company."""
    cursor = db.admins.find(
        {"company_id": company_id, "role": "superadmin"},
        {"_id": 0, "email": 1},
    )
    emails: list = []
    async for a in cursor:
        em = (a.get("email") or "").strip()
        if em and em not in emails:
            emails.append(em)
    return emails


async def send_auto_process_report(
    company_id: str,
    tab_name: str,
    period_label: str,
    success_items: list,
    failed_items: list,
    extras: Optional[dict] = None,
) -> bool:
    """
    Otomatik işleme sonrasında şirketin tüm superadminlerine rapor gönderir.

    success_items: [{"name": str, "amount": float, "note": str?}]
    failed_items: [{"name": str, "reason": str}]
    """
    emails = await get_all_superadmin_emails(company_id)
    if not emails:
        logger.info(f"send_auto_process_report: no superadmin email ({company_id})")
        return False

    service = EmailService()
    if not await service.load_system_settings():
        logger.warning("send_auto_process_report: SMTP not configured")
        return False

    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1}) or {}
    company_name = company.get("name") or "—"

    from datetime import datetime, timezone, timedelta
    tr_tz = timezone(timedelta(hours=3))
    time_str = datetime.now(tr_tz).strftime("%d.%m.%Y %H:%M")

    success_count = len(success_items)
    failed_count = len(failed_items)
    total_amount = sum(float(it.get("amount") or 0) for it in success_items)

    def _money(n: float) -> str:
        return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " TL"

    success_rows = "".join(
        f"<tr><td style='padding:6px 8px;border-bottom:1px solid #e2e8f0'>{(it.get('name') or '—')}</td>"
        f"<td style='padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:ui-monospace,Menlo,monospace'>{_money(float(it.get('amount') or 0))}</td>"
        f"<td style='padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px'>{(it.get('note') or '')}</td></tr>"
        for it in success_items[:200]
    ) or "<tr><td colspan='3' style='padding:10px;color:#64748b;text-align:center'>İşlem yapılmadı</td></tr>"

    failed_rows = "".join(
        f"<tr><td style='padding:6px 8px;border-bottom:1px solid #fee2e2'>{(it.get('name') or '—')}</td>"
        f"<td style='padding:6px 8px;border-bottom:1px solid #fee2e2;color:#b91c1c;font-size:12px'>{(it.get('reason') or '')}</td></tr>"
        for it in failed_items[:200]
    )

    extras_html = ""
    if extras:
        items_html = "".join(
            f"<li style='margin:2px 0;color:#475569'><strong>{k}:</strong> {v}</li>"
            for k, v in extras.items()
        )
        extras_html = f"<ul style='margin:8px 0 0 0;padding-left:18px;font-size:13px'>{items_html}</ul>"

    failed_block = ""
    if failed_count > 0:
        failed_block = (
            "<h3 style='font-size:14px;margin:18px 0 6px 0;color:#b91c1c'>Atlanan / Hatalar</h3>"
            "<table style='width:100%;border-collapse:collapse;background:#fef2f2;border:1px solid #fee2e2;border-radius:6px;overflow:hidden'>"
            "<thead><tr style='background:#fee2e2'><th style='padding:6px 8px;text-align:left;font-size:12px;color:#7f1d1d'>Kayıt</th>"
            "<th style='padding:6px 8px;text-align:left;font-size:12px;color:#7f1d1d'>Sebep</th></tr></thead>"
            f"<tbody>{failed_rows}</tbody></table>"
        )

    html_body = f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#0f172a">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#0f172a;color:#fff;padding:18px 24px">
      <div style="font-size:12px;letter-spacing:.08em;opacity:.7;text-transform:uppercase">Otomatik İşleme Raporu</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">{tab_name}</div>
    </div>
    <div style="padding:20px 24px">
      <table style="width:100%;font-size:13px;color:#475569;border-collapse:collapse">
        <tr><td style="padding:2px 0;width:140px">Şirket</td><td style="padding:2px 0;color:#0f172a;font-weight:600">{company_name}</td></tr>
        <tr><td style="padding:2px 0">Dönem</td><td style="padding:2px 0;color:#0f172a">{period_label}</td></tr>
        <tr><td style="padding:2px 0">Çalışma Zamanı</td><td style="padding:2px 0;color:#0f172a">{time_str}</td></tr>
      </table>

      <div style="display:flex;gap:12px;margin:18px 0 6px 0;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;background:#ecfdf5;border:1px solid #d1fae5;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#047857;letter-spacing:.05em;text-transform:uppercase">Başarılı</div>
          <div style="font-size:20px;font-weight:700;color:#065f46">{success_count}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#b91c1c;letter-spacing:.05em;text-transform:uppercase">Atlanan / Hata</div>
          <div style="font-size:20px;font-weight:700;color:#7f1d1d">{failed_count}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#eff6ff;border:1px solid #dbeafe;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#1d4ed8;letter-spacing:.05em;text-transform:uppercase">Toplam Tutar</div>
          <div style="font-size:18px;font-weight:700;color:#1e3a8a;font-family:ui-monospace,Menlo,monospace">{_money(total_amount)}</div>
        </div>
      </div>
      {extras_html}

      <h3 style="font-size:14px;margin:18px 0 6px 0;color:#0f172a">İşlenen Kayıtlar</h3>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <thead><tr style="background:#e2e8f0">
          <th style="padding:6px 8px;text-align:left;font-size:12px;color:#334155">Kayıt</th>
          <th style="padding:6px 8px;text-align:right;font-size:12px;color:#334155">Tutar</th>
          <th style="padding:6px 8px;text-align:left;font-size:12px;color:#334155">Not</th>
        </tr></thead>
        <tbody>{success_rows}</tbody>
      </table>

      {failed_block}
    </div>
    <div style="background:#f1f5f9;padding:12px 24px;text-align:center;font-size:11px;color:#64748b">
      Bu rapor otomatik olarak gönderilmiştir · AgrosJet
    </div>
  </div>
</body></html>
"""

    plain_lines = [
        f"{tab_name} - Otomatik İşleme Raporu",
        f"Şirket: {company_name}",
        f"Dönem: {period_label}",
        f"Çalışma Zamanı: {time_str}",
        "",
        f"Başarılı: {success_count}  |  Atlanan/Hata: {failed_count}  |  Toplam: {_money(total_amount)}",
        "",
    ]
    if success_items:
        plain_lines.append("İşlenen Kayıtlar:")
        for it in success_items[:200]:
            plain_lines.append(
                f"  - {it.get('name','—')}  {_money(float(it.get('amount') or 0))}  {it.get('note','')}".rstrip()
            )
    if failed_items:
        plain_lines.append("")
        plain_lines.append("Atlanan/Hata:")
        for it in failed_items[:200]:
            plain_lines.append(f"  - {it.get('name','—')}: {it.get('reason','')}")
    plain_body = "\n".join(plain_lines)

    subject = f"[AgrosJet] {tab_name} • Otomatik İşleme - {company_name}"

    any_ok = False
    for em in emails:
        r = service.send_email(em, subject, html_body, plain_body)
        if r.get("success"):
            any_ok = True
        else:
            logger.warning(f"auto-process report to {em} failed: {r.get('error')}")
    return any_ok


async def send_notification_email(company_id: str, title: str, message: str, notification_type: str = None) -> bool:
    """
    Send notification email to super admin.
    Sistem SMTP ayarlarını kullanır, şirket bazlı bildirim tercihlerini kontrol eder.
    """
    # Check if company has notification settings (bildirim tercihleri şirket bazlı kalabilir)
    company_settings = await db.email_settings.find_one({"company_id": company_id}, {"_id": 0})
    
    # Check if this notification type is enabled for the company
    if company_settings:
        type_to_setting = {
            "muhasebe_hareket": "notify_muhasebe",
            "zimmet_hareket": "notify_zimmet",
            "evrak_yuklendi": "notify_evrak",
            "jetpuan_siparis": "notify_jetpuan",
            "fesih_3_gun": "notify_fesih",
            "fesih_yarin": "notify_fesih",
        }
        
        setting_key = type_to_setting.get(notification_type)
        if setting_key and not company_settings.get(setting_key, True):
            logger.info(f"Email notification disabled for type: {notification_type}")
            return False
    
    # Get super admin email for this company
    email = await get_superadmin_email(company_id)
    if not email:
        logger.warning(f"No super admin email found for company {company_id}")
        return False
    
    # Initialize email service with SYSTEM settings
    service = EmailService()
    if not await service.load_system_settings():
        logger.warning("System SMTP settings not configured")
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
