@echo off
chcp 65001 >nul
title ShiftJet Print Server Kurulumu
color 0A

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║          ShiftJet Print Server - Otomatik Kurulum            ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  Bu kurulum tek seferlik yapılır.                            ║
echo ║  Kurulum tamamlandıktan sonra masaüstünüzde                  ║
echo ║  "ShiftJet Print Server.exe" dosyası oluşacak.               ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Python kontrolü
echo [1/4] Python kontrol ediliyor...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ╔══════════════════════════════════════════════════════════════╗
    echo ║  HATA: Python bulunamadı!                                    ║
    echo ║                                                              ║
    echo ║  Lütfen python.org adresinden Python indirin.               ║
    echo ║  Kurulum sırasında "Add to PATH" seçeneğini işaretleyin!    ║
    echo ╚══════════════════════════════════════════════════════════════╝
    echo.
    start https://www.python.org/downloads/
    pause
    exit /b 1
)
echo       Python bulundu!

:: Gerekli kütüphaneleri yükle
echo.
echo [2/4] Gerekli kütüphaneler yükleniyor...
echo       (Bu biraz zaman alabilir)
pip install pywin32 pillow pystray flask flask-cors pyinstaller --quiet --disable-pip-version-check
if %errorlevel% neq 0 (
    echo HATA: Kütüphaneler yüklenemedi!
    pause
    exit /b 1
)
echo       Kütüphaneler yüklendi!

:: Python dosyasını oluştur
echo.
echo [3/4] Program dosyası hazırlanıyor...

:: Geçici dizin oluştur
set "TEMP_DIR=%TEMP%\shiftjet_build"
if exist "%TEMP_DIR%" rd /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

:: Python dosyasını oluştur
(
echo #!/usr/bin/env python3
echo """
echo ShiftJet Sessiz Yazdirma Sunucusu ^(System Tray^)
echo """
echo.
echo import sys
echo import os
echo import json
echo import socket
echo import threading
echo import webbrowser
echo from io import BytesIO
echo.
echo try:
echo     from flask import Flask, request, jsonify
echo     from flask_cors import CORS
echo except ImportError:
echo     import ctypes
echo     ctypes.windll.user32.MessageBoxW^(0, "Flask yuklu degil!\npip install flask flask-cors", "Hata", 0x10^)
echo     sys.exit^(1^)
echo.
echo try:
echo     import pystray
echo     from pystray import MenuItem as Item, Menu
echo except ImportError:
echo     import ctypes
echo     ctypes.windll.user32.MessageBoxW^(0, "pystray yuklu degil!\npip install pystray", "Hata", 0x10^)
echo     sys.exit^(1^)
echo.
echo try:
echo     from PIL import Image, ImageDraw
echo except ImportError:
echo     import ctypes
echo     ctypes.windll.user32.MessageBoxW^(0, "Pillow yuklu degil!\npip install pillow", "Hata", 0x10^)
echo     sys.exit^(1^)
echo.
echo try:
echo     import win32print
echo     import win32ui
echo     WINDOWS_PRINT = True
echo except ImportError:
echo     WINDOWS_PRINT = False
echo.
echo PORT = 5555
echo APP_NAME = "ShiftJet Print Server"
echo VERSION = "2.0.0"
echo.
echo selected_printer = None
echo tray_icon = None
echo server_thread = None
echo flask_app = None
echo.
echo PLATFORM_LABELS = {
echo     "adisyo": "Adisyo", "getir": "Getir", "trendyol": "Trendyol",
echo     "yemeksepeti": "Yemeksepeti", "migros": "Migros", "phone": "Telefon",
echo     "manual": "Manuel", "test": "Test",
echo }
echo.
echo PAYMENT_LABELS = {
echo     "cash": "NAKIT", "card": "KREDI KARTI", "online": "ONLINE",
echo     "meal_card": "YEMEK KARTI", "online_meal_card": "ONLINE YEMEK KARTI",
echo }
echo.
echo def get_printers^(^):
echo     if not WINDOWS_PRINT: return []
echo     printers = []
echo     for printer in win32print.EnumPrinters^(win32print.PRINTER_ENUM_LOCAL ^| win32print.PRINTER_ENUM_CONNECTIONS^):
echo         printers.append^(printer[2]^)
echo     return printers
echo.
echo def get_default_printer^(^):
echo     if not WINDOWS_PRINT: return None
echo     try: return win32print.GetDefaultPrinter^(^)
echo     except: return None
echo.
echo def format_currency^(amount^):
echo     try: return f"{float^(amount^):,.2f} TL".replace^(",", "X"^).replace^(".", ","^).replace^("X", "."^)
echo     except: return f"{amount} TL"
echo.
echo def format_date^(date_str^):
echo     if not date_str: return ""
echo     try:
echo         from datetime import datetime
echo         dt = datetime.fromisoformat^(date_str.replace^("Z", "+00:00"^)^)
echo         return dt.strftime^("%%d.%%m.%%Y %%H:%%M"^)
echo     except: return str^(date_str^)[:16]
echo.
echo def generate_receipt_text^(order, width=48^):
echo     lines = []
echo     order_num = order.get^("order_number", "---"^)
echo     platform = PLATFORM_LABELS.get^(order.get^("platform", ""^), order.get^("platform", ""^)^)
echo     lines.append^("=" * width^)
echo     lines.append^(f"#{order_num}".center^(width^)^)
echo     lines.append^(f"[ {platform.upper^(^)} ]".center^(width^)^)
echo     lines.append^(format_date^(order.get^("created_at", ""^)^).center^(width^)^)
echo     lines.append^("=" * width^)
echo     lines.append^("MUSTERI:"^)
echo     lines.append^(f"  {order.get^('customer_name', '-'^)}"^)
echo     if order.get^("customer_phone"^): lines.append^(f"  Tel: {order.get^('customer_phone'^)}"^)
echo     lines.append^("-" * width^)
echo     lines.append^("ADRES:"^)
echo     address = order.get^("delivery_address", "-"^)
echo     while len^(address^) ^> 0:
echo         lines.append^(f"  {address[:width-2]}"^)
echo         address = address[width-2:]
echo     lines.append^("-" * width^)
echo     lines.append^("URUNLER:"^)
echo     for item in order.get^("items", []^):
echo         qty = item.get^("quantity", 1^)
echo         name = item.get^("name", "Urun"^)
echo         price = item.get^("price", 0^) * qty
echo         item_text = f"{qty}x {name}"
echo         price_text = format_currency^(price^)
echo         if len^(item_text^) + len^(price_text^) + 2 ^> width:
echo             item_text = item_text[:width - len^(price_text^) - 3] + ".."
echo         spaces = width - len^(item_text^) - len^(price_text^)
echo         lines.append^(f"{item_text}{' ' * spaces}{price_text}"^)
echo         if item.get^("notes"^): lines.append^(f"   ^> {item.get^('notes'^)[:width-5]}"^)
echo     lines.append^("=" * width^)
echo     total = format_currency^(order.get^("total_amount", 0^)^)
echo     lines.append^(f"TOPLAM: {total}".rjust^(width^)^)
echo     payment = order.get^("payment_method_detail"^) or PAYMENT_LABELS.get^(order.get^("payment_method", ""^), order.get^("payment_method", ""^)^)
echo     lines.append^(f"[ {payment} ]".center^(width^)^)
echo     if order.get^("notes"^):
echo         lines.append^("-" * width^)
echo         lines.append^("SIPARIS NOTU:"^)
echo         note = order.get^("notes", ""^)
echo         while len^(note^) ^> 0:
echo             lines.append^(f"  {note[:width-2]}"^)
echo             note = note[width-2:]
echo     lines.append^("-" * width^)
echo     lines.append^("ShiftJet Siparis Sistemi".center^(width^)^)
echo     lines.append^("-" * width^)
echo     lines.append^(""^)
echo     lines.append^(""^)
echo     return "\n".join^(lines^)
echo.
echo def print_raw_to_printer^(printer_name, data^):
echo     if not WINDOWS_PRINT: return {"success": False, "error": "Windows print module not installed"}
echo     try:
echo         hprinter = win32print.OpenPrinter^(printer_name^)
echo         try:
echo             job = win32print.StartDocPrinter^(hprinter, 1, ^("ShiftJet Fis", None, "RAW"^)^)
echo             try:
echo                 win32print.StartPagePrinter^(hprinter^)
echo                 win32print.WritePrinter^(hprinter, data.encode^('cp857'^)^)
echo                 win32print.EndPagePrinter^(hprinter^)
echo             finally: win32print.EndDocPrinter^(hprinter^)
echo         finally: win32print.ClosePrinter^(hprinter^)
echo         return {"success": True, "message": f"Printed: {printer_name}"}
echo     except Exception as e: return {"success": False, "error": str^(e^)}
echo.
echo flask_app = Flask^(__name__^)
echo CORS^(flask_app^)
echo import logging
echo log = logging.getLogger^('werkzeug'^)
echo log.setLevel^(logging.ERROR^)
echo.
echo @flask_app.route^("/", methods=["GET"]^)
echo @flask_app.route^("/status", methods=["GET"]^)
echo def status^(^):
echo     return jsonify^({"status": "running", "service": APP_NAME, "version": VERSION, "port": PORT, "printers": get_printers^(^), "default_printer": get_default_printer^(^), "selected_printer": selected_printer}^)
echo.
echo @flask_app.route^("/printers", methods=["GET"]^)
echo def list_printers^(^):
echo     return jsonify^({"success": True, "printers": get_printers^(^), "default": get_default_printer^(^), "selected": selected_printer}^)
echo.
echo @flask_app.route^("/print", methods=["POST", "OPTIONS"]^)
echo def print_order^(^):
echo     if request.method == "OPTIONS": return "", 200
echo     global selected_printer
echo     data = request.get_json^(^) or {}
echo     order = data.get^("order", {}^)
echo     printer_name = data.get^("printer"^) or selected_printer or get_default_printer^(^)
echo     paper_size = data.get^("paper_size", "80mm"^)
echo     if not order: return jsonify^({"success": False, "error": "Order data required"}^), 400
echo     if not printer_name: return jsonify^({"success": False, "error": "No printer found"}^), 400
echo     width = 32 if paper_size == "58mm" else 48
echo     receipt_text = generate_receipt_text^(order, width^)
echo     ESC = "\x1b"
echo     GS = "\x1d"
echo     raw_data = ESC + "@" + ESC + "a\x01" + receipt_text + GS + "V\x00"
echo     result = print_raw_to_printer^(printer_name, raw_data^)
echo     if tray_icon and result.get^("success"^): show_notification^("Yazdirildi", f"Siparis #{order.get^('order_number', '?'^)}"^)
echo     return jsonify^(result^), 200 if result.get^("success"^) else 500
echo.
echo def run_flask^(^):
echo     flask_app.run^(host="0.0.0.0", port=PORT, debug=False, use_reloader=False^)
echo.
echo def create_icon_image^(^):
echo     size = 64
echo     img = Image.new^('RGBA', ^(size, size^), ^(0, 0, 0, 0^)^)
echo     draw = ImageDraw.Draw^(img^)
echo     draw.ellipse^([4, 4, 60, 60], fill=^(76, 175, 80, 255^)^)
echo     draw.rectangle^([14, 24, 50, 44], fill=^(255, 255, 255, 255^)^)
echo     draw.rectangle^([20, 16, 44, 28], fill=^(255, 255, 255, 255^)^)
echo     draw.rectangle^([20, 40, 44, 52], fill=^(255, 255, 255, 255^)^)
echo     draw.rectangle^([18, 30, 28, 36], fill=^(76, 175, 80, 255^)^)
echo     draw.ellipse^([42, 30, 48, 36], fill=^(76, 175, 80, 255^)^)
echo     return img
echo.
echo def show_notification^(title, message^):
echo     global tray_icon
echo     if tray_icon:
echo         try: tray_icon.notify^(message, title^)
echo         except: pass
echo.
echo def on_select_printer^(printer_name^):
echo     def handler^(icon, item^):
echo         global selected_printer
echo         selected_printer = printer_name
echo         show_notification^("Yazici Secildi", printer_name^)
echo     return handler
echo.
echo def on_test_print^(icon, item^):
echo     global selected_printer
echo     printer = selected_printer or get_default_printer^(^)
echo     if not printer:
echo         show_notification^("Hata", "Yazici bulunamadi!"^)
echo         return
echo     test_order = {"order_number": "TEST-001", "platform": "test", "created_at": "2024-01-01T12:00:00Z", "customer_name": "Test Musteri", "customer_phone": "0532 123 4567", "delivery_address": "Test Adres Mah. Test Sok. No:1", "items": [{"name": "Test Urun", "quantity": 2, "price": 50.0}], "total_amount": 100.0, "payment_method": "cash"}
echo     receipt = generate_receipt_text^(test_order, 48^)
echo     ESC = "\x1b"
echo     GS = "\x1d"
echo     raw_data = ESC + "@" + ESC + "a\x01" + receipt + GS + "V\x00"
echo     result = print_raw_to_printer^(printer, raw_data^)
echo     if result.get^("success"^): show_notification^("Test Basarili", f"Yazici: {printer}"^)
echo     else: show_notification^("Hata", result.get^("error", "Bilinmeyen hata"^)^)
echo.
echo def on_open_browser^(icon, item^): webbrowser.open^(f"http://localhost:{PORT}"^)
echo.
echo def on_quit^(icon, item^):
echo     icon.stop^(^)
echo     os._exit^(0^)
echo.
echo def create_menu^(^):
echo     printers = get_printers^(^)
echo     default = get_default_printer^(^)
echo     printer_items = []
echo     for p in printers:
echo         checked = ^(p == selected_printer^) or ^(selected_printer is None and p == default^)
echo         printer_items.append^(Item^(f"{'* ' if checked else ''}{p}", on_select_printer^(p^)^)^)
echo     if not printer_items: printer_items.append^(Item^("Yazici bulunamadi", None, enabled=False^)^)
echo     return Menu^(Item^(f"{APP_NAME} v{VERSION}", None, enabled=False^), Menu.SEPARATOR, Item^("Yazicilar", Menu^(*printer_items^)^), Menu.SEPARATOR, Item^("Test Yazdir", on_test_print^), Item^("Tarayicide Ac", on_open_browser^), Menu.SEPARATOR, Item^("Cikis", on_quit^)^)
echo.
echo def setup_tray^(^):
echo     global tray_icon, selected_printer
echo     selected_printer = get_default_printer^(^)
echo     icon_image = create_icon_image^(^)
echo     tray_icon = pystray.Icon^(APP_NAME, icon_image, f"{APP_NAME}\nPort: {PORT}", menu=create_menu^(^)^)
echo     return tray_icon
echo.
echo def check_port_available^(port^):
echo     sock = socket.socket^(socket.AF_INET, socket.SOCK_STREAM^)
echo     result = sock.connect_ex^(^('localhost', port^)^)
echo     sock.close^(^)
echo     return result != 0
echo.
echo def main^(^):
echo     global server_thread
echo     if not check_port_available^(PORT^):
echo         try:
echo             import ctypes
echo             ctypes.windll.user32.MessageBoxW^(0, f"Port {PORT} zaten kullanımda!\n\nBaska bir ShiftJet Print Server calisiyor olabilir.", "ShiftJet Print Server - Hata", 0x10^)
echo         except: pass
echo         sys.exit^(1^)
echo     server_thread = threading.Thread^(target=run_flask, daemon=True^)
echo     server_thread.start^(^)
echo     icon = setup_tray^(^)
echo     def after_setup^(icon^):
echo         icon.visible = True
echo         show_notification^("ShiftJet Print Server", f"Sunucu baslatildi - Port {PORT}"^)
echo     icon.run^(setup=after_setup^)
echo.
echo if __name__ == "__main__": main^(^)
) > "%TEMP_DIR%\shiftjet_server.py"

:: PyInstaller ile .exe oluştur
echo.
echo [4/4] EXE dosyası oluşturuluyor...
echo       (Bu 1-2 dakika sürebilir, lütfen bekleyin)
cd /d "%TEMP_DIR%"
pyinstaller --onefile --noconsole --name "ShiftJet Print Server" shiftjet_server.py --distpath "%USERPROFILE%\Desktop" >nul 2>&1
if %errorlevel% neq 0 (
    echo HATA: EXE oluşturulamadı!
    echo Detaylı hata için tekrar deneyin:
    pyinstaller --onefile --noconsole --name "ShiftJet Print Server" shiftjet_server.py --distpath "%USERPROFILE%\Desktop"
    pause
    exit /b 1
)

:: Temizlik
cd /d "%USERPROFILE%"
rd /s /q "%TEMP_DIR%" >nul 2>&1

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    KURULUM TAMAMLANDI!                       ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Masaüstünüzde "ShiftJet Print Server.exe" oluşturuldu.     ║
echo ║                                                              ║
echo ║  Kullanım:                                                   ║
echo ║  1. EXE dosyasını çift tıklayın                             ║
echo ║  2. Saat yanında yeşil ikon görünecek                       ║
echo ║  3. Sağ tık ile yazıcı seçin ve test edin                   ║
echo ║                                                              ║
echo ║  NOT: Windows başlangıcında otomatik çalıştırmak için       ║
echo ║  EXE'yi "Başlangıç" klasörüne kopyalayın.                   ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Programı şimdi başlatmak ister misiniz? (E/H)
set /p "LAUNCH=>"
if /i "%LAUNCH%"=="E" (
    start "" "%USERPROFILE%\Desktop\ShiftJet Print Server.exe"
)
echo.
pause
