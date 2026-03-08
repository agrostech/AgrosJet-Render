import { FileText, Mail } from "lucide-react";

export default function CourierKVKKPage({ companyName = "AgrosJet" }) {
  return (
    <div className="space-y-4" data-testid="courier-kvkk-page">
      {/* Header Card */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">KVKK ve Gizlilik Politikası</h2>
              <p className="text-sm text-muted-foreground">Aydınlatma Metni</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 text-sm leading-relaxed">
          {/* Giriş */}
          <p>
            İşbu Aydınlatma Metni, veri sorumlusu sıfatıyla hareket eden <strong>{companyName}</strong> ("Şirket") tarafından, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK")'nun 10. maddesi uyarınca kişisel verilerinizin işlenmesine ilişkin olarak sizleri bilgilendirmek amacıyla hazırlanmıştır.
          </p>
          <p>{companyName}'in merkezi Isparta / Türkiye'de bulunmaktadır.</p>
          <p>
            {companyName} tarafından geliştirilen mobil uygulamalar ve operasyonel sistemler aracılığıyla elde edilen kişisel verileriniz, KVKK ve ilgili mevzuata uygun olarak işlenmektedir.
          </p>

          {/* İşlenen Verileriniz */}
          <div>
            <h3 className="font-bold text-base mb-3">İşlenen Verileriniz</h3>
            <p className="mb-3">Talep edildiği ölçüde aşağıdaki kişisel verileriniz işlenebilecektir:</p>
            
            {/* Kimlik Bilgileri */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Kimlik Bilgileri</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Ad, soyad</li>
                <li>T.C. Kimlik Numarası (TCKN) veya Vergi Kimlik Numarası (VKN)</li>
                <li>Kimlik belgesi bilgileri</li>
                <li>Ehliyet bilgileri</li>
                <li>Fotoğraf</li>
              </ul>
            </div>

            {/* Mesleki ve Araç Bilgileri */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Mesleki ve Araç Bilgileri</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Vergi levhası</li>
                <li>Aracınıza veya motorunuza ait ruhsat bilgileri</li>
              </ul>
            </div>

            {/* İletişim Bilgileri */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">İletişim Bilgileri</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Telefon numarası</li>
                <li>Acil durumlar için alternatif telefon numarası</li>
                <li>E-posta adresi</li>
                <li>Ev adresi</li>
              </ul>
            </div>

            {/* Finansal Bilgiler */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Finansal Bilgiler</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Banka hesap bilgileri</li>
                <li>IBAN numarası</li>
              </ul>
            </div>

            {/* Operasyonel Veriler */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Operasyonel Veriler</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Konum bilgileri*</li>
                <li>Hareket ve hız verileri**</li>
                <li>Mobil cihazın batarya/şarj durumu***</li>
              </ul>
            </div>

            {/* Teknik Veriler */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Teknik Veriler</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Mobil cihaz bilgileri (cihaz modeli, işletim sistemi, uygulama sürümü vb.)</li>
                <li>Uygulama kullanım verileri</li>
                <li>Bildirim izinleri ve bildirim tercihleri****</li>
              </ul>
            </div>

            {/* Güvenlik Verileri */}
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Güvenlik Verileri</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Adli sicil kaydı bilgisi</li>
                <li>Özçekim (selfie) fotoğrafı*****</li>
              </ul>
            </div>
          </div>

          {/* Kişisel Verilerin İşlenme Amaçları */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Verilerin İşlenme Amaçları</h3>
            <p className="mb-2">Toplanan kişisel verileriniz aşağıdaki amaçlarla işlenebilecektir:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Kurye kayıt ve doğrulama süreçlerinin yürütülmesi</li>
              <li>Sipariş ve teslimat operasyonlarının yönetilmesi</li>
              <li>Siparişlerin doğru kurye ile eşleştirilmesi</li>
              <li>Konum tabanlı teslimat hizmetlerinin sağlanması</li>
              <li>Kurye performans analizlerinin yapılması</li>
              <li>Operasyonel planlama ve sistem yönetimi</li>
              <li>Hizmet kalitesinin artırılması</li>
              <li>Güvenlik ve dolandırıcılık önleme süreçlerinin yürütülmesi</li>
              <li>Olası kazaların veya olağandışı durumların tespit edilmesi</li>
              <li>Sistem duyurularının ve sipariş bildirimlerinin iletilmesi</li>
              <li>Finansal süreçlerin yürütülmesi ve ödemelerin gerçekleştirilmesi</li>
              <li>Yasal yükümlülüklerin yerine getirilmesi</li>
            </ul>
          </div>

          {/* Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi</h3>
            <p className="mb-2">Kişisel verileriniz;</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
              <li>Mobil uygulamalar</li>
              <li>Web sitesi</li>
              <li>Kurye kayıt süreçleri</li>
              <li>Elektronik formlar</li>
              <li>E-posta iletişimi</li>
              <li>Operasyonel yazılımlar</li>
            </ul>
            <p className="mb-2">aracılığıyla otomatik veya kısmen otomatik yöntemlerle toplanabilmektedir.</p>
            <p className="mb-2">Verileriniz aşağıdaki hukuki sebepler doğrultusunda işlenmektedir:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması</li>
              <li>Şirketin hukuki yükümlülüklerini yerine getirebilmesi</li>
              <li>Bir hakkın tesisi, kullanılması veya korunması</li>
              <li>Veri sorumlusunun meşru menfaatleri</li>
            </ul>
          </div>

          {/* Kişisel Verilerinizin Aktarılabileceği Taraflar */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Verilerinizin Aktarılabileceği Taraflar</h3>
            <p className="mb-2">Kişisel verileriniz;</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Yetkili kamu kurum ve kuruluşları</li>
              <li>Hukuki danışmanlar</li>
              <li>Finans kuruluşları</li>
              <li>Teknoloji ve altyapı hizmet sağlayıcıları</li>
              <li>İş ortakları</li>
            </ul>
            <p className="mt-2">ile KVKK ve ilgili mevzuata uygun şekilde paylaşılabilecektir.</p>
          </div>

          {/* Veri Saklama Süresi */}
          <div>
            <h3 className="font-bold text-base mb-2">Veri Saklama Süresi</h3>
            <p className="mb-2">
              Kişisel verileriniz, işleme amacının gerektirdiği süre boyunca ve ilgili yasal mevzuatta belirtilen süreler boyunca saklanacaktır.
            </p>
            <p className="text-muted-foreground">
              Özçekim (selfie) fotoğrafı kimlik doğrulama amacıyla işlenmekte olup 90 gün boyunca saklanır ve bu sürenin sonunda silinir, ancak yürürlükteki mevzuatın daha uzun bir saklama süresi gerektirmesi halinde ilgili süre uygulanabilir.
            </p>
          </div>

          {/* Kişisel Veri Sahibi Olarak Haklarınız */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Veri Sahibi Olarak Haklarınız</h3>
            <p className="mb-2">KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
              <li>İşlenmişse buna ilişkin bilgi talep etme</li>
              <li>İşlenme amacını öğrenme</li>
              <li>Verilerin aktarıldığı üçüncü kişileri öğrenme</li>
              <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme</li>
              <li>Kanuna uygun olarak silinmesini veya yok edilmesini isteme</li>
              <li>İşlemenin yalnızca otomatik sistemler ile analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme</li>
              <li>Kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
            </ul>
          </div>

          {/* Başvuru Yöntemi */}
          <div>
            <h3 className="font-bold text-base mb-2">Başvuru Yöntemi</h3>
            <p className="mb-3">KVKK kapsamındaki haklarınıza ilişkin taleplerinizi aşağıdaki iletişim adresi üzerinden iletebilirsiniz:</p>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Mail className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">E-posta:</span>
              <a href="mailto:info@agrosjet.com.tr" className="text-primary font-medium hover:underline">
                info@agrosjet.com.tr
              </a>
            </div>
          </div>

          {/* Güncelleme Hakkı */}
          <div className="pt-4 border-t border-border">
            <h3 className="font-bold text-base mb-2">Güncelleme Hakkı</h3>
            <p className="text-muted-foreground">
              {companyName}, iş gereksinimleri ve yasal düzenlemeler doğrultusunda işbu Aydınlatma Metni üzerinde değişiklik yapma hakkını saklı tutar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
