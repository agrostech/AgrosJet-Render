#!/usr/bin/env python3
"""
ShiftJet Yerel Yazdırma Sunucusu
================================
Bu program bilgisayarınızda arka planda çalışır ve 
web sitesinden gelen yazdırma isteklerini doğrudan yazıcıya gönderir.

Kullanım:
    python shiftjet_print_server.py

Veya .exe olarak derlenmiş halini çift tıklayarak çalıştırın.

Port: 5555 (varsayılan)
"""

import sys
import json
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import webbrowser

# Varsayılan port
PORT = 5555

# Windows yazıcı desteği
try:
    import win32print
    import win32ui
    from PIL import Image, ImageDraw, ImageFont, ImageWin
    WINDOWS_PRINT = True
except ImportError:
    WINDOWS_PRINT = False
    print("Not: Windows yazdırma modülleri yüklü değil.")
    print("Yüklemek için: pip install pywin32 pillow")

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
    # Adresi satırlara böl
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
        
        # Ürün satırı
        item_text = f"{qty}x {name}"
        price_text = format_currency(price)
        
        if len(item_text) + len(price_text) + 2 > width:
            item_text = item_text[:width - len(price_text) - 3] + ".."
        
        spaces = width - len(item_text) - len(price_text)
        lines.append(f"{item_text}{' ' * spaces}{price_text}")
        
        # Ürün notu
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
        return {"success": False, "error": "Windows yazdırma modülü yüklü değil"}
    
    try:
        hprinter = win32print.OpenPrinter(printer_name)
        try:
            job = win32print.StartDocPrinter(hprinter, 1, ("ShiftJet Fis", None, "RAW"))
            try:
                win32print.StartPagePrinter(hprinter)
                win32print.WritePrinter(hprinter, data.encode('cp857'))  # Türkçe karakter desteği
                win32print.EndPagePrinter(hprinter)
            finally:
                win32print.EndDocPrinter(hprinter)
        finally:
            win32print.ClosePrinter(hprinter)
        return {"success": True, "message": f"Yazdırıldı: {printer_name}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def print_text_to_printer(printer_name, text, paper_size="80mm"):
    """Metin olarak yazdır (normal yazıcılar için)"""
    if not WINDOWS_PRINT:
        return {"success": False, "error": "Windows yazdırma modülü yüklü değil"}
    
    try:
        # Yazıcı DC al
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(printer_name)
        
        # Sayfa başlat
        hdc.StartDoc("ShiftJet Fis")
        hdc.StartPage()
        
        # Font ayarla
        font = win32ui.CreateFont({
            "name": "Consolas",
            "height": 20,
            "weight": 400,
        })
        hdc.SelectObject(font)
        
        # Metni satır satır yazdır
        y = 50
        for line in text.split("\n"):
            hdc.TextOut(50, y, line)
            y += 25
        
        # Sayfa bitir
        hdc.EndPage()
        hdc.EndDoc()
        hdc.DeleteDC()
        
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
        """CORS preflight"""
        self._set_headers(200)
    
    def do_GET(self):
        """GET istekleri"""
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == "/" or path == "/status":
            # Durum kontrolü
            self._set_headers()
            response = {
                "status": "running",
                "service": "ShiftJet Print Server",
                "version": "1.0.0",
                "port": PORT,
                "printers": get_printers(),
                "default_printer": get_default_printer()
            }
            self.wfile.write(json.dumps(response).encode())
        
        elif path == "/printers":
            # Yazıcı listesi
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
        """POST istekleri"""
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Body'yi oku
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        
        try:
            data = json.loads(body) if body else {}
        except:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Geçersiz JSON"}).encode())
            return
        
        if path == "/print":
            # Yazdırma isteği
            order = data.get("order", {})
            printer_name = data.get("printer") or get_default_printer()
            paper_size = data.get("paper_size", "80mm")
            use_raw = data.get("raw", True)
            
            if not order:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Sipariş verisi gerekli"}).encode())
                return
            
            if not printer_name:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Yazıcı bulunamadı"}).encode())
                return
            
            # Fiş oluştur
            width = 32 if paper_size == "58mm" else 48
            receipt_text = generate_receipt_text(order, width)
            
            # Yazdır
            if use_raw:
                # ESC/POS komutları ekle
                ESC = "\x1b"
                GS = "\x1d"
                
                raw_data = ""
                raw_data += ESC + "@"  # Sıfırla
                raw_data += ESC + "a\x01"  # Ortala
                raw_data += receipt_text
                raw_data += GS + "V\x00"  # Kes
                
                result = print_raw_to_printer(printer_name, raw_data)
            else:
                result = print_text_to_printer(printer_name, receipt_text, paper_size)
            
            self._set_headers(200 if result["success"] else 500)
            self.wfile.write(json.dumps(result).encode())
        
        elif path == "/print-raw":
            # Ham veri yazdır
            printer_name = data.get("printer") or get_default_printer()
            raw_data = data.get("data", "")
            
            if not raw_data:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Yazdırma verisi gerekli"}).encode())
                return
            
            result = print_raw_to_printer(printer_name, raw_data)
            self._set_headers(200 if result["success"] else 500)
            self.wfile.write(json.dumps(result).encode())
        
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint bulunamadı"}).encode())
    
    def log_message(self, format, *args):
        """Log mesajlarını göster"""
        print(f"[{self.log_date_time_string()}] {args[0]}")


def check_port_available(port):
    """Port'un kullanılabilir olup olmadığını kontrol et"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result != 0


def main():
    global PORT
    
    print("=" * 50)
    print("  ShiftJet Yerel Yazdırma Sunucusu")
    print("=" * 50)
    print()
    
    # Port kontrolü
    if not check_port_available(PORT):
        print(f"UYARI: Port {PORT} zaten kullanımda!")
        print("Başka bir ShiftJet Print Server çalışıyor olabilir.")
        print()
        input("Çıkmak için Enter'a basın...")
        sys.exit(1)
    
    # Yazıcıları listele
    printers = get_printers()
    default = get_default_printer()
    
    print("Bulunan Yazıcılar:")
    if printers:
        for p in printers:
            marker = " (varsayılan)" if p == default else ""
            print(f"  - {p}{marker}")
    else:
        print("  Yazıcı bulunamadı!")
    print()
    
    # Sunucuyu başlat
    server = HTTPServer(("0.0.0.0", PORT), PrintServerHandler)
    print(f"Sunucu başlatıldı: http://localhost:{PORT}")
    print()
    print("Bu pencereyi kapatmayın!")
    print("Yazdırma istekleri burada görünecek.")
    print("-" * 50)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSunucu kapatılıyor...")
        server.shutdown()


if __name__ == "__main__":
    main()
