import { useState, useEffect } from "react";
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
import { Menu, X, LogOut, Building2, Trash2, Plus, Edit, Users, Settings, Cloud, CheckCircle, XCircle, Loader2, Eye, EyeOff, UserCog } from "lucide-react";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ============ ŞİRKETLER PAGE (Sadece Şirket CRUD) ============
function SirketlerPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [newCompany, setNewCompany] = useState({ name: "", logo_url: "" });
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

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

  const handleAddCompany = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/companies`, newCompany);
      toast.success("Şirket oluşturuldu");
      setShowAddModal(false);
      setNewCompany({ name: "", logo_url: "" });
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Oluşturma başarısız");
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

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Şirketler</h1>
          <p className="text-muted-foreground text-sm">Sistemdeki tüm şirketleri yönetin</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-company-btn">
          <Plus className="w-4 h-4 mr-2" />
          Şirket Ekle
        </Button>
      </div>

      <div className="bg-white border-2 border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Logo</TableHead>
              <TableHead className="font-bold">Şirket Adı</TableHead>
              <TableHead className="font-bold">Oluşturma Tarihi</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                    {new Date(company.created_at).toLocaleDateString('tr-TR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
                placeholder="Örn: ShiftJet İstanbul"
                required 
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Logo URL (opsiyonel)</Label>
              <Input 
                value={newCompany.logo_url} 
                onChange={(e) => setNewCompany({ ...newCompany, logo_url: e.target.value })} 
                className="mt-1 h-12 border-2" 
                placeholder="https://..."
              />
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
                <Label className="text-sm font-semibold">Logo URL</Label>
                <Input 
                  value={selectedCompany.logo_url || ""} 
                  onChange={(e) => setSelectedCompany({ ...selectedCompany, logo_url: e.target.value })} 
                  className="mt-1 h-12 border-2" 
                  placeholder="https://..."
                />
              </div>
              {selectedCompany.logo_url && (
                <div className="p-3 bg-slate-50 border-2">
                  <p className="text-xs text-muted-foreground mb-2">Önizleme:</p>
                  <img src={selectedCompany.logo_url} alt="Logo" className="h-16 object-contain" />
                </div>
              )}
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Yöneticiler</h1>
          <p className="text-muted-foreground text-sm">Tüm yöneticileri ve şirket erişimlerini yönetin</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-admin-btn">
          <Plus className="w-4 h-4 mr-2" />
          Yönetici Ekle
        </Button>
      </div>

      <div className="bg-white border-2 border-border overflow-hidden">
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Kuryeler</h1>
          <p className="text-muted-foreground text-sm">Sistemdeki tüm kurye hesaplarını görüntüleyin</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="İsim veya telefon ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 border-2"
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

      <div className="bg-white border-2 border-border overflow-hidden">
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
        secret_access_key: "",
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

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Sistem Ayarları</h1>
        <p className="text-muted-foreground text-sm">Cloudflare R2 depolama yapılandırması</p>
      </div>

      <div className="bg-white border-2 border-border overflow-hidden">
        <div className="p-6 border-b-2 border-border flex items-center gap-3">
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
        
        <form onSubmit={handleSave} className="p-6 space-y-4">
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
    </div>
  );
}


// ============ MAIN DASHBOARD ============
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
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-white hover:bg-white/10 font-semibold text-sm">
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-auto">
          <div className="p-4 md:p-8 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<SirketlerPage />} />
              <Route path="yoneticiler" element={<YoneticilerPage />} />
              <Route path="ayarlar" element={<SistemAyarlariPage />} />
            </Routes>
          </div>
          
          <footer className="bg-white border-t py-3 text-center text-xs text-muted-foreground">
            © 2026 ShiftJet. Tüm hakları saklıdır.
          </footer>
        </main>
      </div>
    </div>
  );
}
