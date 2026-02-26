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
            İşbu Aydınlatma Metni, veri sorumlusu sıfatıyla hareket eden <strong>"{companyName}"</strong> ("Şirket") tarafından, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK")'nun 10. maddesinden doğan aydınlatma yükümlülüğünün yerine getirilmesi amacıyla kaleme alınmıştır.
          </p>
          <p>Şirket merkezi Isparta'da bulunmaktadır.</p>

          {/* İşlenen Verileriniz */}
          <div>
            <h3 className="font-bold text-base mb-2">İşlenen Verileriniz</h3>
            <p className="mb-2">Talep edildiği ölçüde aşağıdaki kişisel verileriniz işlenebilecektir:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>TCKN ve/veya VKN</li>
              <li>Vergi levhası</li>
              <li>Ad, soyad</li>
              <li>Ehliyet ve kimlik belgesi</li>
              <li>Fotoğraf</li>
              <li>Aracınıza/motorunuza ait ruhsat</li>
              <li>Telefon numarası</li>
              <li>Acil durumlar için alternatif telefon numarası</li>
              <li>E-posta adresi</li>
              <li>Ev adresi</li>
              <li>Konum bilgileri</li>
              <li>Adli sicil kaydı bilgisi</li>
              <li>Banka hesap bilgisi veya IBAN numarası</li>
              <li>"Özçekim" fotoğrafı*</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground italic">
              *Bu fotoğraf, profil fotoğrafınızla otomatik olarak karşılaştırılmak üzere işlenecektir. Görsel 90 gün boyunca saklanacak olup, yerel yasal gereklilikler farklı bir saklama süresi gerektirmedikçe bu sürenin sonunda silinecektir. Kimlik doğrulama sürecinde gönderilen fotoğrafın gerçek bir kişi tarafından çekildiğinin tespiti amacıyla Apple'ın ARKit ve TrueDepth teknolojileri veya Google MLKit teknolojileri kullanılabilecektir.
            </p>
          </div>

          {/* Kişisel Verilerin İşlenme Amacı */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Verilerin İşlenme Amacı</h3>
            <p className="mb-2">Yukarıda belirtilen kişisel verileriniz aşağıdaki amaçlarla, sınırlı ve ölçülü olarak işlenecektir:</p>
            <ol className="list-[lower-roman] list-inside space-y-2 text-muted-foreground">
              <li>Sunulan hizmete ilişkin sözleşmenin kurulması ve/veya ifası kapsamında süreçlerin yürütülmesi</li>
              <li>Ürün ve hizmetlerin kullanıcı deneyiminin artırılması; kullanıcı alışkanlıklarına göre özelleştirme yapılması; kampanya, indirim, dijital pazarlama, hedefleme, yeniden pazarlama (remarketing), reklam, pazar araştırması ve memnuniyet anketi faaliyetlerinin yürütülmesi</li>
              <li>Satış sonrası destek hizmetlerinin yürütülmesi; kullanıcı talep ve şikayetlerinin takibi</li>
              <li>Şirketin hukuki, teknik ve ticari güvenliğinin temini; mevzuata uyum; denetim ve güvenlik süreçlerinin yürütülmesi</li>
              <li>Ticari faaliyetlerin yürütülmesi kapsamında bilgi teknolojileri altyapısının yönetimi, bilgi güvenliği süreçleri, dolandırıcılığın önlenmesi, finans/muhasebe ve hukuk işlerinin yürütülmesi, lojistik faaliyetlerin planlanması</li>
              <li>Profilin gerçek sahipliğinin doğrulanması ve olası dolandırıcılık faaliyetlerinin önlenmesi amacıyla kimlik doğrulama önlemlerinin uygulanması</li>
            </ol>
          </div>

          {/* Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi</h3>
            <p className="mb-2">
              Kişisel verileriniz; AgrosJet tarafından e-posta, internet sitesi, mobil uygulama, çağrı merkezi, sözleşmeler ve fiziki evrak (posta/kargo) kanalları aracılığıyla toplanmaktadır.
            </p>
            <p className="mb-2">Toplanan verileriniz aşağıdaki hukuki sebeplere dayanılarak işlenebilecektir:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Kanunlarda açıkça öngörülmesi</li>
              <li>Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması</li>
              <li>Hukuki yükümlülüklerin yerine getirilmesinin zorunlu olması</li>
              <li>Tarafınızca alenileştirilmiş olması</li>
              <li>Bir hakkın tesisi, kullanılması veya korunması için zorunlu olması</li>
              <li>Şirket'in meşru menfaatleri için zorunlu olması (temel hak ve özgürlüklerinize zarar vermemek kaydıyla)</li>
            </ul>
          </div>

          {/* Kişisel Verilerinizin Aktarılabileceği Taraflar */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Verilerinizin Aktarılabileceği Taraflar</h3>
            <p className="mb-2">Toplanan kişisel verileriniz, KVKK'nın 8. ve 9. maddelerine uygun olarak;</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Grup şirketleri</li>
              <li>İş ortakları ve hizmet sağlayıcılar</li>
              <li>Hissedarlar</li>
              <li>Yetkili kamu kurum ve kuruluşları</li>
              <li>Yetkili özel kişiler</li>
            </ul>
            <p className="mt-2">ile paylaşılabilecektir.</p>
          </div>

          {/* Kişisel Veri Sahibi Olarak Haklarınız */}
          <div>
            <h3 className="font-bold text-base mb-2">Kişisel Veri Sahibi Olarak Haklarınız</h3>
            <p className="mb-2">KVKK'nın 11. maddesi kapsamında aşağıdaki haklara sahipsiniz:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Verilerinizin işlenip işlenmediğini öğrenme</li>
              <li>İşlenmişse buna ilişkin bilgi talep etme</li>
              <li>İşlenme amacını öğrenme</li>
              <li>Aktarıldığı üçüncü kişileri bilme</li>
              <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme</li>
              <li>Silinmesini veya yok edilmesini isteme</li>
              <li>Otomatik sistemler sonucu aleyhinize bir sonuç doğmasına itiraz etme</li>
              <li>Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme</li>
            </ul>
          </div>

          {/* Başvuru Yöntemi */}
          <div>
            <h3 className="font-bold text-base mb-2">Başvuru Yöntemi</h3>
            <p className="mb-3">KVKK kapsamındaki taleplerinizi:</p>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg mb-3">
              <Mail className="w-4 h-4 text-primary" />
              <a href="mailto:info@agrosjet.com.tr" className="text-primary font-medium hover:underline">
                info@agrosjet.com.tr
              </a>
              <span className="text-muted-foreground">adresine e-posta göndererek</span>
            </div>
            <p className="text-muted-foreground">
              veya Şirket sistemleri üzerinden tarafınıza sunulan başvuru kanalları aracılığıyla iletebilirsiniz.
            </p>
            <p className="mt-3">
              Şirket, talebin niteliğine göre en kısa sürede ve en geç otuz gün içinde ücretsiz olarak sonuçlandıracaktır. İşlemin ayrıca maliyet gerektirmesi hâlinde, Kişisel Verileri Koruma Kurulu tarafından belirlenen tarifeye göre ücret talep edilebilir.
            </p>
          </div>

          {/* Güncelleme Hakkı */}
          <div className="pt-4 border-t border-border">
            <h3 className="font-bold text-base mb-2">Güncelleme Hakkı</h3>
            <p className="text-muted-foreground">
              AgrosJet, iş gereksinimleri ve yasal düzenlemeler doğrultusunda işbu Aydınlatma Metni üzerinde değişiklik yapma hakkını saklı tutar. Güncel metin yayımlandığı tarihte yürürlüğe girer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
