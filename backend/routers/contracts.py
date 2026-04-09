"""
Sözleşme (Contract) Servisi
- Şirket bazlı sözleşme ayarları
- Sözleşme şablonu placeholder doldurma
- Kurye onaylama + imza + PDF oluşturma
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import base64
import io

from utils.database import db
from utils.helpers import get_turkey_now
from utils.jwt_utils import require_admin, require_auth
from services.r2_storage import upload_file_to_r2, download_file_from_r2

router = APIRouter(prefix="/api/contracts", tags=["Contracts"])

TURKEY_TZ = timezone(timedelta(hours=3))

# Sözleşme şablonu - sabit metin, placeholder'lar {} ile
CONTRACT_TEMPLATE = """KULLANICI SÖZLEŞMESİ

Madde 1. Taraflar:

{sirket_adresi} adresinde, {vergi_dairesi} Vergi Dairesi'ne {vergi_no} vergi numarası ile kayıtlı olarak faaliyet gösteren {sirket_adi} (kısaca "İŞ SAHİBİ" olarak anılacaktır.) {kullanici_adres} adresinde ikamet eden (kısaca "KULLANICI" olarak anılacaktır) ile işbu sözleşmenin taraflarını oluşturmaktadır.

1.a) Taraflara ilişkin bilgiler:

İş Sahibinin;
Adı: {sirket_adi}
Adresi: {sirket_adresi}
Telefon Numarası: {sirket_telefon}
E-Posta Adresi: {sirket_eposta}

Kullanıcının;
Adı Soyadı: {kullanici_adi}
Tc Kimlik Numarası: {kullanici_tc}
E-Posta Adresi: {kullanici_eposta}
İkametgah Adresi: {kullanici_adres}

Hizmet Verilecek Aracın;
Plakası: {arac_plaka}

Madde 2. Sözleşmenin Konusu:

İşbu sözleşme ile; KULLANICI ile İŞ SAHİBİ arasında, iş sahibinin anlaşmış olduğu işletmeler tarafından gelen ve kullanıcının belirlediği mobil uygulamanın sipariş havuzundaki siparişlerin teslimatını sağlarken; kullanıcı tarafından uyulması gereken şartları belirleyen bağlayıcı yasal bir anlaşma sağlanmıştır.

Madde 3. Kullanıcı – İş Sahibi İlişkisi:

İş Sahibi farklı işletmelerinden siparişlerini 3. parti uygulamalar ({uygulama_adi}) ile elektronik ortamda sipariş havuzu oluşturan bir iş sahibidir. Kullanıcı ile iş sahibi arasında işçi, işveren, acenta, temsilci, ortaklık söz konusu olmayıp, işbu sözleşme dışında sair hiçbir surette başkaca ticari bir ilişki yahut iş ilişkisi söz konusu değildir.

Kullanıcı, iş sahibinin ve uygulamanın Marka ve Adlarını, kullanılan sembolleri, logo ve işaretleri karışıklık ve haksız rekabet yaratacak derecede benzer marka ve adları hiçbir şekilde kullanmayacağını, tescil ettirmeyeceğini ve onlar üzerinde hak iddia etmeyeceğini kabul eder.

Madde 4. Kullanıcının Uymakla Yükümlü Olduğu Kurallar:

Kullanıcı her koşul ve şartta aşağıdaki kurallara üyeliği süresince istisnasız olarak uyacağını kabul ve taahhüt eder:

1. Kullanıcı; kendisine ait aracı kullanmak için yeterli seviyede ve geçerli bir sürücü belgesine sahip olduğunu ve her koşul ve şartta bu ehliyetin gerektirdiği şekilde aracını idame ettireceğini,

2. Kendisine ait olmayan araçları kullanmayacağını ya da başkasına ait bir aracı kullanması için gerekli her türlü yasal izinlere sahip olduğunu;

3. Sözleşme konusu hizmeti sağlamak için iş sahibi tarafından belirlenen ve yasal mevzuatın öngördüğü tüm lisanslara, izinlere, onaylara ve yetkilere sahip olduğunu;

4. Sözleşme konusu hizmeti yasal, güvenli ve müşteri memnuniyeti için gereken yetenek, özen ve dikkatle, profesyonel bir şekilde sağlamak için uygun ve mevcut düzeyde eğitim, uzmanlık ve deneyime sahip olduğunu;

5. Müşterilerle olan ilişkilerinde yüksek standartlarda profesyonellik, hizmet ve nezaket göstereceğini kabul eder. Kullanıcı, iş sahibi tarafından belirlenen ve yasaların öngördüğü bu gereklilikleri sağlayamazsa kullanıcının uygulamaya erişimi engellenebilir ya da sınırlanabilir.

6. Kullanıcı; aracını hukuka aykırı, kanun dışı amaçlar için kullanmayacağını kabul ve taahhüt eder. Kullanıcı hizmeti ve aracını; hukuka aykırı, kanun dışı amaçlar için kullanmayacağını, aracını kesinlikle hasta, uykusuz, alkollü ve herhangi bir keyif verici maddenin etkisindeyken kullanmayacağını, aksine tespit edilen her durumda sözleşmenin derhal feshedilerek, her türlü zararın ve sorumluluğun kendisine yükleneceğini, hakkında derhal yasal işlem yapılacağını bildiğini beyan, kabul ve taahhüt etmektedir.

7. Kullanıcı, tüm sair resmi veya özel kurumlar nezdinde her türlü resmi ve özel işlemlerin yerine getirilmesinden, prim, vergi, tazminat, maluliyet ödemesi, ücret, resim ve her türlü yükümlülüklerin yerine getirilmesinden münhasıran sorumlu olduğunu ve İş sahibi'nin hiçbir sorumluluğu bulunmadığını kabul, beyan ve taahhüt eder.

8. Kullanıcı, Karayolu Taşıma Kanunu, Karayolları Trafik Kanunu ve ilgili yürürlükteki tüm mevzuat kanun ve ikincil mevzuatlara uygun davranmayı kabul, beyan ve taahhüt eder.

9. Kullanıcı, işbu Sözleşme'nin eklerinin Sözleşme'nin ayrılmaz bir parçası olduğunu, İş sahibi'nin tek taraflı bildirimle Sözleşme'yi ve işbu ekleri değiştirme hakkı olduğunu kabul, beyan ve taahhüt eder.

10. Kullanıcı, işbu Sözleşme kapsamında sunmayı kabul ettiği hizmetleri eksiksiz sunmasını mümkün kılacak olan her türlü yazılım ve donanımı masrafı kendisine ait olmak üzere temin etmeyi kabul, beyan ve taahhüt eder.

11. Kullanıcı, İş sahibi tarafından satılan, temin edilen ve/veya kendisine ait her türlü cihaz, yazılım ve araç gerecin bakım, onarım, sigorta, vergi dahil her türlü maliyetten münhasıran sorumludur.

12. Kullanıcı, İş sahibi'nin uygun gördüğü aralıklarla denetleme yapabileceğini kabul eder.

13. Şirket, Kullanıcı'nın kullandığı {uygulama_adi} uygulamasını devre dışı bırakma ve/veya erişimini sınırlama hakkına haizdir.

14. Kullanıcı, iş sahibinin tüm ticari bilgilerini gizlilik içinde saklayacak ve hizmetlerin sağlanmasına yönelik amaçlar dışında kullanmayacaktır.

15. Kullanıcı, iş sahibinin kıyafet kurallarına uymakla yükümlüdür.

16. Kullanıcı, gün boyu müşteriler tarafından ödenen nakit ve kredi kartı tahsilatları eksiksiz gerçekleştirmek ve maksimum 1 iş günü içerisinde "{sirket_iban}" iban numaralı "{sirket_iban_sahibi}" hesabına yatırmak zorundadır.

17. İş sahibinin işin yapılmasıyla ilgili kuralları ek olarak imzalanacaktır.

Madde 5. Ödeme ve Sigorta Koşulları:

İş sahibi tarafından, kullanıcıya teslim ettiği her başarılı sipariş karşılığında {paket_basi_ucret} TL ücret ödenecektir. Bu ücret, iş yoğunluğu, mesafe, hava koşulları ve kampanya dönemlerine bağlı olarak -20 TL ile +20 TL arasında değişiklik gösterebilir. Kullanıcı kendisi de bir esnaf olduğu için bu tutarı iş sahibine fatura etmekle yükümlüdür.

Kullanıcı, işbu sözleşmenin elektronik ortamda imzalandığı tarihte yasal düzenlemeler kapsamında aracın Kara Yolları Zorunlu Trafik Sigortasına sahip olduğunu beyan ve kabul eder.

Madde 6. Sistemde Kalma ve Kayıt Koşulları

Kullanıcı; uygulama üzerindeki Çevrimiçi/Çevrimdışı sekmeleri ile dilediği zaman sisteme giriş yapabilir. Kullanıcıdan, sisteme kayıt esnasında herhangi bir ücret alınmayacaktır.

Madde 7. Fikri Mülkiyet Hakları

Sistem işleyişinin fikri ve mülkiyet hakları tamamen saklıdır.

Madde 8. Gizlilik

Taraflar, birbirleriyle çalışmaları süresince edindikleri ticari sır veya özel nitelikteki bilgileri üçüncü şahıslara açıklamamayı kabul ve taahhüt ederler.

Madde 9. Sözleşme Değişiklikleri

İş sahibi, sözleşmeyi uygulama üzerinden ilan ederek değiştirebilir.

Madde 10. Mücbir Sebepler

Hukuken mücbir sebep sayılan tüm durumlarda iş sahibi edimlerinden herhangi birini geç veya eksik ifa etme nedeniyle yükümlü değildir.

Madde 11. Tebligatlar

Tarafların yukarıda belirtilen adresleri tebligat adresi olarak kabul edilmiştir.

Madde 12. Değişiklik Bildirimi

İş sahibi {sirket_telefon} nolu telefonu kullanmaktadır. Kullanıcı {kullanici_telefon} nolu telefonu kullanmaktadır.

Madde 13. Sözleşmenin Feshi ve Sona Erme

İşbu Sözleşme, Taraflardan herhangi birinin feshine kadar yürürlükte kalacaktır. Kullanıcının ilişiğini kesmek istediğinde "{sirket_telefon} nolu cep telefonuna 15 gün önceden yazılı sms olarak" bildirmesi gerekmektedir. Aksinin yaşanması durumunda {fesih_tazminat} ödemeyi taahhüt eder.

Madde 14. Yürürlük ve Kabul

İşbu sözleşme; kullanıcı tarafından sanal ortamda onaylanmak suretiyle derhal yürürlüğe girecektir.

Madde 15. Uygulanacak Hukuk ve Yetki

İşbu Koşullar'ın uygulanmasında Türk Hukuku uygulanacak ve her türlü ihtilafın varlığında {yetkili_mahkeme} Mahkemeleri ve İcra Daireleri yetkilidir.

İş bu 15 maddelik sözleşme, {tarih} tarihinde elektronik ortamda hazırlanmış ve taraflarca kabul edilmiştir.

Tarih: {tarih}

İş Sahibi: {sirket_adi}
Kullanıcı: {kullanici_adi}

EK 1 - ZİMMET FORMU

İşbu zimmet formu, yukarıdaki sözleşmenin ayrılmaz bir parçasıdır. Kullanıcı, aşağıda listesi verilen veya sonradan eklenecek olan ekipmanları iş sahibinden teslim aldığını, ekipmanları özenle kullanacağını ve iş ilişkisi sona erdiğinde sağlam ve çalışır durumda iade edeceğini kabul ve taahhüt eder. Ekipmanların hasarlı, eksik veya iade edilmemesi durumunda kullanıcı, ekipmanın güncel değerini iş sahibine ödemeyi kabul eder.

ZİMMET_TABLOSU
"""


class ContractSettings(BaseModel):
    sirket_adi: str
    sirket_adresi: str
    vergi_dairesi: str
    vergi_no: str
    sirket_telefon: str
    sirket_eposta: str
    sirket_iban: str
    sirket_iban_sahibi: str
    paket_basi_ucret: str = ""
    fesih_tazminat: str = ""
    fesih_bildirim_suresi: str = "15"
    fesih_bildirim_telefon: str = ""
    uygulama_adi: str = ""
    yetkili_mahkeme: str = ""
    kurucu: str = ""
    muhasebe: str = ""


class ContractAcceptRequest(BaseModel):
    signature_base64: str  # 1. imza PNG base64
    signature2_base64: str = ""  # 2. imza PNG base64
    tc_kimlik: str


# ==================== ADMIN: Sözleşme Ayarları ====================

@router.get("/settings/{company_id}")
async def get_contract_settings(company_id: str, auth: dict = Depends(require_admin)):
    """Şirketin sözleşme ayarlarını getir"""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "contract_settings": 1, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return company.get("contract_settings") or {"configured": False}


@router.post("/settings/{company_id}")
async def save_contract_settings(company_id: str, data: ContractSettings, auth: dict = Depends(require_admin)):
    """Şirketin sözleşme ayarlarını kaydet"""
    settings = data.dict()
    settings["configured"] = True
    settings["updated_at"] = get_turkey_now()

    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"contract_settings": settings}}
    )
    return {"message": "Sözleşme ayarları kaydedildi"}


# ==================== KURYE: Sözleşme Görüntüleme ====================

@router.get("/preview/{courier_id}")
async def preview_contract(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin göreceği sözleşme metnini oluştur (placeholder'lar dolu)"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1, "name": 1, "email": 1, "address": 1, "phone": 1, "plate": 1, "tc_kimlik": 1, "tc_no": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    # Kuryenin bağlı olduğu (veya olacağı) şirketi bul
    relation = await db.company_couriers.find_one(
        {"courier_id": courier_id},
        {"_id": 0, "company_id": 1}
    )

    # Şirket yoksa, herhangi bir şirketin ayarlarını kullan (ilk kayıtlı)
    if relation:
        company = await db.companies.find_one({"id": relation["company_id"]}, {"_id": 0})
    else:
        company = await db.companies.find_one({"contract_settings.configured": True}, {"_id": 0})

    if not company or not company.get("contract_settings", {}).get("configured"):
        raise HTTPException(status_code=400, detail="Sözleşme ayarları henüz yapılandırılmamış")

    cs = company["contract_settings"]
    now = datetime.now(TURKEY_TZ)

    text = CONTRACT_TEMPLATE.format(
        sirket_adi=cs.get("sirket_adi", ""),
        sirket_adresi=cs.get("sirket_adresi", ""),
        vergi_dairesi=cs.get("vergi_dairesi", ""),
        vergi_no=cs.get("vergi_no", ""),
        sirket_telefon=cs.get("sirket_telefon", ""),
        sirket_eposta=cs.get("sirket_eposta", ""),
        sirket_iban=cs.get("sirket_iban", ""),
        sirket_iban_sahibi=cs.get("sirket_iban_sahibi", ""),
        paket_basi_ucret=cs.get("paket_basi_ucret", "___"),
        fesih_tazminat=cs.get("fesih_tazminat", "___"),
        uygulama_adi=cs.get("uygulama_adi", "___"),
        yetkili_mahkeme=cs.get("yetkili_mahkeme", "___"),
        kullanici_adi=courier.get("name", ""),
        kullanici_tc=courier.get("tc_kimlik") or courier.get("tc_no", "___"),
        kullanici_eposta=courier.get("email", ""),
        kullanici_adres=courier.get("address", ""),
        kullanici_telefon=courier.get("phone", ""),
        arac_plaka=courier.get("plate", ""),
        tarih=now.strftime("%d/%m/%Y"),
    )

    return {
        "text": text,
        "company_name": company.get("name", ""),
        "fesih": {
            "tazminat": cs.get("fesih_tazminat", ""),
            "bildirim_suresi": cs.get("fesih_bildirim_suresi", "15"),
            "bildirim_telefon": cs.get("fesih_bildirim_telefon") or cs.get("sirket_telefon", ""),
            "sirket_adi": cs.get("sirket_adi", ""),
            "yetkili_mahkeme": cs.get("yetkili_mahkeme", ""),
        }
    }


# ==================== KURYE: Sözleşme Onaylama ====================

@router.post("/accept/{courier_id}")
async def accept_contract(courier_id: str, data: ContractAcceptRequest, auth: dict = Depends(require_auth)):
    """Kurye sözleşmeyi imzalayarak onaylar"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    # TC doğrula (opsiyonel - kayıt sırasında alınmışsa kullan)
    tc = data.tc_kimlik.strip()
    if tc:
        if len(tc) != 11 or not tc.isdigit():
            raise HTTPException(status_code=400, detail="TC Kimlik numarası 11 haneli olmalıdır")
        # TC'yi kuryeye kaydet
        await db.couriers.update_one(
            {"id": courier_id},
            {"$set": {"tc_kimlik": tc}}
        )

    # İmzaları decode et
    try:
        sig_data = data.signature_base64
        if "base64," in sig_data:
            sig_data = sig_data.split("base64,")[1]
        signature_bytes = base64.b64decode(sig_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz 1. imza verisi")

    signature2_bytes = None
    if data.signature2_base64:
        try:
            sig2_data = data.signature2_base64
            if "base64," in sig2_data:
                sig2_data = sig2_data.split("base64,")[1]
            signature2_bytes = base64.b64decode(sig2_data)
        except Exception:
            raise HTTPException(status_code=400, detail="Geçersiz 2. imza verisi")

    # Sözleşme metnini oluştur
    preview_resp = await preview_contract(courier_id, auth)
    contract_text = preview_resp["text"]

    # PDF oluştur
    pdf_bytes = generate_contract_pdf(contract_text, signature_bytes, courier.get("name", ""), signature2_bytes)

    # R2'ye kaydet
    r2_key = f"EVRAKLAR/Sozlesmeler/{courier_id}_sozlesme_{datetime.now(TURKEY_TZ).strftime('%Y%m%d')}.pdf"
    upload_result = await upload_file_to_r2(pdf_bytes, r2_key, "application/pdf")

    if not upload_result["success"]:
        raise HTTPException(status_code=503, detail="PDF kaydedilemedi")

    # İmzaları R2'ye kaydet
    sig_r2_key = f"EVRAKLAR/Imzalar/{courier_id}_imza1.png"
    await upload_file_to_r2(signature_bytes, sig_r2_key, "image/png")
    if signature2_bytes:
        sig2_r2_key = f"EVRAKLAR/Imzalar/{courier_id}_imza2.png"
        await upload_file_to_r2(signature2_bytes, sig2_r2_key, "image/png")

    now = get_turkey_now()

    # Sözleşme kaydı oluştur
    contract_record = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "courier_name": courier.get("name", ""),
        "tc_kimlik": tc,
        "r2_key": r2_key,
        "signature_r2_key": sig_r2_key,
        "accepted_at": now,
        "company_name": preview_resp.get("company_name", ""),
    }
    await db.courier_contracts.insert_one(contract_record)

    # Kurye belge durumunu güncelle
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"contract_accepted": True, "contract_accepted_at": now}}
    )

    # Document kaydı da oluştur (mevcut evrak sistemiyle uyum)
    doc_record = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "document_type": "company_contract",
        "document_label": "Kullanıcı Sözleşmesi (E-İmzalı)",
        "file_name": f"{courier.get('name', 'Kurye')}_Sozlesme.pdf",
        "stored_file_name": r2_key.split("/")[-1],
        "r2_key": r2_key,
        "storage_type": "r2",
        "file_path": None,
        "file_extension": ".pdf",
        "company_name": preview_resp.get("company_name", ""),
        "uploaded_at": now,
        "created_at": now,
    }
    await db.courier_documents.insert_one(doc_record)

    return {"message": "Sözleşme onaylandı ve kaydedildi", "pdf_r2_key": r2_key}



@router.post("/fesih-accept/{courier_id}")
async def accept_fesih(courier_id: str, auth: dict = Depends(require_auth)):
    """Kurye fesih şartlarını ayrıca kabul eder"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1, "contract_accepted": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    if not courier.get("contract_accepted"):
        raise HTTPException(status_code=400, detail="Önce sözleşmeyi kabul etmelisiniz")

    now = get_turkey_now()
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "fesih_accepted": True,
            "fesih_accepted_at": now
        }}
    )

    return {"message": "Fesih şartları kabul edildi"}


@router.get("/status/{courier_id}")
async def get_contract_status(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin sözleşme durumunu kontrol et"""
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "id": 1, "contract_accepted": 1, "contract_accepted_at": 1, "fesih_accepted": 1, "fesih_accepted_at": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    contract = await db.courier_contracts.find_one(
        {"courier_id": courier_id},
        {"_id": 0, "accepted_at": 1, "company_name": 1, "r2_key": 1}
    )

    return {
        "accepted": courier.get("contract_accepted", False),
        "accepted_at": courier.get("contract_accepted_at"),
        "fesih_accepted": courier.get("fesih_accepted", False),
        "fesih_accepted_at": courier.get("fesih_accepted_at"),
        "contract": contract
    }


@router.get("/pdf/{courier_id}")
async def get_contract_pdf(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin imzalı sözleşme PDF'ini indir"""
    from fastapi.responses import Response

    contract = await db.courier_contracts.find_one(
        {"courier_id": courier_id},
        {"_id": 0, "r2_key": 1, "courier_name": 1}
    )
    if not contract or not contract.get("r2_key"):
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")

    content = await download_file_from_r2(contract["r2_key"])
    if not content:
        raise HTTPException(status_code=404, detail="PDF dosyası bulunamadı")

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"}
    )


# ==================== PDF Oluşturma ====================

def generate_contract_pdf(contract_text: str, signature_bytes: bytes, courier_name: str, signature2_bytes: bytes = None) -> bytes:
    """Sözleşme metninden + 2 imzadan PDF oluştur - Türkçe karakter destekli, her sayfada çift imza"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.utils import ImageReader
    from PIL import Image as PILImage

    # Türkçe karakter destekli font kaydet
    vera_path = "/root/.venv/lib/python3.11/site-packages/reportlab/fonts/Vera.ttf"
    vera_bold_path = "/root/.venv/lib/python3.11/site-packages/reportlab/fonts/VeraBd.ttf"
    if "Vera" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Vera", vera_path))
    if "VeraBd" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("VeraBd", vera_bold_path))

    # İmza resimlerini hazırla
    def load_sig(sig_bytes):
        try:
            buf = io.BytesIO(sig_bytes)
            img = PILImage.open(buf)
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            return img
        except Exception:
            return None

    sig_image1 = load_sig(signature_bytes) if signature_bytes else None
    sig_image2 = load_sig(signature2_bytes) if signature2_bytes else None

    page_w, page_h = A4

    def draw_sig_in_box(canvas, sig_img, box_x, box_y, box_w, box_h):
        """Bir imza kutusunu çiz"""
        # Kutu çizgisi
        canvas.setStrokeColorRGB(0.4, 0.4, 0.4)
        canvas.setLineWidth(0.5)
        canvas.rect(box_x, box_y, box_w, box_h)

        # İsim Soyisim
        canvas.setFont("VeraBd", 6.5)
        canvas.drawString(box_x + 3, box_y + box_h - 11, courier_name)

        # İmza resmi
        if sig_img:
            try:
                sig_io = io.BytesIO()
                sig_img.save(sig_io, format="PNG")
                sig_io.seek(0)
                img_reader = ImageReader(sig_io)
                img_w = box_w - 0.6 * cm
                img_h = box_h - 1 * cm
                img_x = box_x + (box_w - img_w) / 2
                img_y = box_y + 3
                canvas.drawImage(img_reader, img_x, img_y, img_w, img_h, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass

    def draw_signature_boxes(canvas, doc_obj):
        """Her sayfada sağ altta yan yana iki imza kutusu çiz"""
        canvas.saveState()

        box_w = 3.8 * cm
        box_h = 2.2 * cm
        gap = 0.4 * cm
        total_w = box_w * 2 + gap
        start_x = page_w - 2 * cm - total_w
        box_y = 0.8 * cm

        draw_sig_in_box(canvas, sig_image1, start_x, box_y, box_w, box_h)
        draw_sig_in_box(canvas, sig_image2, start_x + box_w + gap, box_y, box_w, box_h)

        canvas.restoreState()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            topMargin=2*cm, bottomMargin=3.8*cm,
                            leftMargin=2.5*cm, rightMargin=2.5*cm)

    title_style = ParagraphStyle(
        'ContractTitle', fontName='VeraBd',
        fontSize=13, alignment=TA_CENTER, spaceAfter=18, leading=16
    )
    body_style = ParagraphStyle(
        'ContractBody', fontName='Vera',
        fontSize=8.5, leading=12, alignment=TA_JUSTIFY, spaceAfter=3
    )
    bold_style = ParagraphStyle(
        'ContractBold', fontName='VeraBd',
        fontSize=9.5, leading=13, spaceAfter=6
    )

    elements = []

    lines = contract_text.strip().split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            elements.append(Spacer(1, 5))
            continue

        # Zimmet tablosu placeholder'ı
        if line == 'ZİMMET_TABLOSU':
            from reportlab.platypus import Table, TableStyle
            from reportlab.lib import colors

            table_data = [
                ['No', 'Ekipman Adı', 'Değeri (TL)', 'Açıklama'],
                ['1', '', '', ''],
                ['2', '', '', ''],
                ['3', '', '', ''],
                ['4', '', '', ''],
                ['5', '', '', ''],
            ]
            col_widths = [1*cm, 5*cm, 3*cm, 6*cm]
            table = Table(table_data, colWidths=col_widths, rowHeights=[0.7*cm]*6)
            table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'VeraBd'),
                ('FONTNAME', (0, 1), (-1, -1), 'Vera'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                ('ALIGN', (2, 0), (2, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 10))

            teslim_style = ParagraphStyle(
                'TeslimNote', fontName='Vera',
                fontSize=7.5, leading=10, alignment=TA_JUSTIFY
            )
            elements.append(Paragraph(
                "Teslim Alan: __________________ &nbsp;&nbsp;&nbsp; Teslim Eden: __________________ &nbsp;&nbsp;&nbsp; Tarih: __/__/____",
                teslim_style
            ))
            continue

        line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

        if 'KULLANICI' in line and 'SÖZLEŞME' in line:
            elements.append(Paragraph(line, title_style))
        elif line.startswith('EK 1') and 'ZİMMET' in line:
            elements.append(Spacer(1, 15))
            elements.append(Paragraph(line, title_style))
        elif line.startswith('Madde') or line.startswith('Ek') or line.startswith('Tarih:') or line.startswith('İş Sahibi:') or line.startswith('Kullanıcı:'):
            elements.append(Paragraph(line, bold_style))
        else:
            elements.append(Paragraph(line, body_style))

    doc.build(elements, onFirstPage=draw_signature_boxes, onLaterPages=draw_signature_boxes)
    return buffer.getvalue()


@router.post("/reset-contract/{courier_id}")
async def reset_contract(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin sözleşme sürecini sıfırla (admin)"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"contract_accepted": False, "fesih_accepted": False},
         "$unset": {"contract_accepted_at": "", "fesih_accepted_at": ""}}
    )
    await db.courier_contracts.delete_many({"courier_id": courier_id})
    # Eski sözleşme belgelerini de sil
    await db.courier_documents.delete_many({"courier_id": courier_id, "document_type": "company_contract"})

    return {"message": "Sözleşme süreci sıfırlandı"}


@router.post("/reset-fesih/{courier_id}")
async def reset_fesih(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin fesih onayını sıfırla (admin)"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"fesih_accepted": False},
         "$unset": {"fesih_accepted_at": ""}}
    )

    return {"message": "Fesih onayı sıfırlandı"}


@router.post("/reset-documents/{courier_id}")
async def reset_documents(courier_id: str, auth: dict = Depends(require_auth)):
    """Kuryenin yüklediği evrakları sıfırla (sözleşme hariç)"""
    from services.r2_storage import delete_file_from_r2

    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "id": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    # Sözleşme hariç tüm evrakları sil
    docs = await db.courier_documents.find(
        {"courier_id": courier_id, "document_type": {"$ne": "company_contract"}},
        {"_id": 0, "id": 1, "r2_key": 1, "storage_type": 1}
    ).to_list(100)

    for doc in docs:
        if doc.get("storage_type") == "r2" and doc.get("r2_key"):
            await delete_file_from_r2(doc["r2_key"])

    await db.courier_documents.delete_many(
        {"courier_id": courier_id, "document_type": {"$ne": "company_contract"}}
    )

    return {"message": "Evraklar sıfırlandı", "deleted_count": len(docs)}
