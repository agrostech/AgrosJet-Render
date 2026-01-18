import { useState, useEffect } from "react";
import { GraduationCap, BookOpen, Video, FileText, Award } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

export default function CourierAkademiPage({ companyName }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <PageLoading />;

  return (
    <div data-testid="courier-akademi-page" className="space-y-4">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100">
            <GraduationCap className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg md:text-xl">{companyName || 'Şirket'} Akademi</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Eğitim ve gelişim platformu</p>
          </div>
        </div>
      </div>

      {/* Coming Soon Content */}
      <div className="border-2 border-border bg-white p-6 md:p-12">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4 md:mb-6">
            <GraduationCap className="w-8 h-8 md:w-10 md:h-10 text-purple-600" />
          </div>
          <h3 className="font-heading font-bold text-xl md:text-2xl mb-2 md:mb-3">Çok Yakında</h3>
          <p className="text-sm md:text-base text-muted-foreground mb-6 md:mb-8">
            Akademi modülü üzerinde çalışıyoruz. Kısa süre içinde size özel eğitim içerikleri, 
            sertifikalar ve gelişim programları sunacağız.
          </p>
          
          {/* Feature Preview */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 text-left">
            <div className="p-3 md:p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Video className="w-5 h-5 md:w-6 md:h-6 text-purple-600 mb-2" />
              <p className="font-semibold text-xs md:text-sm">Video Eğitimler</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">İnteraktif içerikler</p>
            </div>
            <div className="p-3 md:p-4 bg-slate-50 rounded-lg border border-slate-200">
              <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-purple-600 mb-2" />
              <p className="font-semibold text-xs md:text-sm">Dökümanlar</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Eğitim materyalleri</p>
            </div>
            <div className="p-3 md:p-4 bg-slate-50 rounded-lg border border-slate-200">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-purple-600 mb-2" />
              <p className="font-semibold text-xs md:text-sm">Sınavlar</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Bilgi değerlendirme</p>
            </div>
            <div className="p-3 md:p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Award className="w-5 h-5 md:w-6 md:h-6 text-purple-600 mb-2" />
              <p className="font-semibold text-xs md:text-sm">Sertifikalar</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Başarı belgeleri</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
