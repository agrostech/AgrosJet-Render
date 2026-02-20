#!/usr/bin/env python3
"""
ShiftJet Sessiz Yazdırma Sunucusu (System Tray)
================================================
Bu program sistem tepsisinde sessizce çalışır ve web sitesinden
gelen yazdırma isteklerini doğrudan yazıcıya gönderir.

Gereksinimler:
    pip install pywin32 pillow pystray flask

Kullanım:
    python shiftjet_print_server_systray.py

Veya .exe olarak derlemek için:
    pip install pyinstaller
    pyinstaller --onefile --noconsole --icon=printer.ico shiftjet_print_server_systray.py

Port: 5555 (varsayılan)
"""

import sys
import os
import json
import socket
import threading
import webbrowser
from io import BytesIO

# Flask ve HTTP
try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("Flask yüklü değil. Yüklemek için:")
    print("  pip install flask flask-cors")
    input("Çıkmak için Enter'a basın...")
    sys.exit(1)

# System Tray
try:
    import pystray
    from pystray import MenuItem as Item, Menu
except ImportError:
    print("pystray yüklü değil. Yüklemek için:")
    print("  pip install pystray")
    input("Çıkmak için Enter'a basın...")
    sys.exit(1)

# PIL (ikon için)
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow yüklü değil. Yüklemek için:")
    print("  pip install pillow")
    input("Çıkmak için Enter'a basın...")
    sys.exit(1)

# Windows yazıcı desteği
try:
    import win32print
    import win32ui
    WINDOWS_PRINT = True
except ImportError:
    WINDOWS_PRINT = False
    print("Uyarı: Windows yazdırma modülleri yüklü değil.")
    print("Yüklemek için: pip install pywin32")

# ============================================
# YAPILANDIRMA
# ============================================
PORT = 5555
APP_NAME = "ShiftJet Print Server"
VERSION = "2.0.0"

# Global değişkenler
selected_printer = None
tray_icon = None
server_thread = None
flask_app = None

# ============================================
# YAZICI FONKSİYONLARI
# ============================================

# Platform etiketleri
PLATFORM_LABELS = {
    "adisyo": "Adisyo",
    "getir": "Getir",
    "trendyol": "Trendyol",
    "yemeksepeti": "Yemeksepeti",
    "migros": "Migros",
    "phone": "Telefon",
    "manual": "Manuel",
    "test": "Test",
}

# Ödeme yöntemi etiketleri
PAYMENT_LABELS = {
    "cash": "NAKIT",
    "card": "KREDI KARTI",
    "online": "ONLINE",
    "meal_card": "YEMEK KARTI",
    "online_meal_card": "ONLINE YEMEK KARTI",
}


def get_printers():
    """Sistemdeki yazıcıları listele"""
    if not WINDOWS_PRINT:
        return []
    printers = []
    for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
        printers.append(printer[2])
    return printers


def get_default_printer():
    """Varsayılan yazıcıyı al"""
    if not WINDOWS_PRINT:
        return None
    try:
        return win32print.GetDefaultPrinter()
    except:
        return None


def format_currency(amount):
    """Para formatla"""
    try:
        return f"{float(amount):,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        return f"{amount} TL"


def format_date(date_str):
    """Tarih formatla"""
    if not date_str:
        return ""
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except:
        return str(date_str)[:16]


def generate_receipt_text(order, width=48):
    """ESC/POS formatında fiş metni oluştur"""
    lines = []
    
    # Başlık
    order_num = order.get("order_number", "---")
    platform = PLATFORM_LABELS.get(order.get("platform", ""), order.get("platform", ""))
    
    lines.append("=" * width)
    lines.append(f"#{order_num}".center(width))
    lines.append(f"[ {platform.upper()} ]".center(width))
    lines.append(format_date(order.get("created_at", "")).center(width))
    lines.append("=" * width)
    
    # Müşteri
    lines.append("MUSTERI:")
    lines.append(f"  {order.get('customer_name', '-')}")
    if order.get("customer_phone"):
        lines.append(f"  Tel: {order.get('customer_phone')}")
    lines.append("-" * width)
    
    # Adres
    lines.append("ADRES:")
    address = order.get("delivery_address", "-")
    while len(address) > 0:
        lines.append(f"  {address[:width-2]}")
        address = address[width-2:]
    lines.append("-" * width)
    
    # Ürünler
    lines.append("URUNLER:")
    items = order.get("items", [])
    for item in items:
        qty = item.get("quantity", 1)
        name = item.get("name", "Urun")
        price = item.get("price", 0) * qty
        
        item_text = f"{qty}x {name}"
        price_text = format_currency(price)
        
        if len(item_text) + len(price_text) + 2 > width:
            item_text = item_text[:width - len(price_text) - 3] + ".."
        
        spaces = width - len(item_text) - len(price_text)
        lines.append(f"{item_text}{' ' * spaces}{price_text}")
        
        if item.get("notes"):
            lines.append(f"   > {item.get('notes')[:width-5]}")
    
    lines.append("=" * width)
    
    # Toplam
    total = format_currency(order.get("total_amount", 0))
    lines.append(f"TOPLAM: {total}".rjust(width))
    
    payment = order.get("payment_method_detail") or PAYMENT_LABELS.get(order.get("payment_method", ""), order.get("payment_method", ""))
    lines.append(f"[ {payment} ]".center(width))
    
    # Sipariş notu
    if order.get("notes"):
        lines.append("-" * width)
        lines.append("SIPARIS NOTU:")
        note = order.get("notes", "")
        while len(note) > 0:
            lines.append(f"  {note[:width-2]}")
            note = note[width-2:]
    
    # Footer
    lines.append("-" * width)
    lines.append("ShiftJet Siparis Sistemi".center(width))
    lines.append("-" * width)
    lines.append("")
    lines.append("")
    lines.append("")
    
    return "\n".join(lines)


def print_raw_to_printer(printer_name, data):
    """RAW veriyi doğrudan yazıcıya gönder (ESC/POS)"""
    if not WINDOWS_PRINT:
        return {"success": False, "error": "Windows yazdir modulu yuklu degil"}
    
    try:
        hprinter = win32print.OpenPrinter(printer_name)
        try:
            job = win32print.StartDocPrinter(hprinter, 1, ("ShiftJet Fis", None, "RAW"))
            try:
                win32print.StartPagePrinter(hprinter)
                win32print.WritePrinter(hprinter, data.encode('cp857'))
                win32print.EndPagePrinter(hprinter)
            finally:
                win32print.EndDocPrinter(hprinter)
        finally:
            win32print.ClosePrinter(hprinter)
        return {"success": True, "message": f"Yazdirildi: {printer_name}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def print_text_to_printer(printer_name, text, paper_size="80mm"):
    """Metin olarak yazdır (normal yazıcılar için)"""
    if not WINDOWS_PRINT:
        return {"success": False, "error": "Windows yazdir modulu yuklu degil"}
    
    try:
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(printer_name)
        hdc.StartDoc("ShiftJet Fis")
        hdc.StartPage()
        
        font = win32ui.CreateFont({
            "name": "Consolas",
            "height": 20,
            "weight": 400,
        })
        hdc.SelectObject(font)
        
        y = 50
        for line in text.split("\n"):
            hdc.TextOut(50, y, line)
            y += 25
        
        hdc.EndPage()
        hdc.EndDoc()
        hdc.DeleteDC()
        
        return {"success": True, "message": f"Yazdirildi: {printer_name}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# FLASK SUNUCUSU
# ============================================

flask_app = Flask(__name__)
CORS(flask_app)

# Flask loglarını kapat (sessiz çalışması için)
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)


@flask_app.route("/", methods=["GET"])
@flask_app.route("/status", methods=["GET"])
def status():
    """Sunucu durumu"""
    return jsonify({
        "status": "running",
        "service": APP_NAME,
        "version": VERSION,
        "port": PORT,
        "printers": get_printers(),
        "default_printer": get_default_printer(),
        "selected_printer": selected_printer
    })


@flask_app.route("/printers", methods=["GET"])
def list_printers():
    """Yazıcı listesi"""
    return jsonify({
        "success": True,
        "printers": get_printers(),
        "default": get_default_printer(),
        "selected": selected_printer
    })


@flask_app.route("/print", methods=["POST", "OPTIONS"])
def print_order():
    """Sipariş yazdır"""
    if request.method == "OPTIONS":
        return "", 200
    
    global selected_printer
    
    data = request.get_json() or {}
    order = data.get("order", {})
    printer_name = data.get("printer") or selected_printer or get_default_printer()
    paper_size = data.get("paper_size", "80mm")
    use_raw = data.get("raw", True)
    
    if not order:
        return jsonify({"success": False, "error": "Siparis verisi gerekli"}), 400
    
    if not printer_name:
        return jsonify({"success": False, "error": "Yazici bulunamadi"}), 400
    
    # Fiş oluştur
    width = 32 if paper_size == "58mm" else 48
    receipt_text = generate_receipt_text(order, width)
    
    # Yazdır
    if use_raw:
        ESC = "\x1b"
        GS = "\x1d"
        
        raw_data = ""
        raw_data += ESC + "@"
        raw_data += ESC + "a\x01"
        raw_data += receipt_text
        raw_data += GS + "V\x00"
        
        result = print_raw_to_printer(printer_name, raw_data)
    else:
        result = print_text_to_printer(printer_name, receipt_text, paper_size)
    
    # Tray ikonunu güncelle (yazdırma bildirimi)
    if tray_icon and result.get("success"):
        show_notification("Yazdirma Basarili", f"Siparis #{order.get('order_number', '?')} yazdirildi")
    
    return jsonify(result), 200 if result.get("success") else 500


@flask_app.route("/print-raw", methods=["POST", "OPTIONS"])
def print_raw():
    """Ham veri yazdır"""
    if request.method == "OPTIONS":
        return "", 200
    
    global selected_printer
    
    data = request.get_json() or {}
    printer_name = data.get("printer") or selected_printer or get_default_printer()
    raw_data = data.get("data", "")
    
    if not raw_data:
        return jsonify({"success": False, "error": "Yazdirma verisi gerekli"}), 400
    
    result = print_raw_to_printer(printer_name, raw_data)
    return jsonify(result), 200 if result.get("success") else 500


def run_flask():
    """Flask sunucusunu başlat"""
    flask_app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)


# ============================================
# SYSTEM TRAY
# ============================================

def create_icon_image():
    """Tray ikonu oluştur (yazıcı ikonu)"""
    # 64x64 ikon
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Yeşil arka plan (daire)
    draw.ellipse([4, 4, 60, 60], fill=(76, 175, 80, 255))
    
    # Yazıcı gövdesi (beyaz)
    draw.rectangle([14, 24, 50, 44], fill=(255, 255, 255, 255))
    
    # Kağıt giriş
    draw.rectangle([20, 16, 44, 28], fill=(255, 255, 255, 255))
    
    # Kağıt çıkış
    draw.rectangle([20, 40, 44, 52], fill=(255, 255, 255, 255))
    
    # Yazıcı detayları
    draw.rectangle([18, 30, 28, 36], fill=(76, 175, 80, 255))
    draw.ellipse([42, 30, 48, 36], fill=(76, 175, 80, 255))
    
    return img


def show_notification(title, message):
    """Windows bildirimi göster"""
    global tray_icon
    if tray_icon:
        try:
            tray_icon.notify(message, title)
        except:
            pass


def on_select_printer(printer_name):
    """Yazıcı seçimi"""
    def handler(icon, item):
        global selected_printer
        selected_printer = printer_name
        show_notification("Yazici Secildi", printer_name)
    return handler


def on_test_print(icon, item):
    """Test yazdırma"""
    global selected_printer
    printer = selected_printer or get_default_printer()
    
    if not printer:
        show_notification("Hata", "Yazici bulunamadi!")
        return
    
    test_order = {
        "order_number": "TEST-001",
        "platform": "test",
        "created_at": "2024-01-01T12:00:00Z",
        "customer_name": "Test Musteri",
        "customer_phone": "0532 123 4567",
        "delivery_address": "Test Adres Mah. Test Sok. No:1 Test/Istanbul",
        "items": [
            {"name": "Test Urun 1", "quantity": 2, "price": 50.0},
            {"name": "Test Urun 2", "quantity": 1, "price": 75.0, "notes": "Extra sos"}
        ],
        "total_amount": 175.0,
        "payment_method": "cash",
        "notes": "Test siparis notu"
    }
    
    receipt = generate_receipt_text(test_order, 48)
    
    ESC = "\x1b"
    GS = "\x1d"
    raw_data = ESC + "@" + ESC + "a\x01" + receipt + GS + "V\x00"
    
    result = print_raw_to_printer(printer, raw_data)
    
    if result.get("success"):
        show_notification("Test Basarili", f"Test fisi yazdirildi: {printer}")
    else:
        show_notification("Hata", result.get("error", "Bilinmeyen hata"))


def on_open_browser(icon, item):
    """Tarayıcıda aç"""
    webbrowser.open(f"http://localhost:{PORT}")


def on_quit(icon, item):
    """Uygulamadan çık"""
    icon.stop()
    os._exit(0)


def create_menu():
    """Tray menüsü oluştur"""
    printers = get_printers()
    default = get_default_printer()
    
    # Yazıcı alt menüsü
    printer_items = []
    for p in printers:
        checked = (p == selected_printer) or (selected_printer is None and p == default)
        printer_items.append(Item(
            f"{'* ' if checked else ''}{p}",
            on_select_printer(p)
        ))
    
    if not printer_items:
        printer_items.append(Item("Yazici bulunamadi", None, enabled=False))
    
    menu = Menu(
        Item(f"{APP_NAME} v{VERSION}", None, enabled=False),
        Menu.SEPARATOR,
        Item("Yazicilar", Menu(*printer_items)),
        Menu.SEPARATOR,
        Item("Test Yazdir", on_test_print),
        Item("Tarayicide Ac", on_open_browser),
        Menu.SEPARATOR,
        Item("Cikis", on_quit)
    )
    
    return menu


def setup_tray():
    """System tray başlat"""
    global tray_icon, selected_printer
    
    # Varsayılan yazıcıyı seç
    selected_printer = get_default_printer()
    
    # İkon oluştur
    icon_image = create_icon_image()
    
    # Tray ikonu oluştur
    tray_icon = pystray.Icon(
        APP_NAME,
        icon_image,
        f"{APP_NAME}\nPort: {PORT}",
        menu=create_menu()
    )
    
    return tray_icon


# ============================================
# ANA FONKSİYON
# ============================================

def check_port_available(port):
    """Port kontrolü"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result != 0


def main():
    global server_thread
    
    # Port kontrolü
    if not check_port_available(PORT):
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Port {PORT} zaten kullanımda!\n\nBaşka bir ShiftJet Print Server çalışıyor olabilir.",
                "ShiftJet Print Server - Hata",
                0x10  # MB_ICONERROR
            )
        except:
            pass
        sys.exit(1)
    
    # Flask sunucusunu arka planda başlat
    server_thread = threading.Thread(target=run_flask, daemon=True)
    server_thread.start()
    
    # System tray başlat
    icon = setup_tray()
    
    # Başlangıç bildirimi
    def after_setup(icon):
        icon.visible = True
        show_notification("ShiftJet Print Server", f"Sunucu baslatildi - Port {PORT}")
    
    # Tray ikonunu çalıştır (ana thread'de)
    icon.run(setup=after_setup)


if __name__ == "__main__":
    main()
