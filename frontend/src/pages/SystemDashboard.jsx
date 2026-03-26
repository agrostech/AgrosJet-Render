import { useState, useEffect, useRef } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Menu, X, LogOut, Building2, Trash2, Plus, Edit, Users, Settings, Cloud, CheckCircle, XCircle, Loader2, Eye, EyeOff, UserCog, MapPin, Coins, Mail, Upload, MinusCircle, PlusCircle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Türkiye 81 il ve koordinatları (alfabetik sıra)
const TURKEY_CITIES = [
  { name: "Adana", lat: 37.0, lng: 35.3213 },
  { name: "Adıyaman", lat: 37.7648, lng: 38.2786 },
  { name: "Afyonkarahisar", lat: 38.7507, lng: 30.5567 },
  { name: "Ağrı", lat: 39.7191, lng: 43.0503 },
  { name: "Aksaray", lat: 38.3687, lng: 34.0370 },
  { name: "Amasya", lat: 40.6499, lng: 35.8353 },
  { name: "Ankara", lat: 39.9334, lng: 32.8597 },
  { name: "Antalya", lat: 36.8969, lng: 30.7133 },
  { name: "Ardahan", lat: 41.1105, lng: 42.7022 },
  { name: "Artvin", lat: 41.1828, lng: 41.8183 },
  { name: "Aydın", lat: 37.8560, lng: 27.8416 },
  { name: "Balıkesir", lat: 39.6484, lng: 27.8826 },
  { name: "Bartın", lat: 41.6344, lng: 32.3375 },
  { name: "Batman", lat: 37.8812, lng: 41.1351 },
  { name: "Bayburt", lat: 40.2552, lng: 40.2249 },
  { name: "Bilecik", lat: 40.0567, lng: 30.0665 },
  { name: "Bingöl", lat: 38.8854, lng: 40.4966 },
  { name: "Bitlis", lat: 38.4004, lng: 42.1095 },
  { name: "Bolu", lat: 40.7392, lng: 31.6089 },
  { name: "Burdur", lat: 37.7203, lng: 30.2906 },
  { name: "Bursa", lat: 40.1885, lng: 29.0610 },
  { name: "Çanakkale", lat: 40.1553, lng: 26.4142 },
  { name: "Çankırı", lat: 40.6013, lng: 33.6134 },
  { name: "Çorum", lat: 40.5506, lng: 34.9556 },
  { name: "Denizli", lat: 37.7765, lng: 29.0864 },
  { name: "Diyarbakır", lat: 37.9144, lng: 40.2306 },
  { name: "Düzce", lat: 40.8438, lng: 31.1565 },
  { name: "Edirne", lat: 41.6771, lng: 26.5557 },
  { name: "Elazığ", lat: 38.6810, lng: 39.2264 },
  { name: "Erzincan", lat: 39.7500, lng: 39.5000 },
  { name: "Erzurum", lat: 39.9000, lng: 41.2700 },
  { name: "Eskişehir", lat: 39.7767, lng: 30.5206 },
  { name: "Gaziantep", lat: 37.0662, lng: 37.3833 },
  { name: "Giresun", lat: 40.9128, lng: 38.3895 },
  { name: "Gümüşhane", lat: 40.4386, lng: 39.5086 },
  { name: "Hakkari", lat: 37.5833, lng: 43.7333 },
  { name: "Hatay", lat: 36.4018, lng: 36.3498 },
  { name: "Iğdır", lat: 39.9167, lng: 44.0333 },
  { name: "Isparta", lat: 37.7648, lng: 30.5566 },
  { name: "İstanbul", lat: 41.0082, lng: 28.9784 },
  { name: "İzmir", lat: 38.4237, lng: 27.1428 },
  { name: "Kahramanmaraş", lat: 37.5858, lng: 36.9371 },
  { name: "Karabük", lat: 41.2061, lng: 32.6204 },
  { name: "Karaman", lat: 37.1759, lng: 33.2287 },
  { name: "Kars", lat: 40.6167, lng: 43.1000 },
  { name: "Kastamonu", lat: 41.3887, lng: 33.7827 },
  { name: "Kayseri", lat: 38.7312, lng: 35.4787 },
  { name: "Kırıkkale", lat: 39.8468, lng: 33.5153 },
  { name: "Kırklareli", lat: 41.7333, lng: 27.2167 },
  { name: "Kırşehir", lat: 39.1425, lng: 34.1709 },
  { name: "Kilis", lat: 36.7184, lng: 37.1212 },
  { name: "Kocaeli", lat: 40.8533, lng: 29.8815 },
  { name: "Konya", lat: 37.8746, lng: 32.4932 },
  { name: "Kütahya", lat: 39.4167, lng: 29.9833 },
  { name: "Malatya", lat: 38.3552, lng: 38.3095 },
  { name: "Manisa", lat: 38.6191, lng: 27.4289 },
  { name: "Mardin", lat: 37.3212, lng: 40.7245 },
  { name: "Mersin", lat: 36.8121, lng: 34.6415 },
  { name: "Muğla", lat: 37.2153, lng: 28.3636 },
  { name: "Muş", lat: 38.9462, lng: 41.7539 },
  { name: "Nevşehir", lat: 38.6939, lng: 34.6857 },
  { name: "Niğde", lat: 37.9667, lng: 34.6833 },
  { name: "Ordu", lat: 40.9839, lng: 37.8764 },
  { name: "Osmaniye", lat: 37.0742, lng: 36.2478 },
  { name: "Rize", lat: 41.0201, lng: 40.5234 },
  { name: "Sakarya", lat: 40.7569, lng: 30.3781 },
  { name: "Samsun", lat: 41.2867, lng: 36.33 },
  { name: "Siirt", lat: 37.9333, lng: 41.95 },
  { name: "Sinop", lat: 42.0231, lng: 35.1531 },
  { name: "Sivas", lat: 39.7477, lng: 37.0179 },
  { name: "Şanlıurfa", lat: 37.1591, lng: 38.7969 },
  { name: "Şırnak", lat: 37.4187, lng: 42.4918 },
  { name: "Tekirdağ", lat: 41.0023, lng: 27.5046 },
  { name: "Tokat", lat: 40.3167, lng: 36.55 },
  { name: "Trabzon", lat: 41.0015, lng: 39.7178 },
  { name: "Tunceli", lat: 39.1079, lng: 39.5401 },
  { name: "Uşak", lat: 38.6823, lng: 29.4082 },
  { name: "Van", lat: 38.4891, lng: 43.4089 },
  { name: "Yalova", lat: 40.6500, lng: 29.2667 },
  { name: "Yozgat", lat: 39.8181, lng: 34.8147 },
  { name: "Zonguldak", lat: 41.4564, lng: 31.7987 }
];

// ============ ŞİRKETLER PAGE (Sadece Şirket CRUD) ============
function SirketlerPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [newCompany, setNewCompany] = useState({ name: "", logo_url: "", city: "" });
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });
  const [logoUploading, setLogoUploading] = useState({ dark: false, light: false });
  const darkFileRef = useRef(null);
  const lightFileRef = useRef(null);
  const newDarkFileRef = useRef(null);
  const newLightFileRef = useRef(null);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API}/companies`);
      setCompanies(res.data);
    } catch (err) {
      toast.error("Şirketler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleLogoUpload = async (companyId, type, file) => {
    if (!file || !companyId) return;
    setLogoUploading(prev => ({ ...prev, [type]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("logo_type", type);
      const res = await axios.post(`${API}/companies/${companyId}/logo`, formData);
      toast.success(`${type === "dark" ? "Koyu" : "Beyaz"} arkaplan logosu yüklendi`);
      // Update selectedCompany state
      if (selectedCompany && selectedCompany.id === companyId) {
        setSelectedCompany(prev => ({ ...prev, [`logo_${type}`]: res.data.path }));
      }
      fetchCompanies();
      return res.data.path;
    } catch {
      toast.error("Logo yüklenemedi");
      return null;
    } finally {
      setLogoUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleAddCompany = async (e) => {
    e.preventDefault();
    // İl koordinatlarını ekle
    const cityData = TURKEY_CITIES.find(c => c.name === newCompany.city);
    const companyData = {
      ...newCompany,
      city_lat: cityData?.lat || 41.0082,
      city_lng: cityData?.lng || 28.9784
    };
    try {
      await axios.post(`${API}/companies`, companyData);
      toast.success("Şirket oluşturuldu");
      setShowAddModal(false);
      setNewCompany({ name: "", logo_url: "", city: "" });
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Oluşturma başarısız");
    }
  };

  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    // İl koordinatlarını ekle
    const cityData = TURKEY_CITIES.find(c => c.name === selectedCompany.city);
    try {
      await axios.put(`${API}/companies/${selectedCompany.id}`, {
        name: selectedCompany.name,
        logo_url: selectedCompany.logo_url,
        city: selectedCompany.city,
        city_lat: cityData?.lat,
        city_lng: cityData?.lng
      });
      toast.success("Şirket güncellendi");
      setShowEditModal(false);
      fetchCompanies();
    } catch (err) {
      toast.error("Güncelleme başarısız");
    }
  };

  const handleDeleteCompany = (company) => {
    setConfirmConfig({
      title: "Şirketi Sil",
      description: `"${company.name}" şirketini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/companies/${company.id}`);
          toast.success("Şirket silindi");
          fetchCompanies();
        } catch (err) {
          toast.error(err.response?.data?.detail || "Silme başarısız");
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // Company impersonation
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateUrl, setImpersonateUrl] = useState("");
  const [impersonateCompanyName, setImpersonateCompanyName] = useState("");
  const savedSystemSession = useRef(null);

  const handleImpersonateCompany = async (company) => {
    try {
      const currentUser = localStorage.getItem("user");
      savedSystemSession.current = currentUser;
      const systemUser = JSON.parse(currentUser || "{}");
      const res = await axios.post(`${API}/restaurant-users/company-impersonate/${company.id}`, {
        admin_id: systemUser.id,
      });
      const baseUrl = window.location.origin;
      setImpersonateUrl(`${baseUrl}/admin?impersonate_token=${res.data.token}`);
      setImpersonateCompanyName(company.name);
      setShowImpersonateModal(true);
    } catch {
      toast.error("Panele bağlanılamadı");
    }
  };

  const closeImpersonateModal = () => {
    // Sistem admin oturumunu geri yükle
    if (savedSystemSession.current) {
      localStorage.setItem("user", savedSystemSession.current);
    }
    setShowImpersonateModal(false);
    setImpersonateUrl("");
    savedSystemSession.current = null;
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold">Şirketler</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Sistemdeki tüm şirketleri yönetin</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold text-xs sm:text-sm" data-testid="add-company-btn">
          <Plus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Şirket Ekle</span>
        </Button>
      </div>

      {/* Mobil: Kart görünümü */}
      <div className="md:hidden space-y-2.5">
        {companies.length === 0 ? (
          <div className="border rounded-lg p-6 bg-white text-center text-muted-foreground text-sm">Henüz şirket eklenmemiş</div>
        ) : companies.map((company) => (
          <div key={company.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {company.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="h-9 w-auto object-contain flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 bg-slate-100 flex items-center justify-center rounded flex-shrink-0">
                    <Building2 className="w-4 h-4 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{company.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {company.city ? <><MapPin className="w-3 h-3" />{company.city}</> : "-"}
                    <span className="mx-1">·</span>
                    {new Date(company.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => handleImpersonateCompany(company)} className="h-8 w-8 p-0" title="Panele Bağlan" data-testid={`impersonate-company-mobile-${company.id}`}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedCompany(company); setShowEditModal(true); }} className="h-8 w-8 p-0">
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteCompany(company)} className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Masaüstü: Tablo */}
      <div className="hidden md:block bg-white border-2 border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Logo</TableHead>
              <TableHead className="font-bold">Şirket Adı</TableHead>
              <TableHead className="font-bold">İl</TableHead>
              <TableHead className="font-bold">Oluşturma Tarihi</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Henüz şirket eklenmemiş
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    {company.logo_url ? (
                      <img src={company.logo_url} alt={company.name} className="h-10 w-auto object-contain" />
                    ) : (
                      <div className="w-10 h-10 bg-slate-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{company.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {company.city ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {company.city}
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(company.created_at).toLocaleDateString('tr-TR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleImpersonateCompany(company)}
                        className="h-8 px-2 border-2"
                        title="Panele Bağlan"
                        data-testid={`impersonate-company-${company.id}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => { setSelectedCompany(company); setShowEditModal(true); }}
                        className="h-8 px-2 border-2"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleDeleteCompany(company)}
                        className="h-8 px-2 border-2 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Şirket Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompany} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Şirket Adı</Label>
              <Input 
                value={newCompany.name} 
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} 
                className="mt-1 h-12 border-2" 
                placeholder="Örn: AgrosJet İstanbul"
                required 
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">İl</Label>
              <Select value={newCompany.city} onValueChange={(v) => setNewCompany({ ...newCompany, city: v })}>
                <SelectTrigger className="mt-1 h-12 border-2">
                  <SelectValue placeholder="İl seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TURKEY_CITIES.map(city => (
                    <SelectItem key={city.name} value={city.name}>{city.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Harita bu ile otomatik ortalanacak</p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Logolar</Label>
              <p className="text-xs text-muted-foreground mt-1">Şirketi oluşturduktan sonra düzenleme ekranından logo yükleyebilirsiniz.</p>
            </div>
            <Button type="submit" className="w-full h-12 font-semibold">Oluştur</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Şirketi Düzenle</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleUpdateCompany} className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Şirket Adı</Label>
                <Input 
                  value={selectedCompany.name} 
                  onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })} 
                  className="mt-1 h-12 border-2" 
                  required 
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">İl</Label>
                <Select value={selectedCompany.city || ""} onValueChange={(v) => setSelectedCompany({ ...selectedCompany, city: v })}>
                  <SelectTrigger className="mt-1 h-12 border-2">
                    <SelectValue placeholder="İl seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURKEY_CITIES.map(city => (
                      <SelectItem key={city.name} value={city.name}>{city.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-semibold">Logo (Koyu Arkaplan)</Label>
                <p className="text-xs text-muted-foreground">Sidebar gibi koyu alanlarda kullanılır</p>
                <input type="file" ref={darkFileRef} accept="image/*" className="hidden" onChange={(e) => { if (e.target.files[0]) handleLogoUpload(selectedCompany.id, "dark", e.target.files[0]); }} />
                <div className="flex items-center gap-2 mt-1.5">
                  {selectedCompany.logo_dark ? (
                    <>
                      <div className="w-24 h-12 bg-slate-800 rounded flex items-center justify-center p-1.5">
                        <img src={`${process.env.REACT_APP_BACKEND_URL}${selectedCompany.logo_dark}`} alt="Dark logo" className="max-w-full max-h-full object-contain" />
                      </div>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => darkFileRef.current?.click()} disabled={logoUploading.dark}>
                        {logoUploading.dark ? <Loader2 className="w-3 h-3 animate-spin" /> : "Değiştir"}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-10 border-dashed w-full" onClick={() => darkFileRef.current?.click()} disabled={logoUploading.dark}>
                      {logoUploading.dark ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                      Logo Yükle
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Logo (Beyaz Arkaplan)</Label>
                <p className="text-xs text-muted-foreground">Beyaz/açık renkli alanlarda kullanılır</p>
                <input type="file" ref={lightFileRef} accept="image/*" className="hidden" onChange={(e) => { if (e.target.files[0]) handleLogoUpload(selectedCompany.id, "light", e.target.files[0]); }} />
                <div className="flex items-center gap-2 mt-1.5">
                  {selectedCompany.logo_light ? (
                    <>
                      <div className="w-24 h-12 bg-white border rounded flex items-center justify-center p-1.5">
                        <img src={`${process.env.REACT_APP_BACKEND_URL}${selectedCompany.logo_light}`} alt="Light logo" className="max-w-full max-h-full object-contain" />
                      </div>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => lightFileRef.current?.click()} disabled={logoUploading.light}>
                        {logoUploading.light ? <Loader2 className="w-3 h-3 animate-spin" /> : "Değiştir"}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-10 border-dashed w-full" onClick={() => lightFileRef.current?.click()} disabled={logoUploading.light}>
                      {logoUploading.light ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                      Logo Yükle
                    </Button>
                  )}
                </div>
              </div>
              <Button type="submit" className="w-full h-12 font-semibold">Kaydet</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        variant="destructive"
      />

      {/* Company Impersonate Modal */}
      {showImpersonateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" data-testid="impersonate-company-modal">
          <div className="bg-white rounded-xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{impersonateCompanyName} - Admin Paneli</span>
              </div>
              <Button size="sm" variant="ghost" onClick={closeImpersonateModal} className="h-8 w-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <iframe
              src={impersonateUrl}
              className="flex-1 w-full border-0"
              title={`${impersonateCompanyName} Admin Panel`}
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ============ KONTÖR YÖNETİMİ PAGE ============
function KontorYonetimiPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // add | deduct | history
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [transactions, setTransactions] = useState([]);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API}/credits/companies`);
      setCompanies(res.data.companies || []);
    } catch (err) {
      toast.error("Şirketler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const getCreditColor = (credits, unlimited) => {
    if (unlimited) return "text-blue-600";
    if (credits < 100) return "text-red-600";
    if (credits < 500) return "text-orange-500";
    return "text-green-600";
  };

  const getCreditBgColor = (credits, unlimited) => {
    if (unlimited) return "bg-blue-50";
    if (credits < 100) return "bg-red-50";
    if (credits < 500) return "bg-orange-50";
    return "bg-green-50";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const openModal = (company, mode) => {
    setSelectedCompany(company);
    setModalMode(mode);
    setAmount("");
    setNote("");
    setShowModal(true);
    
    if (mode === "history") {
      fetchTransactions(company.id);
    }
  };

  const fetchTransactions = async (companyId) => {
    try {
      const res = await axios.get(`${API}/credits/company/${companyId}/transactions`);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      toast.error("İşlem geçmişi yüklenemedi");
    }
  };

  const handleAddCredits = async () => {
    if (!amount || parseInt(amount) <= 0) {
      toast.error("Geçerli bir miktar girin");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/credits/company/${selectedCompany.id}/add`, {
        amount: parseInt(amount),
        note: note || undefined,
        admin_name: "Sistem Yöneticisi"
      });
      toast.success(`${amount} kontör eklendi`);
      setShowModal(false);
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDeductCredits = async () => {
    if (!amount || parseInt(amount) <= 0) {
      toast.error("Geçerli bir miktar girin");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/credits/company/${selectedCompany.id}/deduct`, {
        amount: parseInt(amount),
        note: note || undefined,
        admin_name: "Sistem Yöneticisi"
      });
      toast.success(`${amount} kontör düşüldü`);
      setShowModal(false);
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUnlimited = async (company) => {
    try {
      await axios.put(`${API}/credits/company/${company.id}/unlimited`, {
        unlimited: !company.unlimited,
        admin_name: "Sistem Yöneticisi"
      });
      toast.success(company.unlimited ? "Sınırsız kontör kapatıldı" : "Sınırsız kontör açıldı");
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const getTransactionTypeLabel = (type) => {
    const labels = {
      admin_add: "Manuel Ekleme",
      admin_deduct: "Manuel Düşüm",
      order_deduct: "Sipariş",
      unlimited_toggle: "Sınırsız Değişim"
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="kontor-yonetimi-page">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">Kontör Yönetimi</h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Şirket bazlı kontör bakiyeleri ve işlemler</p>
        </div>
      </div>

      {/* Mobil: Kart görünümü */}
      <div className="md:hidden space-y-2.5">
        {companies.length === 0 ? (
          <div className="border rounded-lg p-6 bg-white text-center text-muted-foreground text-sm">Henüz şirket bulunmuyor</div>
        ) : companies.map((company) => (
          <div key={company.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {company.logo_url ? (
                  <img src={company.logo_url} alt="" className="w-7 h-7 rounded object-contain flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-medium text-sm truncate block">{company.name}</span>
                  {company.is_shared_pool && <span className="text-[10px] text-blue-600">Ortak Havuz</span>}
                </div>
              </div>
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${getCreditBgColor(company.credits, company.unlimited)}`}>
                <Coins className={`w-3.5 h-3.5 ${getCreditColor(company.credits, company.unlimited)}`} />
                <span className={`font-bold text-sm ${getCreditColor(company.credits, company.unlimited)}`}>
                  {company.unlimited ? "Sınırsız" : company.credits.toLocaleString("tr-TR")}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Sınırsız:</span>
                <button
                  onClick={() => handleToggleUnlimited(company)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${company.unlimited ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${company.unlimited ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openModal(company, "add")} className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" disabled={company.unlimited} title="Kontör Ekle">
                  <PlusCircle className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openModal(company, "deduct")} className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" disabled={company.unlimited} title="Kontör Düş">
                  <MinusCircle className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openModal(company, "history")} className="h-7 w-7 p-0" title="İşlem Geçmişi">
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Masaüstü: Tablo */}
      <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Şirket</TableHead>
              <TableHead className="w-[150px]">Kontör</TableHead>
              <TableHead className="w-[120px]">Sınırsız</TableHead>
              <TableHead className="w-[150px]">Son Yükleme</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="" className="w-8 h-8 rounded object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <span className="font-medium">{company.name}</span>
                      {company.is_shared_pool && (
                        <span className="text-[10px] text-blue-600 block">Ortak Havuz</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md ${getCreditBgColor(company.credits, company.unlimited)}`}>
                    <Coins className={`w-4 h-4 ${getCreditColor(company.credits, company.unlimited)}`} />
                    <span className={`font-bold ${getCreditColor(company.credits, company.unlimited)}`}>
                      {company.unlimited ? "Sınırsız" : company.credits.toLocaleString("tr-TR")}
                    </span>
                  </div>
                  {company.last_credit_date && !company.unlimited && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Son: {formatDate(company.last_credit_date)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleToggleUnlimited(company)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      company.unlimited ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        company.unlimited ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(company.last_credit_date)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(company, "add")}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      disabled={company.unlimited}
                      title="Kontör Ekle"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(company, "deduct")}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      disabled={company.unlimited}
                      title="Kontör Düş"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(company, "history")}
                      title="İşlem Geçmişi"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Henüz şirket bulunmuyor
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5" />
              {modalMode === "add" && "Kontör Ekle"}
              {modalMode === "deduct" && "Kontör Düş"}
              {modalMode === "history" && "İşlem Geçmişi"}
              {selectedCompany && ` - ${selectedCompany.name}`}
            </DialogTitle>
          </DialogHeader>

          {(modalMode === "add" || modalMode === "deduct") && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Miktar</Label>
                <Input
                  type="number"
                  placeholder="Kontör miktarı"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                />
              </div>
              <div>
                <Label>Not (Opsiyonel)</Label>
                <Input
                  placeholder="İşlem notu..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  İptal
                </Button>
                <Button
                  onClick={modalMode === "add" ? handleAddCredits : handleDeductCredits}
                  disabled={saving}
                  className={modalMode === "add" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {modalMode === "add" ? "Ekle" : "Düş"}
                </Button>
              </div>
            </div>
          )}

          {modalMode === "history" && (
            <div className="py-4 max-h-96 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Henüz işlem yok</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <span className="font-medium text-sm">{getTransactionTypeLabel(tx.type)}</span>
                        <div className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString("tr-TR")}
                        </div>
                        {tx.note && (
                          <div className="text-xs text-muted-foreground mt-0.5">{tx.note}</div>
                        )}
                      </div>
                      <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============ YÖNETİCİLER PAGE (Tüm Adminler + Şirket Atama) ============
function YoneticilerPage() {
  const [admins, setAdmins] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [newAdmin, setNewAdmin] = useState({ 
    name: "", 
    username: "", 
    password: "",
    role: "superadmin",
    company_ids: []
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  const fetchData = async () => {
    try {
      const [adminsRes, companiesRes] = await Promise.all([
        axios.get(`${API}/admins/all`),
        axios.get(`${API}/companies`)
      ]);
      setAdmins(adminsRes.data);
      setCompanies(companiesRes.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (newAdmin.company_ids.length === 0) {
      toast.error("En az bir şirket seçmelisiniz");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/admins`, {
        name: newAdmin.name,
        username: newAdmin.username,
        password: newAdmin.password,
        role: newAdmin.role,
        company_ids: newAdmin.company_ids
      });
      toast.success("Yönetici oluşturuldu");
      setShowAddModal(false);
      setNewAdmin({ name: "", username: "", password: "", role: "superadmin", company_ids: [] });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Oluşturma başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    if (selectedAdmin.company_ids.length === 0) {
      toast.error("En az bir şirket seçmelisiniz");
      return;
    }
    setSaving(true);
    try {
      // Update basic info
      await axios.put(`${API}/admins/${selectedAdmin.id}`, {
        name: selectedAdmin.name,
        password: selectedAdmin.newPassword || undefined
      });
      // Update companies
      await axios.put(`${API}/auth/admin/${selectedAdmin.id}/companies`, selectedAdmin.company_ids);
      toast.success("Yönetici güncellendi");
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = (admin) => {
    setConfirmConfig({
      title: "Yöneticiyi Sil",
      description: `"${admin.name}" yöneticisini silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/admins/${admin.id}`);
          toast.success("Yönetici silindi");
          fetchData();
        } catch (err) {
          toast.error(err.response?.data?.detail || "Silme başarısız");
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const toggleCompanySelection = (companyId, isNew = false) => {
    if (isNew) {
      setNewAdmin(prev => ({
        ...prev,
        company_ids: prev.company_ids.includes(companyId)
          ? prev.company_ids.filter(id => id !== companyId)
          : [...prev.company_ids, companyId]
      }));
    } else {
      setSelectedAdmin(prev => ({
        ...prev,
        company_ids: prev.company_ids.includes(companyId)
          ? prev.company_ids.filter(id => id !== companyId)
          : [...prev.company_ids, companyId]
      }));
    }
  };

  const getCompanyNames = (companyIds) => {
    if (!companyIds || companyIds.length === 0) return "-";
    return companyIds
      .map(id => companies.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const openEditModal = (admin) => {
    setSelectedAdmin({
      ...admin,
      company_ids: admin.company_ids || (admin.company_id ? [admin.company_id] : []),
      newPassword: ""
    });
    setShowEditModal(true);
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold">Yöneticiler</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Tüm yöneticileri ve şirket erişimlerini yönetin</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold text-xs sm:text-sm" data-testid="add-admin-btn">
          <Plus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Yönetici Ekle</span>
        </Button>
      </div>

      {/* Mobil: Kart görünümü */}
      <div className="md:hidden space-y-2.5">
        {admins.length === 0 ? (
          <div className="border rounded-lg p-6 bg-white text-center text-muted-foreground text-sm">Henüz yönetici eklenmemiş</div>
        ) : admins.map((admin) => (
          <div key={admin.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{admin.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{admin.username}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                  admin.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"
                }`}>
                  {admin.role === "superadmin" ? "S.Admin" : "Admin"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => openEditModal(admin)} className="h-7 w-7 p-0">
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteAdmin(admin)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {(admin.company_ids || (admin.company_id ? [admin.company_id] : [])).map(cid => {
                const comp = companies.find(c => c.id === cid);
                return comp ? <span key={cid} className="px-1.5 py-0.5 bg-slate-100 text-[10px] rounded">{comp.name}</span> : null;
              })}
              {(!admin.company_ids || admin.company_ids.length === 0) && !admin.company_id && (
                <span className="text-muted-foreground text-xs">-</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Masaüstü: Tablo */}
      <div className="hidden md:block bg-white border-2 border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Ad Soyad</TableHead>
              <TableHead className="font-bold">Kullanıcı Adı</TableHead>
              <TableHead className="font-bold">Rol</TableHead>
              <TableHead className="font-bold">Erişebildiği Şirketler</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Henüz yönetici eklenmemiş
                </TableCell>
              </TableRow>
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-semibold">{admin.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{admin.username}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      admin.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"
                    }`}>
                      {admin.role === "superadmin" ? "Süper Admin" : "Admin"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(admin.company_ids || (admin.company_id ? [admin.company_id] : [])).map(cid => {
                        const comp = companies.find(c => c.id === cid);
                        return comp ? (
                          <span key={cid} className="px-2 py-0.5 bg-slate-100 text-xs rounded">
                            {comp.name}
                          </span>
                        ) : null;
                      })}
                      {(!admin.company_ids || admin.company_ids.length === 0) && !admin.company_id && (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => openEditModal(admin)}
                        className="h-8 px-2 border-2"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleDeleteAdmin(admin)}
                        className="h-8 px-2 border-2 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Admin Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Yönetici Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Ad Soyad</Label>
              <Input 
                value={newAdmin.name} 
                onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} 
                className="mt-1 h-12 border-2" 
                required 
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Kullanıcı Adı</Label>
              <Input 
                value={newAdmin.username} 
                onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} 
                className="mt-1 h-12 border-2" 
                required 
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Şifre</Label>
              <Input 
                type="password"
                value={newAdmin.password} 
                onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} 
                className="mt-1 h-12 border-2" 
                required 
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Rol</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newAdmin.role === "superadmin"}
                    onChange={() => setNewAdmin({ ...newAdmin, role: "superadmin" })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Süper Admin</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newAdmin.role === "admin"}
                    onChange={() => setNewAdmin({ ...newAdmin, role: "admin" })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Admin</span>
                </label>
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold">Erişebileceği Şirketler</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border-2 rounded p-3">
                {companies.map(company => (
                  <label key={company.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                    <Checkbox 
                      checked={newAdmin.company_ids.includes(company.id)}
                      onCheckedChange={() => toggleCompanySelection(company.id, true)}
                    />
                    <span className="text-sm">{company.name}</span>
                  </label>
                ))}
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">Henüz şirket eklenmemiş</p>
                )}
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-semibold" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Oluşturuluyor...</> : "Oluştur"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Admin Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yöneticiyi Düzenle</DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <form onSubmit={handleUpdateAdmin} className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Ad Soyad</Label>
                <Input 
                  value={selectedAdmin.name} 
                  onChange={(e) => setSelectedAdmin({ ...selectedAdmin, name: e.target.value })} 
                  className="mt-1 h-12 border-2" 
                  required 
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Kullanıcı Adı</Label>
                <Input 
                  value={selectedAdmin.username} 
                  className="mt-1 h-12 border-2 bg-slate-50" 
                  disabled 
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Yeni Şifre (değiştirmek için doldurun)</Label>
                <Input 
                  type="password"
                  value={selectedAdmin.newPassword || ""} 
                  onChange={(e) => setSelectedAdmin({ ...selectedAdmin, newPassword: e.target.value })} 
                  className="mt-1 h-12 border-2" 
                  placeholder="Boş bırakırsanız değişmez"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Erişebileceği Şirketler</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border-2 rounded p-3">
                  {companies.map(company => (
                    <label key={company.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <Checkbox 
                        checked={selectedAdmin.company_ids?.includes(company.id)}
                        onCheckedChange={() => toggleCompanySelection(company.id, false)}
                      />
                      <span className="text-sm">{company.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full h-12 font-semibold" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : "Kaydet"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        variant="destructive"
      />
    </div>
  );
}


// ============ KURYELER PAGE ============
function KuryelerPage() {
  const [couriers, setCouriers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompany, setFilterCompany] = useState("all");
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  const fetchData = async () => {
    try {
      const [couriersRes, companiesRes] = await Promise.all([
        axios.get(`${API}/couriers/all`),
        axios.get(`${API}/companies`)
      ]);
      setCouriers(couriersRes.data);
      setCompanies(companiesRes.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteCourier = (courier) => {
    setConfirmConfig({
      title: "Kurye Hesabını Sil",
      description: `"${courier.name}" kuryesinin hesabını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/couriers/${courier.id}/permanent`);
          toast.success("Kurye hesabı silindi");
          fetchData();
        } catch (err) {
          toast.error(err.response?.data?.detail || "Silme başarısız");
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const getCompanyName = (companyId) => {
    const company = companies.find(c => c.id === companyId);
    return company?.name || "-";
  };

  const filteredCouriers = couriers.filter(c => {
    const matchesSearch = !searchQuery || 
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery);
    const matchesCompany = filterCompany === "all" || 
      c.company_ids?.includes(filterCompany) ||
      c.company_id === filterCompany;
    return matchesSearch && matchesCompany;
  });

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Kuryeler</h1>
          <p className="text-muted-foreground text-sm">Sistemdeki tüm kurye hesaplarını görüntüleyin</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="İsim veya telefon ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-48 border-2"
          />
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="h-10 px-3 border-2 rounded-md text-sm"
          >
            <option value="all">Tüm Şirketler</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-1.5">
        {filteredCouriers.length === 0 ? (
          <div className="bg-white border rounded-lg p-6 text-center text-muted-foreground text-sm">
            {searchQuery || filterCompany !== "all" ? "Arama kriterlerine uygun kurye bulunamadı" : "Henüz kurye kaydı yok"}
          </div>
        ) : (
          filteredCouriers.map((courier) => (
            <div key={courier.id} className="bg-white border rounded-lg px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">{courier.name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded flex-shrink-0 ${
                      courier.is_active !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {courier.is_active !== false ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {courier.phone}
                    {courier.created_at && <span className="ml-1.5">· {new Date(courier.created_at).toLocaleDateString('tr-TR')}</span>}
                    {(courier.company_names || []).length > 0 && (
                      <span className="ml-1.5">· {courier.company_names.join(', ')}</span>
                    )}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteCourier(courier)} className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0" title="Sil">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white border-2 border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Ad Soyad</TableHead>
              <TableHead className="font-bold">Telefon</TableHead>
              <TableHead className="font-bold">Şirketler</TableHead>
              <TableHead className="font-bold">Kayıt Tarihi</TableHead>
              <TableHead className="font-bold">Durum</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCouriers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchQuery || filterCompany !== "all" ? "Arama kriterlerine uygun kurye bulunamadı" : "Henüz kurye kaydı yok"}
                </TableCell>
              </TableRow>
            ) : (
              filteredCouriers.map((courier) => (
                <TableRow key={courier.id}>
                  <TableCell className="font-semibold">{courier.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{courier.phone}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(courier.company_names || []).map((name, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-100 text-xs rounded">
                          {name}
                        </span>
                      ))}
                      {(!courier.company_names || courier.company_names.length === 0) && (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {courier.created_at ? new Date(courier.created_at).toLocaleDateString('tr-TR') : "-"}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      courier.is_active !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {courier.is_active !== false ? "Aktif" : "Pasif"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleDeleteCourier(courier)}
                      className="h-8 px-2 border-2 hover:bg-red-50 hover:text-red-600"
                      title="Hesabı Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Toplam {filteredCouriers.length} kurye {filterCompany !== "all" || searchQuery ? "(filtrelenmiş)" : ""}
      </div>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        variant="destructive"
      />
    </div>
  );
}


// ============ SİSTEM AYARLARI PAGE ============
function SistemAyarlariPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  
  // R2 settings
  const [settings, setSettings] = useState({
    account_id: "",
    access_key_id: "",
    secret_access_key: "",
    bucket_name: "shiftjet",
    configured: false
  });
  
  const [formData, setFormData] = useState({
    account_id: "",
    access_key_id: "",
    secret_access_key: "",
    bucket_name: "shiftjet"
  });

  // SMTP settings
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    from_email: "",
    from_name: "AgrosJet",
    enabled: true
  });

  // AgrosJet settings
  const [agjSaving, setAgjSaving] = useState(false);
  const [agjTesting, setAgjTesting] = useState(false);
  const [agjTestResult, setAgjTestResult] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [agjConfigured, setAgjConfigured] = useState(false);
  const [agjSettings, setAgjSettings] = useState({
    api_key: "",
    base_url: "https://agrosjet.com"
  });

  useEffect(() => {
    fetchSettings();
    fetchSmtpSettings();
    fetchAgjSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/system-settings/cloudflare-r2`);
      setSettings(res.data);
      setFormData({
        account_id: res.data.account_id || "",
        access_key_id: res.data.access_key_id || "",
        secret_access_key: "",
        bucket_name: res.data.bucket_name || "shiftjet"
      });
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSmtpSettings = async () => {
    try {
      const res = await axios.get(`${API}/system-settings/smtp`);
      setSmtpConfigured(res.data.configured);
      setSmtpSettings({
        smtp_host: res.data.smtp_host || "",
        smtp_port: res.data.smtp_port || 587,
        smtp_user: res.data.smtp_user || "",
        smtp_password: res.data.smtp_password_masked || "",
        from_email: res.data.from_email || "",
        from_name: res.data.from_name || "AgrosJet",
        enabled: res.data.enabled !== false
      });
    } catch (err) {
      console.error("Failed to fetch SMTP settings:", err);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!formData.account_id || !formData.access_key_id || !formData.bucket_name) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }
    
    if (!settings.configured && !formData.secret_access_key) {
      toast.error("Secret Access Key gerekli");
      return;
    }
    
    setSaving(true);
    try {
      await axios.post(`${API}/system-settings/cloudflare-r2`, formData);
      toast.success("Ayarlar kaydedildi");
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API}/system-settings/cloudflare-r2/test`);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.detail || "Bağlantı başarısız" });
    } finally {
      setTesting(false);
    }
  };

  // SMTP handlers
  const handleSmtpSave = async () => {
    if (!smtpSettings.smtp_host || !smtpSettings.smtp_user) {
      toast.error("SMTP sunucu ve kullanıcı adı gereklidir");
      return;
    }
    
    if (!smtpConfigured && !smtpSettings.smtp_password) {
      toast.error("SMTP şifresi gereklidir");
      return;
    }
    
    setSmtpSaving(true);
    try {
      await axios.post(`${API}/system-settings/smtp`, smtpSettings);
      toast.success("SMTP ayarları kaydedildi");
      setSmtpConfigured(true);
      fetchSmtpSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await axios.post(`${API}/system-settings/smtp/test`);
      setSmtpTestResult(res.data);
    } catch (err) {
      setSmtpTestResult({ success: false, message: err.response?.data?.detail || "Test başarısız" });
    } finally {
      setSmtpTesting(false);
    }
  };

  // AgrosJet functions
  const fetchAgjSettings = async () => {
    try {
      const res = await axios.get(`${API}/system-settings/agrosjet`);
      setAgjConfigured(res.data.configured);
      if (res.data.configured) {
        setAgjSettings({
          api_key: "",
          base_url: res.data.base_url || "https://agrosjet.com"
        });
      }
    } catch (err) {
      console.error("AgrosJet ayarları yüklenemedi:", err);
    }
  };

  const handleAgjSave = async () => {
    if (!agjConfigured && !agjSettings.api_key) {
      toast.error("API anahtarı gerekli");
      return;
    }
    setAgjSaving(true);
    try {
      const payload = { base_url: agjSettings.base_url };
      if (agjSettings.api_key) payload.api_key = agjSettings.api_key;
      
      if (agjConfigured) {
        await axios.put(`${API}/system-settings/agrosjet`, payload);
      } else {
        await axios.post(`${API}/system-settings/agrosjet`, { ...payload, api_key: agjSettings.api_key });
      }
      toast.success("AgrosJet ayarları kaydedildi");
      fetchAgjSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setAgjSaving(false);
    }
  };

  const handleAgjTest = async () => {
    setAgjTesting(true);
    setAgjTestResult(null);
    try {
      const res = await axios.post(`${API}/system-settings/agrosjet/test`);
      setAgjTestResult(res.data);
    } catch (err) {
      setAgjTestResult({ success: false, message: err.response?.data?.detail || "Test başarısız" });
    } finally {
      setAgjTesting(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-bold">Sistem Ayarları</h1>
        <p className="text-muted-foreground text-xs sm:text-sm">Depolama ve e-posta yapılandırması</p>
      </div>

      <div className="bg-white border-2 border-border overflow-hidden">
        <div className="p-3 sm:p-6 border-b-2 border-border flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Cloud className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold">Cloudflare R2</h2>
            <p className="text-sm text-muted-foreground">Dosya depolama servisi</p>
          </div>
          {settings.configured && (
            <span className="ml-auto px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> Yapılandırıldı
            </span>
          )}
        </div>
        
        <form onSubmit={handleSave} className="p-3 sm:p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Account ID</Label>
              <Input
                value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 border-2 font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Bucket Name</Label>
              <Input
                value={formData.bucket_name}
                onChange={(e) => setFormData({ ...formData, bucket_name: e.target.value })}
                placeholder="shiftjet"
                className="mt-1 border-2 font-mono text-sm"
              />
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Access Key ID</Label>
              <Input
                value={formData.access_key_id}
                onChange={(e) => setFormData({ ...formData, access_key_id: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 border-2 font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">
                Secret Access Key
                {settings.configured && <span className="text-muted-foreground font-normal ml-1">(değiştirmek için doldurun)</span>}
              </Label>
              <div className="relative mt-1">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={formData.secret_access_key}
                  onChange={(e) => setFormData({ ...formData, secret_access_key: e.target.value })}
                  placeholder={settings.configured ? "••••••••" : "Secret key girin"}
                  className="border-2 font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          
          {testResult && (
            <div className={`p-4 rounded-lg border-2 ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-semibold ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.message}
                </span>
              </div>
            </div>
          )}
          
          <div className="flex gap-3 pt-4 border-t">
            <Button type="submit" disabled={saving} className="font-semibold">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : "Kaydet"}
            </Button>
            {settings.configured && (
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing} className="font-semibold border-2">
                {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Test Ediliyor...</> : "Bağlantıyı Test Et"}
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* SMTP E-posta Ayarları Kartı */}
      <div className="bg-white border-2 border-border overflow-hidden">
        <div className="p-3 sm:p-6 border-b-2 border-border flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-sm sm:text-base">E-posta (SMTP)</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Merkezi e-posta gönderim ayarları</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {smtpConfigured ? (
              <span className="px-2 sm:px-3 py-1 bg-green-100 text-green-700 text-xs sm:text-sm font-semibold rounded-full flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Yapılandırıldı</span>
              </span>
            ) : (
              <span className="px-2 sm:px-3 py-1 bg-orange-100 text-orange-700 text-xs sm:text-sm font-semibold rounded-full flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Yapılandırılmadı</span>
              </span>
            )}
          </div>
        </div>
        
        <div className="p-3 sm:p-6 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
            <div>
              <p className="font-medium text-sm">E-posta Bildirimleri</p>
              <p className="text-xs text-muted-foreground">Sistem genelinde e-posta gönderimini aç/kapat</p>
            </div>
            <button
              onClick={() => setSmtpSettings({...smtpSettings, enabled: !smtpSettings.enabled})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                smtpSettings.enabled ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  smtpSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">SMTP Sunucu</Label>
              <Input
                value={smtpSettings.smtp_host}
                onChange={(e) => setSmtpSettings({...smtpSettings, smtp_host: e.target.value})}
                placeholder="smtp.gmail.com"
                className="mt-1 border-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Port</Label>
              <Input
                type="number"
                value={smtpSettings.smtp_port}
                onChange={(e) => setSmtpSettings({...smtpSettings, smtp_port: parseInt(e.target.value) || 587})}
                placeholder="587"
                className="mt-1 border-2 text-sm"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">SMTP Kullanıcı</Label>
              <Input
                value={smtpSettings.smtp_user}
                onChange={(e) => setSmtpSettings({...smtpSettings, smtp_user: e.target.value})}
                placeholder="bildirim@agrosjet.com"
                className="mt-1 border-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">
                SMTP Şifre
                {smtpConfigured && <span className="text-muted-foreground font-normal ml-1">(değiştirmek için doldurun)</span>}
              </Label>
              <div className="relative mt-1">
                <Input
                  type={showSmtpPassword ? "text" : "password"}
                  value={smtpSettings.smtp_password}
                  onChange={(e) => setSmtpSettings({...smtpSettings, smtp_password: e.target.value})}
                  placeholder={smtpConfigured ? "••••••••" : "Şifre girin"}
                  className="border-2 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Gmail için App Password kullanın</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Gönderen E-posta (Opsiyonel)</Label>
              <Input
                value={smtpSettings.from_email}
                onChange={(e) => setSmtpSettings({...smtpSettings, from_email: e.target.value})}
                placeholder="Boş bırakılırsa SMTP kullanıcısı"
                className="mt-1 border-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Gönderen Adı</Label>
              <Input
                value={smtpSettings.from_name}
                onChange={(e) => setSmtpSettings({...smtpSettings, from_name: e.target.value})}
                placeholder="AgrosJet"
                className="mt-1 border-2 text-sm"
              />
            </div>
          </div>

          {smtpTestResult && (
            <div className={`p-4 rounded-lg border-2 ${smtpTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {smtpTestResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-semibold ${smtpTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {smtpTestResult.message}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleSmtpSave} disabled={smtpSaving} className="font-semibold">
              {smtpSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : "Kaydet"}
            </Button>
            {smtpConfigured && (
              <Button variant="outline" onClick={handleSmtpTest} disabled={smtpTesting} className="font-semibold border-2">
                {smtpTesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Test Ediliyor...</> : "Bağlantıyı Test Et"}
              </Button>
            )}
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <p className="font-medium">Bilgi:</p>
            <p>Bu ayarlar tüm şirketler için geçerlidir. Şirketler kendi bildirim tercihlerini ayrıca yönetebilir.</p>
          </div>
        </div>
      </div>

      {/* AgrosJet Entegrasyon Ayarları Kartı */}
      <div className="bg-white border-2 border-border overflow-hidden">
        <div className="p-3 sm:p-6 border-b-2 border-border flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
            <ExternalLink className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-sm sm:text-base">AgrosJet Entegrasyonu</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">AgrosJet.com başvuru senkronizasyonu</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {agjConfigured ? (
              <span className="px-2 sm:px-3 py-1 bg-green-100 text-green-700 text-xs sm:text-sm font-semibold rounded-full flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Yapılandırıldı</span>
              </span>
            ) : (
              <span className="px-2 sm:px-3 py-1 bg-orange-100 text-orange-700 text-xs sm:text-sm font-semibold rounded-full flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Yapılandırılmadı</span>
              </span>
            )}
          </div>
        </div>
        
        <div className="p-3 sm:p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Base URL</Label>
              <Input
                value={agjSettings.base_url}
                onChange={(e) => setAgjSettings({...agjSettings, base_url: e.target.value})}
                placeholder="https://agrosjet.com"
                className="mt-1 border-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">
                API Anahtarı
                {agjConfigured && <span className="text-muted-foreground font-normal ml-1">(değiştirmek için doldurun)</span>}
              </Label>
              <div className="relative mt-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={agjSettings.api_key}
                  onChange={(e) => setAgjSettings({...agjSettings, api_key: e.target.value})}
                  placeholder={agjConfigured ? "••••••••" : "agj_xxxxxxxxxxxxx"}
                  className="border-2 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">AgrosJet admin panelinden oluşturulur</p>
            </div>
          </div>

          {agjTestResult && (
            <div className={`p-4 rounded-lg border-2 ${agjTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {agjTestResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-semibold text-sm ${agjTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {agjTestResult.message}
                </span>
              </div>
              {agjTestResult.details && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {agjTestResult.details.sync_courier && <span className="mr-3">Kurye: Aktif</span>}
                  {agjTestResult.details.sync_restaurant && <span className="mr-3">Restoran: Aktif</span>}
                  {agjTestResult.details.sync_company && <span>Şirket: Aktif</span>}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleAgjSave} disabled={agjSaving} className="font-semibold">
              {agjSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Kaydediliyor...</> : "Kaydet"}
            </Button>
            {agjConfigured && (
              <Button variant="outline" onClick={handleAgjTest} disabled={agjTesting} className="font-semibold border-2">
                {agjTesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Test Ediliyor...</> : "Bağlantıyı Test Et"}
              </Button>
            )}
          </div>

          <div className="p-3 bg-emerald-50 rounded-lg text-xs text-emerald-700">
            <p className="font-medium">Bilgi:</p>
            <p>AgrosJet.com üzerinden gelen kurye, restoran ve şirket başvurularını görüntülemek ve yönetmek için bu entegrasyonu yapılandırın.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============ MAIN DASHBOARD ============
export default function SystemDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== "systemadmin") {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const NAV_ITEMS = [
    { path: "/system", label: "Şirketler", icon: Building2 },
    { path: "/system/kontor", label: "Kontör Yönetimi", icon: Coins },
    { path: "/system/yoneticiler", label: "Yöneticiler", icon: UserCog },
    { path: "/system/kuryeler", label: "Kuryeler", icon: Users },
    { path: "/system/ayarlar", label: "Ayarlar", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50" data-testid="system-dashboard">
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <span className="font-heading text-lg font-bold">Sistem Yönetimi</span>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20">
          {NAV_ITEMS.map((item) => (
            <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold ${location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"}`}>
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-white/10 text-left">
            <LogOut className="w-5 h-5" />
            Çıkış
          </button>
        </nav>
      )}

      <div className="flex">
        <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
          <div className={`p-4 border-b border-white/20 ${sidebarCollapsed ? 'px-2 flex flex-col items-center' : ''}`}>
            {sidebarCollapsed ? (
              <Building2 className="w-6 h-6" />
            ) : (
              <>
                <h1 className="font-heading text-lg font-bold truncate">Sistem Yönetimi</h1>
                <p className="text-white/60 text-sm mt-1">Ana Kontrol Paneli</p>
                <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
              </>
            )}
          </div>
          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                title={sidebarCollapsed ? item.label : ''}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"} ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/20">
            <Button 
              variant="ghost" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
              className={`w-full justify-center text-white hover:bg-white/10 py-2 ${sidebarCollapsed ? '' : 'justify-end pr-4'}`}
              data-testid="system-sidebar-toggle-btn"
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`}
              data-testid="system-logout-btn"
              title={sidebarCollapsed ? 'Çıkış Yap' : ''}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="ml-2">Çıkış Yap</span>}
            </Button>
          </div>
        </aside>

        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
          <div className="p-4 md:p-8 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<SirketlerPage />} />
              <Route path="kontor" element={<KontorYonetimiPage />} />
              <Route path="yoneticiler" element={<YoneticilerPage />} />
              <Route path="kuryeler" element={<KuryelerPage />} />
              <Route path="ayarlar" element={<SistemAyarlariPage />} />
            </Routes>
          </div>
          
          <footer className="bg-white border-t py-3 text-center text-xs text-muted-foreground">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </footer>
        </main>
      </div>
    </div>
  );
}
