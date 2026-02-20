#!/usr/bin/env python3
"""
ShiftJet Yerel Yazdırma Sunucusu (Sistem Tepsisi Versiyonu)
===========================================================
Arka planda sessiz çalışır, sistem tepsisinde ikon olarak görünür.

Kullanım:
    python shiftjet_print_server_tray.py

.exe olarak derlemek için:
    pip install pyinstaller
    pyinstaller --onefile --noconsole --icon=printer.ico shiftjet_print_server_tray.py

"""

import sys
import json
import socket
import threading
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# Varsayılan port
PORT = 5555

# Windows yazıcı desteği
try:
    import win32print
    import win32ui
    WINDOWS_PRINT = True
except ImportError:
    WINDOWS_PRINT = False

# Sistem tepsisi desteği
try:
    import pystray
    from pystray import MenuItem as item
    from PIL import Image, ImageDraw
    TRAY_SUPPORT = True
except ImportError:
    TRAY_SUPPORT = False
    print("Sistem tepsisi için: pip install pystray pillow")

# Global değişkenler
server = None
tray_icon = None
is_running = True
print_count = 0

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


def create_tray_icon():
    """Sistem tepsisi ikonu oluştur"""
    # 64x64 yeşil yazıcı ikonu
    size = 64
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Yazıcı gövdesi (yeşil kutu)
    draw.rectangle([8, 20, 56, 48], fill='#22c55e', outline='#16a34a', width=2)
    
    # Kağıt çıkışı (beyaz)
    draw.rectangle([16, 8, 48, 24], fill='white', outline='#e5e7eb', width=1)
    
    # Kağıt çizgileri
    draw.line([20, 12, 44, 12], fill='#9ca3af', width=1)
    draw.line([20, 16, 40, 16], fill='#9ca3af', width=1)
    
    # Alt tepsi
    draw.rectangle([12, 48, 52, 56], fill='#16a34a', outline='#15803d', width=1)
    
    return image


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
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except:
        return str(date_str)[:16]


def generate_receipt_text(order, width=48):
    """ESC/POS formatında fiş metni oluştur"""
    lines = []
    
    order_num = order.get("order_number", "---")
    platform = PLATFORM_LABELS.get(order.get("platform", ""), order.get("platform", ""))
    
    lines.append("=" * width)
    lines.append(f"#{order_num}".center(width))
    lines.append(f"[ {platform.upper()} ]".center(width))
    lines.append(format_date(order.get("created_at", "")).center(width))
    lines.append("=" * width)
    
    lines.append("MUSTERI:")
    lines.append(f"  {order.get('customer_name', '-')}")
    if order.get("customer_phone"):
        lines.append(f"  Tel: {order.get('customer_phone')}")
    lines.append("-" * width)
    
    lines.append("ADRES:")
    address = order.get("delivery_address", "-")
    while len(address) > 0:
        lines.append(f"  {address[:width-2]}")
        address = address[width-2:]
    lines.append("-" * width)
    
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
    
    total = format_currency(order.get("total_amount", 0))
    lines.append(f"TOPLAM: {total}".rjust(width))
    
    payment = order.get("payment_method_detail") or PAYMENT_LABELS.get(order.get("payment_method", ""), order.get("payment_method", ""))
    lines.append(f"[ {payment} ]".center(width))
    
    if order.get("notes"):
        lines.append("-" * width)
        lines.append("SIPARIS NOTU:")
        note = order.get("notes", "")
        while len(note) > 0:
            lines.append(f"  {note[:width-2]}")
            note = note[width-2:]
    
    lines.append("-" * width)
    lines.append("ShiftJet Siparis Sistemi".center(width))
    lines.append("-" * width)
    lines.append("")
    lines.append("")
    lines.append("")
    
    return "\n".join(lines)


def print_raw_to_printer(printer_name, data):
    """RAW veriyi doğrudan yazıcıya gönder"""
    if not WINDOWS_PRINT:
        return {"success": False, "error": "Windows yazdırma modülü yüklü değil"}
    
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
        return {"success": True, "message": f"Yazdırıldı: {printer_name}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class PrintServerHandler(BaseHTTPRequestHandler):
    """HTTP istek işleyici"""
    
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    
    def do_OPTIONS(self):
        self._set_headers(200)
    
    def do_GET(self):
        global print_count
        
        if self.path == "/" or self.path == "/status":
            self._set_headers()
            response = {
                "status": "running",
                "service": "ShiftJet Print Server",
                "version": "2.0.0",
                "port": PORT,
                "printers": get_printers(),
                "default_printer": get_default_printer(),
                "print_count": print_count
            }
            self.wfile.write(json.dumps(response).encode())
        
        elif self.path == "/printers":
            self._set_headers()
            response = {
                "success": True,
                "printers": get_printers(),
                "default": get_default_printer()
            }
            self.wfile.write(json.dumps(response).encode())
        
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Sayfa bulunamadı"}).encode())
    
    def do_POST(self):
        global print_count
        
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        
        try:
            data = json.loads(body) if body else {}
        except:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Geçersiz JSON"}).encode())
            return
        
        if self.path == "/print":
            order = data.get("order", {})
            printer_name = data.get("printer") or get_default_printer()
            paper_size = data.get("paper_size", "80mm")
            
            if not order:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Sipariş verisi gerekli"}).encode())
                return
            
            if not printer_name:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Yazıcı bulunamadı"}).encode())
                return
            
            width = 32 if paper_size == "58mm" else 48
            receipt_text = generate_receipt_text(order, width)
            
            ESC = "\x1b"
            GS = "\x1d"
            raw_data = ESC + "@" + ESC + "a\x01" + receipt_text + GS + "V\x00"
            
            result = print_raw_to_printer(printer_name, raw_data)
            
            if result["success"]:
                print_count += 1
                update_tray_tooltip()
            
            self._set_headers(200 if result["success"] else 500)
            self.wfile.write(json.dumps(result).encode())
        
        elif self.path == "/print-raw":
            printer_name = data.get("printer") or get_default_printer()
            raw_data = data.get("data", "")
            
            if not raw_data:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Yazdırma verisi gerekli"}).encode())
                return
            
            result = print_raw_to_printer(printer_name, raw_data)
            
            if result["success"]:
                print_count += 1
                update_tray_tooltip()
            
            self._set_headers(200 if result["success"] else 500)
            self.wfile.write(json.dumps(result).encode())
        
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint bulunamadı"}).encode())
    
    def log_message(self, format, *args):
        pass  # Sessiz mod - log yok


def update_tray_tooltip():
    """Sistem tepsisi tooltip'ini güncelle"""
    global tray_icon, print_count
    if tray_icon:
        tray_icon.title = f"ShiftJet Print Server\nYazdırılan: {print_count} fiş"


def check_port_available(port):
    """Port kontrolü"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result != 0


def run_server():
    """HTTP sunucusunu başlat"""
    global server, is_running
    
    if not check_port_available(PORT):
        if TRAY_SUPPORT:
            show_notification("Hata", f"Port {PORT} zaten kullanımda!")
        return
    
    server = HTTPServer(("0.0.0.0", PORT), PrintServerHandler)
    
    while is_running:
        server.handle_request()


def show_notification(title, message):
    """Bildirim göster"""
    global tray_icon
    if tray_icon and hasattr(tray_icon, 'notify'):
        tray_icon.notify(message, title)


def on_quit(icon, item):
    """Programı kapat"""
    global is_running, server, tray_icon
    
    is_running = False
    
    if server:
        server.shutdown()
    
    if tray_icon:
        tray_icon.stop()


def on_status(icon, item):
    """Durum bilgisi göster"""
    printers = get_printers()
    default = get_default_printer()
    msg = f"Port: {PORT}\nYazıcı: {default}\nToplam: {print_count} fiş"
    show_notification("ShiftJet Print Server", msg)


def on_test_print(icon, item):
    """Test yazdırma"""
    default = get_default_printer()
    if not default:
        show_notification("Hata", "Varsayılan yazıcı bulunamadı!")
        return
    
    test_order = {
        "order_number": "TEST-001",
        "customer_name": "Test Müşteri",
        "customer_phone": "0555 555 55 55",
        "delivery_address": "Test Mahallesi, Test Sokak No:1",
        "items": [
            {"name": "Test Ürün", "quantity": 1, "price": 100}
        ],
        "total_amount": 100,
        "payment_method": "cash",
        "created_at": datetime.now().isoformat(),
        "platform": "test"
    }
    
    receipt = generate_receipt_text(test_order, 48)
    ESC = "\x1b"
    GS = "\x1d"
    raw_data = ESC + "@" + ESC + "a\x01" + receipt + GS + "V\x00"
    
    result = print_raw_to_printer(default, raw_data)
    
    if result["success"]:
        show_notification("Başarılı", "Test fişi yazdırıldı!")
    else:
        show_notification("Hata", result.get("error", "Yazdırma hatası"))


def main():
    global tray_icon, is_running
    
    if not WINDOWS_PRINT:
        print("HATA: pywin32 modülü yüklü değil!")
        print("Yüklemek için: pip install pywin32")
        input("Enter'a basın...")
        sys.exit(1)
    
    if not TRAY_SUPPORT:
        print("HATA: pystray modülü yüklü değil!")
        print("Yüklemek için: pip install pystray pillow")
        input("Enter'a basın...")
        sys.exit(1)
    
    # Port kontrolü
    if not check_port_available(PORT):
        print(f"HATA: Port {PORT} zaten kullanımda!")
        print("Başka bir ShiftJet Print Server çalışıyor olabilir.")
        input("Enter'a basın...")
        sys.exit(1)
    
    # Sunucu thread'ini başlat
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Sistem tepsisi menüsü
    menu = pystray.Menu(
        item('Durum', on_status),
        item('Test Yazdır', on_test_print),
        pystray.Menu.SEPARATOR,
        item('Çıkış', on_quit)
    )
    
    # Sistem tepsisi ikonu
    icon_image = create_tray_icon()
    tray_icon = pystray.Icon(
        "shiftjet_print",
        icon_image,
        "ShiftJet Print Server",
        menu
    )
    
    # Başlangıç bildirimi
    def after_setup(icon):
        icon.visible = True
        show_notification("ShiftJet Print Server", f"Sunucu başlatıldı (Port: {PORT})")
    
    tray_icon.run(setup=after_setup)


if __name__ == "__main__":
    main()
