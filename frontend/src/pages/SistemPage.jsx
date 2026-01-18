import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { SlidersHorizontal, Save, FileText, Cloud, Mail, HardDrive, Link2, Unlink, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SistemPage({ companyId }) {
  const [companyInfo, setCompanyInfo] = useState({
    name: "",
    logo_url: "",
    tckn_vkn: "",
    address: "",
    tax_office: "",
    email: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompanyInfo();
  }, [companyId]);

  const fetchCompanyInfo = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyInfo({
        name: res.data.name || "",
        logo_url: res.data.logo_url || "",
        tckn_vkn: res.data.tckn_vkn || "",
        address: res.data.address || "",
        tax_office: res.data.tax_office || "",
        email: res.data.email || ""
      });
    } catch (err) {
      toast.error("Şirket bilgileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}`, companyInfo);
      toast.success("Şirket bilgileri güncellendi");
    } catch (err) {
      toast.error("Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100">
            <SlidersHorizontal className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Sistem</h2>
            <p className="text-sm text-muted-foreground">Sistem ayarları ve yönetimi</p>
          </div>
        </div>
      </div>

      {/* Şirket Fatura Bilgileri */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border bg-slate-50 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Şirket Bilgileri</h3>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Bu bilgiler kuryelerin fatura talep mesajında otomatik olarak kullanılacaktır.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Şirket Adı</Label>
              <Input 
                value={companyInfo.name} 
                onChange={(e) => setCompanyInfo({...companyInfo, name: e.target.value})}
                className="mt-1 h-11 border-2"
                placeholder="Şirket adı"
              />
            </div>
            
            <div>
              <Label className="text-sm font-semibold">TCKN / VKN</Label>
              <Input 
                value={companyInfo.tckn_vkn} 
                onChange={(e) => setCompanyInfo({...companyInfo, tckn_vkn: e.target.value})}
                className="mt-1 h-11 border-2 font-mono"
                placeholder="TC Kimlik No veya Vergi Kimlik No"
              />
            </div>
            
            <div>
              <Label className="text-sm font-semibold">Vergi Dairesi</Label>
              <Input 
                value={companyInfo.tax_office} 
                onChange={(e) => setCompanyInfo({...companyInfo, tax_office: e.target.value})}
                className="mt-1 h-11 border-2"
                placeholder="Vergi dairesi adı"
              />
            </div>
            
            <div>
              <Label className="text-sm font-semibold">E-posta</Label>
              <Input 
                type="email"
                value={companyInfo.email} 
                onChange={(e) => setCompanyInfo({...companyInfo, email: e.target.value})}
                className="mt-1 h-11 border-2"
                placeholder="fatura@sirket.com"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-sm font-semibold">Adres</Label>
            <Textarea 
              value={companyInfo.address} 
              onChange={(e) => setCompanyInfo({...companyInfo, address: e.target.value})}
              className="mt-1 border-2 min-h-[80px]"
              placeholder="Mahalle, Sokak, No, İlçe / İl"
            />
          </div>
          
          <div>
            <Label className="text-sm font-semibold">Logo URL (İsteğe bağlı)</Label>
            <Input 
              value={companyInfo.logo_url} 
              onChange={(e) => setCompanyInfo({...companyInfo, logo_url: e.target.value})}
              className="mt-1 h-11 border-2"
              placeholder="https://example.com/logo.png"
            />
            {companyInfo.logo_url && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Önizleme:</span>
                <img 
                  src={companyInfo.logo_url} 
                  alt="Logo" 
                  className="w-10 h-10 rounded object-cover border"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
          
          <div className="pt-4 border-t border-border">
            <Button type="submit" disabled={saving} className="h-11 font-semibold">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
