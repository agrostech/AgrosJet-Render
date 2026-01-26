import { useState, useEffect } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Menu, X, LogOut, Building2, Trash2, Plus, Edit, UserPlus, Users, Settings, Cloud, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ============ SİSTEM AYARLARI PAGE ============
function SistemAyarlariPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  
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

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/system-settings/cloudflare-r2`);
      setSettings(res.data);
      setFormData({
        account_id: res.data.account_id || "",
        access_key_id: res.data.access_key_id || "",
        secret_access_key: "", // Don't populate secret for security
        bucket_name: res.data.bucket_name || "shiftjet"
      });
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!formData.account_id || !formData.access_key_id || !formData.bucket_name) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }
    
    // If editing existing and secret is empty, don't require it
    if (!settings.configured && !formData.secret_access_key) {
      toast.error("Secret Access Key gerekli");
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        account_id: formData.account_id,
        access_key_id: formData.access_key_id,
        bucket_name: formData.bucket_name
      };
      
      // Only include secret if provided
      if (formData.secret_access_key) {
        payload.secret_access_key = formData.secret_access_key;
      }
      
      if (settings.configured) {
        await axios.put(`${API}/system-settings/cloudflare-r2`, payload);
      } else {
        payload.secret_access_key = formData.secret_access_key; // Required for new
        await axios.post(`${API}/system-settings/cloudflare-r2`, payload);
      }
      
      toast.success("Ayarlar kaydedildi");
      setFormData(prev => ({ ...prev, secret_access_key: "" }));
      fetchSettings();
      setTestResult(null);
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
      setTestResult({
        success: false,
        message: err.response?.data?.detail || "Bağlantı testi başarısız"
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6" data-testid="sistem-ayarlari-page">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Settings className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-heading font-bold">Sistem Ayarları</h1>
          <p className="text-muted-foreground text-sm">Cloudflare R2 ve diğer entegrasyonlar</p>
        </div>
      </div>

      {/* Cloudflare R2 Settings */}
      <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
        <div className="bg-orange-50 px-6 py-4 border-b-2 border-border flex items-center gap-3">
          <Cloud className="w-6 h-6 text-orange-600" />
          <div>
            <h2 className="font-heading font-bold text-lg">Cloudflare R2 Depolama</h2>
            <p className="text-sm text-muted-foreground">Fatura ve evrak dosyalarının saklanacağı bulut depolama</p>
          </div>
          {settings.configured && (
            <span className="ml-auto px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Yapılandırıldı
            </span>
          )}
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">Account ID</Label>
              <Input
                value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 border-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">Cloudflare Dashboard URL&apos;sinde bulunur</p>
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
                  placeholder={settings.configured ? settings.secret_access_key_masked : "Yeni secret key girin"}
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
          
          {/* Test Result */}
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
              {testResult.success && testResult.bucket && (
                <p className="text-sm text-green-600 mt-1">Bucket: {testResult.bucket}</p>
              )}
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
        
        {/* Instructions */}
        <div className="bg-slate-50 px-6 py-4 border-t-2 border-border">
          <h3 className="font-semibold text-sm mb-2">Nasıl Yapılandırılır?</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Cloudflare Dashboard'a gidin → R2 Object Storage</li>
            <li>Yeni bucket oluşturun (örn: shiftjet)</li>
            <li>Manage R2 API Tokens → Create API Token</li>
            <li>Object Read & Write izni verin</li>
            <li>Oluşturulan Access Key ve Secret Key'i buraya girin</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// ============ ŞİRKETLER PAGE ============
function SirketlerPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", logo_url: "" });
  const [newSuperAdmin, setNewSuperAdmin] = useState({ name: "", username: "", password: "" });
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });
  const [editAdminData, setEditAdminData] = useState({ name: "", password: "" });
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API}/companies`);
      setCompanies(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Şirketler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanyAdmins = async (companyId) => {
    setAdminsLoading(true);
    try {
      const res = await axios.get(`${API}/admins?company_id=${companyId}`);
      setCompanyAdmins(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Yöneticiler yüklenemedi");
      }
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleAddCompany = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/companies`, newCompany);
      toast.success("Şirket oluşturuldu");
      setShowAddModal(false);
      setNewCompany({ name: "", logo_url: "" });
      fetchCompanies();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Oluşturma başarısız");
      }
    }
  };

  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/companies/${selectedCompany.id}`, {
        name: selectedCompany.name,
        logo_url: selectedCompany.logo_url
      });
      toast.success("Şirket güncellendi");
      setShowEditModal(false);
      fetchCompanies();
    } catch (err) {
      if (!err.handled) {
        toast.error("Güncelleme başarısız");
      }
    }
  };

  const handleDeleteCompany = async (id) => {
    setConfirmConfig({
      title: "Şirket Silme",
      description: "Bu şirketi ve tüm verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/companies/${id}`);
          toast.success("Şirket silindi");
          fetchCompanies();
        } catch (err) {
          if (!err.handled) {
            toast.error("Silme başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleAddSuperAdmin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admins/superadmin`, {
        ...newSuperAdmin,
        company_id: selectedCompany.id
      });
      toast.success("Süper admin oluşturuldu");
      setShowSuperAdminModal(false);
      setNewSuperAdmin({ name: "", username: "", password: "" });
      fetchCompanyAdmins(selectedCompany.id);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Oluşturma başarısız");
      }
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admins`, {
        ...newAdmin,
        company_id: selectedCompany.id
      });
      toast.success("Yönetici eklendi");
      setShowAddAdminModal(false);
      setNewAdmin({ name: "", username: "", password: "" });
      fetchCompanyAdmins(selectedCompany.id);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Ekleme başarısız");
      }
    }
  };

  const handleDeleteAdmin = async (adminId) => {
    setConfirmConfig({
      title: "Yönetici Silme",
      description: "Bu yöneticiyi silmek istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/admins/${adminId}`);
          toast.success("Yönetici silindi");
          fetchCompanyAdmins(selectedCompany.id);
        } catch (err) {
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "Silme başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleEditAdmin = async (e) => {
    e.preventDefault();
    try {
      const updateData = {};
      if (editAdminData.name) updateData.name = editAdminData.name;
      if (editAdminData.password) updateData.password = editAdminData.password;
      
      await axios.put(`${API}/admins/${selectedAdmin.id}`, updateData);
      toast.success("Yönetici güncellendi");
      setShowEditAdminModal(false);
      setEditAdminData({ name: "", password: "" });
      fetchCompanyAdmins(selectedCompany.id);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Güncelleme başarısız");
      }
    }
  };

  const openEditAdminModal = (admin) => {
    setSelectedAdmin(admin);
    setEditAdminData({ name: admin.name, password: "" });
    setShowEditAdminModal(true);
  };

  const openEditModal = (company) => {
    setSelectedCompany({ ...company });
    setShowEditModal(true);
  };

  const openAdminsModal = (company) => {
    setSelectedCompany(company);
    setShowAdminsModal(true);
    fetchCompanyAdmins(company.id);
  };

  const openSuperAdminModal = () => {
    setShowSuperAdminModal(true);
  };

  const openAddAdminModal = () => {
    setShowAddAdminModal(true);
  };

  const hasSuperAdmin = companyAdmins.some(a => a.role === "superadmin");

  if (loading) return <PageLoading />;

  return (
    <div data-testid="system-sirketler-page">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Şirketler</h2>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-company-btn">
          <Plus className="w-4 h-4 mr-2" />
          Şirket Ekle
        </Button>
      </div>

      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold text-xs">Logo</TableHead>
              <TableHead className="font-bold text-xs">Şirket Adı</TableHead>
              <TableHead className="font-bold text-xs">Oluşturulma</TableHead>
              <TableHead className="font-bold text-xs">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Kayıtlı şirket bulunmuyor</TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow key={c.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell>
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.name} className="h-10 w-20 object-contain" />
                    ) : (
                      <div className="h-10 w-20 bg-slate-100 flex items-center justify-center text-xs text-muted-foreground">Logo Yok</div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{new Date(c.created_at).toLocaleDateString('tr-TR')}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(c)} className="h-8 px-3 border-2" data-testid={`edit-${c.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openAdminsModal(c)} className="h-8 px-3 border-2" data-testid={`admins-${c.id}`}>
                        <Users className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteCompany(c.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`delete-${c.id}`}>
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

      <div className="md:hidden space-y-4">
        {companies.length === 0 ? (
          <div className="border-2 border-border p-6 bg-white text-center text-muted-foreground">Kayıtlı şirket bulunmuyor</div>
        ) : (
          companies.map((c) => (
            <div key={c.id} className="border-2 border-border p-4 bg-white">
              <div className="flex items-start gap-4 mb-3">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="h-12 w-24 object-contain" />
                ) : (
                  <div className="h-12 w-24 bg-slate-100 flex items-center justify-center text-xs text-muted-foreground">Logo Yok</div>
                )}
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditModal(c)} className="flex-1 border-2">Düzenle</Button>
                <Button size="sm" variant="outline" onClick={() => openAdminsModal(c)} className="flex-1 border-2">Yöneticiler</Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteCompany(c.id)} className="border-2">Sil</Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Şirket Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompany} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Şirket Adı</Label>
              <Input data-testid="new-company-name" value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} className="mt-1 h-12 border-2" required />
            </div>
            <div>
              <Label className="text-sm font-semibold">Logo URL (Opsiyonel)</Label>
              <Input data-testid="new-company-logo" value={newCompany.logo_url} onChange={(e) => setNewCompany({ ...newCompany, logo_url: e.target.value })} className="mt-1 h-12 border-2" placeholder="https://..." />
            </div>
            <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-new-company">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Şirket Düzenle</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleUpdateCompany} className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Şirket Adı</Label>
                <Input value={selectedCompany.name} onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Logo URL</Label>
                <Input value={selectedCompany.logo_url || ""} onChange={(e) => setSelectedCompany({ ...selectedCompany, logo_url: e.target.value })} className="mt-1 h-12 border-2" placeholder="https://..." />
              </div>
              {selectedCompany.logo_url && (
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Önizleme</Label>
                  <img src={selectedCompany.logo_url} alt="Logo" className="h-16 object-contain border p-2" />
                </div>
              )}
              <Button type="submit" className="w-full h-12 font-semibold">Kaydet</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Company Admins Modal */}
      <Dialog open={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{selectedCompany?.name} - Yöneticiler</DialogTitle>
          </DialogHeader>
          {adminsLoading ? (
            <div className="py-8"><LoadingSpinner size="default" /></div>
          ) : (
            <div className="space-y-4">
              {companyAdmins.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed">
                  Bu şirkete henüz yönetici atanmamış
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {companyAdmins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 border-2 border-border">
                      <div>
                        <p className="font-semibold">{admin.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">{admin.username}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-semibold ${admin.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"}`}>
                          {admin.role === "superadmin" ? "Süper Admin" : "Admin"}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => openEditAdminModal(admin)} className="h-8 px-2 border-2">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(admin.id)} className="h-8 px-2 border-2 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2 pt-2 border-t">
                {!hasSuperAdmin && (
                  <Button onClick={openSuperAdminModal} className="flex-1 font-semibold" data-testid="add-superadmin-btn">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Süper Admin Ekle
                  </Button>
                )}
                <Button onClick={openAddAdminModal} variant={hasSuperAdmin ? "default" : "outline"} className="flex-1 font-semibold" data-testid="add-admin-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Admin Ekle
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Super Admin Modal */}
      <Dialog open={showSuperAdminModal} onOpenChange={setShowSuperAdminModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Süper Admin Ekle</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleAddSuperAdmin} className="space-y-4">
              <p className="text-sm text-muted-foreground"><strong>{selectedCompany.name}</strong> için süper admin oluşturun</p>
              <div>
                <Label className="text-sm font-semibold">İsim Soyisim</Label>
                <Input data-testid="superadmin-name" value={newSuperAdmin.name} onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, name: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Kullanıcı Adı</Label>
                <Input data-testid="superadmin-username" value={newSuperAdmin.username} onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, username: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Şifre</Label>
                <Input data-testid="superadmin-password" type="password" value={newSuperAdmin.password} onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, password: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-superadmin">Oluştur</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Admin Modal */}
      <Dialog open={showAddAdminModal} onOpenChange={setShowAddAdminModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Admin Ekle</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <p className="text-sm text-muted-foreground"><strong>{selectedCompany.name}</strong> için admin oluşturun</p>
              <div>
                <Label className="text-sm font-semibold">İsim Soyisim</Label>
                <Input data-testid="admin-name" value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Kullanıcı Adı</Label>
                <Input data-testid="admin-username" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Şifre</Label>
                <Input data-testid="admin-password" type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-admin">Ekle</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Admin Modal */}
      <Dialog open={showEditAdminModal} onOpenChange={setShowEditAdminModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yönetici Düzenle</DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <form onSubmit={handleEditAdmin} className="space-y-4">
              <p className="text-sm text-muted-foreground"><strong>{selectedAdmin.username}</strong> bilgilerini düzenleyin</p>
              <div>
                <Label className="text-sm font-semibold">İsim Soyisim</Label>
                <Input value={editAdminData.name} onChange={(e) => setEditAdminData({ ...editAdminData, name: e.target.value })} className="mt-1 h-12 border-2" required />
              </div>
              <div>
                <Label className="text-sm font-semibold">Yeni Şifre (boş bırakılırsa değişmez)</Label>
                <Input type="password" value={editAdminData.password} onChange={(e) => setEditAdminData({ ...editAdminData, password: e.target.value })} className="mt-1 h-12 border-2" placeholder="Yeni şifre" />
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
        variant="danger"
      />
    </div>
  );
}

export default function SystemDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { path: "/system/ayarlar", label: "Sistem Ayarları", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50" data-testid="system-dashboard">
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <span className="font-heading text-lg font-bold">Sistem Yönetimi</span>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10" data-testid="system-mobile-menu-btn">
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
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-white/10 text-left" data-testid="system-mobile-logout-btn">
            <LogOut className="w-5 h-5" />
            Çıkış
          </button>
        </nav>
      )}

      <div className="flex">
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
          <div className="p-6 border-b border-white/20">
            <h1 className="font-heading text-xl font-bold">Sistem Yönetimi</h1>
            <p className="text-white/60 text-sm mt-1">Ana Kontrol Paneli</p>
            <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
          </div>
          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-6 py-3 text-sm font-semibold transition-colors ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"}`}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-white/20">
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-white hover:bg-white/10 font-semibold text-sm" data-testid="system-logout-btn">
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-auto">
          <div className="p-4 md:p-8 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<SirketlerPage />} />
              <Route path="ayarlar" element={<SistemAyarlariPage />} />
            </Routes>
          </div>
          
          {/* Footer */}
          <footer className="bg-white border-t py-3 text-center text-xs text-muted-foreground">
            © 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.
          </footer>
        </main>
      </div>
    </div>
  );
}
