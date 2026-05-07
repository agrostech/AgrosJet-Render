"""
PDF utility functions for cover pages and page numbering.
Used by courier and restaurant invoice bulk download endpoints.
"""
import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from pypdf import PdfWriter, PdfReader
from PIL import Image as PILImage

LOGO_DIR = "/app/uploads/logos"

# Register Turkish-compatible fonts
_FONTS_AVAILABLE = False
try:
    # Vera fontları reportlab ile birlikte geliyor - her ortamda mevcut
    _vera_dir = os.path.dirname(os.path.abspath(__file__))
    import reportlab
    _vera_dir = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    _vera_regular = os.path.join(_vera_dir, "Vera.ttf")
    _vera_bold = os.path.join(_vera_dir, "VeraBd.ttf")
    if os.path.exists(_vera_regular) and os.path.exists(_vera_bold):
        if "TRSans" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("TRSans", _vera_regular))
        if "TRSansBold" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("TRSansBold", _vera_bold))
        _FONTS_AVAILABLE = True
    else:
        print(f"Vera fontları bulunamadı: {_vera_dir}")
except Exception as e:
    print(f"Font register hatası: {e}")

TURKISH_MONTHS = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
    5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
    9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
}


def get_logo_bytes(logo_path: str) -> bytes | None:
    """Read company logo from filesystem. logo_path like /api/companies/logo/xxx_light.png"""
    if not logo_path:
        return None
    filename = logo_path.split("/")[-1]
    filepath = os.path.join(LOGO_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "rb") as f:
            return f.read()
    return None


def create_cover_page(
    title: str,
    subtitle: str,
    logo_bytes: bytes | None = None,
    invoice_count: int = 0,
    generated_date: str = "",
) -> io.BytesIO:
    """Create a professional cover page PDF."""
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # White background
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, width, height, fill=1)

    # Logo
    if logo_bytes:
        try:
            img = PILImage.open(io.BytesIO(logo_bytes))
            img_buf = io.BytesIO()
            if img.mode in ("RGBA", "P"):
                bg = PILImage.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                bg.paste(img, mask=img.split()[3])
                img = bg
            img.save(img_buf, format="PNG")
            img_buf.seek(0)
            img_reader = ImageReader(img_buf)

            # Scale logo proportionally
            img_w, img_h = img.size
            aspect = img_w / img_h
            max_logo_w, max_logo_h = 200, 80
            logo_w = min(max_logo_w, max_logo_h * aspect)
            logo_h = logo_w / aspect
            x = (width - logo_w) / 2
            y = height - 180
            c.drawImage(img_reader, x, y, logo_w, logo_h)
        except Exception as e:
            print(f"Logo eklenemedi: {e}")

    # Title
    _title_font = "TRSansBold" if _FONTS_AVAILABLE else "Helvetica-Bold"
    _body_font = "TRSans" if _FONTS_AVAILABLE else "Helvetica"
    c.setFont(_title_font, 26)
    c.setFillColorRGB(0.15, 0.15, 0.15)
    c.drawCentredString(width / 2, height - 280, title)

    # Subtitle (month/year)
    c.setFont(_body_font, 18)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawCentredString(width / 2, height - 315, subtitle)

    # Divider
    c.setStrokeColorRGB(0.78, 0.78, 0.78)
    c.setLineWidth(0.8)
    c.line(width * 0.25, height - 345, width * 0.75, height - 345)

    # Invoice count
    c.setFont(_body_font, 14)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    c.drawCentredString(width / 2, height - 380, f"{invoice_count} Fatura")

    # Generated date
    c.setFont(_body_font, 11)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, height - 410, f"Oluşturulma: {generated_date}")

    # Footer
    c.setFont(_body_font, 8)
    c.setFillColorRGB(0.6, 0.6, 0.6)
    c.drawCentredString(width / 2, 30, "AgrosJet - Powered by AgrosTech")

    c.save()
    buf.seek(0)
    return buf


def add_page_numbers(writer: PdfWriter) -> PdfWriter:
    """Add 'Sayfa X / Y' to the bottom center of every page."""
    total = len(writer.pages)
    for i in range(total):
        try:
            page = writer.pages[i]
            pw = float(page.mediabox.width)
            ph = float(page.mediabox.height)
            
            # Boyut sağlık kontrolü — bozuk PDF'lerde mediabox 0 olabilir
            if pw <= 0 or ph <= 0:
                continue

            overlay_buf = io.BytesIO()
            c = rl_canvas.Canvas(overlay_buf, pagesize=(pw, ph))
            c.setFont("TRSans" if _FONTS_AVAILABLE else "Helvetica", 9)
            c.setFillColorRGB(0.45, 0.45, 0.45)
            c.drawRightString(pw - 20, 15, f"Sayfa {i + 1} / {total}")
            c.save()
            overlay_buf.seek(0)

            overlay_reader = PdfReader(overlay_buf)
            page.merge_page(overlay_reader.pages[0])
        except Exception as e:
            # Tek bir sayfa bozuksa overall PDF'i bozma — sayfa numarasız geçsin
            print(f"add_page_numbers sayfa {i+1} hatası: {e}")
            continue

    return writer
