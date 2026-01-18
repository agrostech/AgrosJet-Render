import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Send } from "lucide-react";

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

// Haftanın pazartesi tarihini bul
const getMondayDate = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toLocaleDateString('tr-TR');
};

export default function InvoiceMessageModal({ 
  open, 
  onOpenChange, 
  selectedAmount, 
  companyInfo 
}) {
  const generateInvoiceMessage = (amount) => {
    if (!companyInfo) return "";
    
    const mondayDate = getMondayDate();
    
    return `Merhaba, hizmet vermiş olduğum şirket için fatura kesmem gerekiyor. Yardımcı olur musunuz?

FATURA BİLGİLERİ

Kesilecek Firma:
${companyInfo.name}
${companyInfo.tckn_vkn ? `TCKN/VKN: ${companyInfo.tckn_vkn}` : ''}
${companyInfo.address ? `Adres: ${companyInfo.address}` : ''}
${companyInfo.tax_office ? `Vergi Dairesi: ${companyInfo.tax_office}` : ''}
${companyInfo.email ? `E-posta: ${companyInfo.email}` : ''}

Fatura Tarihi: ${mondayDate} (Hafta Pazartesi)
Hizmet: Kurye Hizmeti

FATURA TUTARI: ${formatMoney(amount)} (KDV DAHİL)

Teşekkürler.`.trim().replace(/\n{3,}/g, '\n\n');
  };

  const message = generateInvoiceMessage(selectedAmount);

  const handleWhatsAppSend = () => {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Send className="w-5 h-5" />
            Fatura Talep Et
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4">
            <pre className="whitespace-pre-wrap text-xs sm:text-sm font-sans text-slate-700 leading-relaxed">
              {message}
            </pre>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleWhatsAppSend}
              className="flex-1 h-10"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp ile Gönder
            </Button>
          </div>
          
          {(!companyInfo?.tckn_vkn || !companyInfo?.address) && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              Şirket bilgileri eksik. Yöneticinizle iletişime geçin.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
