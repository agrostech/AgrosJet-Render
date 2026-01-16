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
import { Menu, X, LogOut, Clock, FileText, Package, Users, UserCog, Trash2, Settings, Search, UserPlus, ChevronLeft, ChevronRight, LayoutDashboard, Pencil } from "lucide-react";
import { useSessionCheck } from "@/hooks/useSessionCheck";
import VardiyaPage from "./VardiyaPage";
import GuncelDurumPage from "./GuncelDurumPage";
import MuhasebePage from "./MuhasebePage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function ZimmetPage() {
  return (
    <div data-testid="admin-zimmet-page">
      <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">Zimmet</h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Zimmet takibi içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

function KuryelerPage({ companyId }) {
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchCouriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSearch = async () => {
    if (!searchPhone.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await axios.get(`${API}/couriers/search?phone=${searchPhone}`);
      setSearchResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye bulunamadı");
    } finally {
      setSearching(false);
    }
  };

  const handleAddCourier = async () => {
    try {
      await axios.post(`${API}/companies/${companyId}/couriers`, { phone: searchPhone });
      toast.success("Kurye şirkete eklendi");
      setShowAddModal(false);
      setSearchPhone("");
      setSearchResult(null);
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ekleme başarısız");
    }
  };

  const handleRemove = async (courierId) => {
    // Önce bakiye kontrolü yap
    try {
      const balanceRes = await axios.get(`${API}/transactions/courier/${courierId}`);
      const balance = balanceRes.data.balance;
      
      if (balance !== 0) {
        const balanceText = balance > 0 
          ? `Bu kuryeye ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance))} borcunuz var.`
          : `Bu kuryeden ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance))} alacağınız var.`;
        
        toast.error(`Kurye silinemez! ${balanceText} Önce bakiyeyi sıfırlayın.`);
        return;
      }
    } catch (err) {
      // Bakiye alınamazsa devam et
    }
    
    if (!window.confirm("Bu kuryeyi şirketten çıkarmak istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/companies/${companyId}/couriers/${courierId}`);
      toast.success("Kurye şirketten çıkarıldı");
      fetchCouriers();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const openDetailModal = (courier) => {
    setSelectedCourier(courier);
    setShowDetailModal(true);
  };

  // Filtreleme
  const filteredCouriers = couriers.filter(c => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    return c.name.toLowerCase().includes(query) || c.plate.toLowerCase().includes(query);
  });

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-kuryeler-page">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Kuryeler</h2>
        <div className="flex gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="İsim veya plaka ara..." 
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-10 h-10 border-2"
              data-testid="filter-couriers-input"
            />
          </div>
          <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-courier-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            Kurye Ekle
          </Button>
        </div>
      </div>

      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold text-xs">İsim</TableHead>
              <TableHead className="font-bold text-xs">Telefon</TableHead>
              <TableHead className="font-bold text-xs">Plaka</TableHead>
              <TableHead className="font-bold text-xs text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCouriers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {filterQuery ? "Arama sonucu bulunamadı" : "Kayıtlı kurye bulunmuyor"}
                </TableCell>
              </TableRow>
            ) : (
              filteredCouriers.map((c) => (
                <TableRow key={c.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="font-mono text-sm">{c.plate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openDetailModal(c)} className="h-8 px-3 border-2" data-testid={`detail-${c.id}`}>
                        Detaylar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRemove(c.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`remove-${c.id}`}>
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
        {filteredCouriers.length === 0 ? (
          <div className="border-2 border-border p-6 bg-white text-center text-muted-foreground">
            {filterQuery ? "Arama sonucu bulunamadı" : "Kayıtlı kurye bulunmuyor"}
          </div>
        ) : (
          filteredCouriers.map((c) => (
            <div key={c.id} className="border-2 border-border p-4 bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{c.phone}</p>
                </div>
              </div>
              <p className="text-sm mb-3"><span className="text-muted-foreground">Plaka:</span> <span className="font-mono">{c.plate}</span></p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openDetailModal(c)} className="flex-1 border-2">Detaylar</Button>
                <Button size="sm" variant="outline" onClick={() => handleRemove(c.id)} className="border-2 hover:bg-red-50 hover:text-red-600">Çıkar</Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Kurye Ekle Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Kurye Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Telefon numarası ile kurye arayın ve şirketinize ekleyin</p>
            <div className="flex gap-2">
              <Input data-testid="search-phone-input" placeholder="05XXXXXXXXX" value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} className="h-12 border-2 font-mono" />
              <Button onClick={handleSearch} disabled={searching} className="h-12 px-6" data-testid="search-courier-btn">
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {searchResult && (
              <div className="border-2 border-border p-4 bg-slate-50">
                <p className="font-bold">{searchResult.name}</p>
                <p className="font-mono text-sm text-muted-foreground">{searchResult.phone}</p>
                <p className="text-sm mt-1">Plaka: <span className="font-mono">{searchResult.plate}</span></p>
                <Button onClick={handleAddCourier} className="w-full mt-4 font-semibold" data-testid="confirm-add-courier-btn">Şirkete Ekle</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Kurye Detay Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Kurye Detayları</DialogTitle>
          </DialogHeader>
          {selectedCourier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">İsim Soyisim</p>
                  <p className="font-semibold">{selectedCourier.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefon</p>
                  <p className="font-mono">{selectedCourier.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plaka</p>
                  <p className="font-mono">{selectedCourier.plate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kayıt Tarihi</p>
                  <p className="font-mono text-sm">{new Date(selectedCourier.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Adres</p>
                <p className="text-sm">{selectedCourier.address}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">İban</p>
                <p className="font-mono text-sm break-all">{selectedCourier.iban}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YoneticilerPage({ companyId }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });
  const [editData, setEditData] = useState({ name: "", username: "", password: "" });
  const [editLoading, setEditLoading] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${API}/admins?company_id=${companyId}`);
      setAdmins(res.data);
    } catch (err) {
      toast.error("Yöneticiler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admins`, { ...newAdmin, company_id: companyId });
      toast.success("Yönetici eklendi");
      setShowAddModal(false);
      setNewAdmin({ name: "", username: "", password: "" });
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ekleme başarısız");
    }
  };

  const handleUpdatePermissions = async () => {
    try {
      await axios.put(`${API}/admins/${selectedAdmin.id}/permissions`, { permissions: selectedAdmin.permissions });
      toast.success("Yetkiler güncellendi");
      setShowPermModal(false);
      fetchAdmins();
    } catch (err) {
      toast.error("Güncelleme başarısız");
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("Bu yöneticiyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/admins/${id}`);
      toast.success("Yönetici silindi (oturumu kapatıldı)");
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  const openPermModal = (admin) => {
    setSelectedAdmin({ ...admin });
    setShowPermModal(true);
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setEditData({ name: admin.name, username: admin.username, password: "" });
    setShowEditModal(true);
  };

  const handleEditAdmin = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const updatePayload = {};
      if (editData.name && editData.name !== selectedAdmin.name) {
        updatePayload.name = editData.name;
      }
      if (editData.password) {
        updatePayload.password = editData.password;
      }
      
      if (Object.keys(updatePayload).length === 0) {
        toast.error("Değişiklik yapılmadı");
        setEditLoading(false);
        return;
      }

      const res = await axios.put(`${API}/admins/${selectedAdmin.id}`, updatePayload);
      
      if (res.data.password_changed) {
        toast.success("Yönetici güncellendi. Şifre değiştiği için oturumu kapatıldı.");
      } else {
        toast.success("Yönetici güncellendi");
      }
      
      setShowEditModal(false);
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setEditLoading(false);
    }
  };

  const togglePermission = (key) => {
    setSelectedAdmin({
      ...selectedAdmin,
      permissions: { ...selectedAdmin.permissions, [key]: !selectedAdmin.permissions[key] },
    });
  };

  const permissionLabels = {
    vardiya: "Vardiya",
    muhasebe: "Muhasebe",
    zimmet: "Zimmet",
    kuryeler: "Kuryeler",
    yoneticiler: "Yöneticiler"
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-yoneticiler-page">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Yöneticiler</h2>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-admin-btn">Yönetici Ekle</Button>
      </div>

      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold text-xs">İsim</TableHead>
              <TableHead className="font-bold text-xs">Kullanıcı Adı</TableHead>
              <TableHead className="font-bold text-xs">Rol</TableHead>
              <TableHead className="font-bold text-xs">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.id} className="border-b border-border hover:bg-slate-50">
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="font-mono text-sm">{a.username}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs font-semibold ${a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"}`}>
                    {a.role === "superadmin" ? "Süper Admin" : "Admin"}
                  </span>
                </TableCell>
                <TableCell>
                  {a.role !== "superadmin" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(a)} className="h-8 px-3 border-2 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-admin-${a.id}`} title="Düzenle">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="h-8 px-3 border-2" data-testid={`perm-${a.id}`} title="Yetkiler">
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`delete-admin-${a.id}`} title="Sil">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4">
        {admins.map((a) => (
          <div key={a.id} className="border-2 border-border p-4 bg-white">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold">{a.name}</p>
                <p className="font-mono text-sm text-muted-foreground">{a.username}</p>
              </div>
              <span className={`px-2 py-1 text-xs font-semibold ${a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"}`}>
                {a.role === "superadmin" ? "Süper Admin" : "Admin"}
              </span>
            </div>
            {a.role !== "superadmin" && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditModal(a)} className="flex-1 border-2">Düzenle</Button>
                <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="flex-1 border-2">Yetkiler</Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="border-2">Sil</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Yönetici Düzenleme Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Yönetici Düzenle
            </DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <form onSubmit={handleEditAdmin} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded border">
                <p className="text-xs text-muted-foreground">Düzenlenen Yönetici</p>
                <p className="font-semibold">{selectedAdmin.name}</p>
                <p className="text-sm text-muted-foreground font-mono">{selectedAdmin.username}</p>
              </div>
              
              <div>
                <Label className="text-sm font-semibold">İsim Soyisim</Label>
                <Input 
                  data-testid="edit-admin-name"
                  value={editData.name} 
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })} 
                  className="mt-1 h-11 border-2" 
                  placeholder="Değiştirmek istemiyorsanız boş bırakın"
                />
              </div>
              
              <div>
                <Label className="text-sm font-semibold">Yeni Şifre</Label>
                <Input 
                  data-testid="edit-admin-password"
                  type="password" 
                  value={editData.password} 
                  onChange={(e) => setEditData({ ...editData, password: e.target.value })} 
                  className="mt-1 h-11 border-2" 
                  placeholder="Değiştirmek istemiyorsanız boş bırakın"
                />
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
                <strong>Not:</strong> Şifre değiştirildiğinde bu yöneticinin aktif oturumu kapatılacaktır.
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-11 font-semibold" 
                disabled={editLoading}
                data-testid="submit-edit-admin"
              >
                {editLoading ? "Güncelleniyor..." : "Kaydet"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yönetici Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">İsim Soyisim</Label>
              <Input data-testid="new-admin-name" value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} className="mt-1 h-12 border-2" required />
            </div>
            <div>
              <Label className="text-sm font-semibold">Kullanıcı Adı</Label>
              <Input data-testid="new-admin-username" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} className="mt-1 h-12 border-2" required />
            </div>
            <div>
              <Label className="text-sm font-semibold">Şifre</Label>
              <Input data-testid="new-admin-password" type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} className="mt-1 h-12 border-2" required />
            </div>
            <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-new-admin">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPermModal} onOpenChange={setShowPermModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yetki Ayarları</DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedAdmin.name} için yetkileri ayarlayın</p>
              <div className="space-y-3">
                {Object.entries(selectedAdmin.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox id={key} checked={value} onCheckedChange={() => togglePermission(key)} disabled={key === "yoneticiler"} data-testid={`perm-checkbox-${key}`} />
                    <Label htmlFor={key} className="text-sm font-medium">{permissionLabels[key] || key}</Label>
                  </div>
                ))}
              </div>
              <Button onClick={handleUpdatePermissions} className="w-full h-12 font-semibold" data-testid="save-permissions-btn">Kaydet</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({ username: "", password: "", confirmPassword: "", currentPassword: "" });
  const [profileLoading, setProfileLoading] = useState(false);

  useSessionCheck();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== "admin" && parsed.role !== "superadmin") {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  const openProfileModal = () => {
    setProfileData({ username: user.username, password: "", confirmPassword: "", currentPassword: "" });
    setShowProfileModal(true);
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    
    if (profileData.password && profileData.password !== profileData.confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor");
      return;
    }
    
    if (!profileData.currentPassword) {
      toast.error("Mevcut şifrenizi girin");
      return;
    }

    setProfileLoading(true);
    try {
      const payload = {
        current_password: profileData.currentPassword
      };
      
      if (profileData.username !== user.username) {
        payload.username = profileData.username;
      }
      if (profileData.password) {
        payload.password = profileData.password;
      }
      
      const res = await axios.put(`${API}/profile/${user.id}`, payload);
      
      toast.success("Profil güncellendi");
      setShowProfileModal(false);
      
      if (res.data.requires_relogin) {
        toast.info("Bilgileriniz değişti. Yeniden giriş yapmanız gerekiyor.");
        setTimeout(() => {
          localStorage.removeItem("user");
          navigate("/login");
        }, 1500);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setProfileLoading(false);
    }
  };

  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";
  const permissions = user.permissions || {};
  const company = user.company;

  const NAV_ITEMS = [
    { path: "/admin", label: "Güncel Durum", icon: LayoutDashboard, key: "guncel" },
    { path: "/admin/vardiyalar", label: "Vardiyalar", icon: Clock, key: "vardiya" },
    { path: "/admin/muhasebe", label: "Muhasebe", icon: FileText, key: "muhasebe" },
    { path: "/admin/zimmet", label: "Zimmet", icon: Package, key: "zimmet" },
    { path: "/admin/kuryeler", label: "Kuryeler", icon: Users, key: "kuryeler" },
    { path: "/admin/yoneticiler", label: "Yöneticiler", icon: UserCog, key: "yoneticiler" },
  ].filter((item) => isSuperAdmin || permissions[item.key]);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-dashboard">
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
          ) : (
            <span className="font-heading text-lg font-bold">{company?.name}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10" data-testid="admin-mobile-menu-btn">
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
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-white/10 text-left" data-testid="admin-mobile-logout-btn">
            <LogOut className="w-5 h-5" />
            Çıkış
          </button>
        </nav>
      )}

      <div className="flex">
        <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-primary text-white transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
          <div className={`p-4 border-b border-white/20 ${sidebarCollapsed ? 'px-2' : ''}`}>
            {!sidebarCollapsed && (
              <>
                {company?.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="h-8 mb-2 object-contain" />
                ) : (
                  <h1 className="font-heading text-lg font-bold truncate">{company?.name}</h1>
                )}
                <p className="text-white/60 text-xs mt-1">{isSuperAdmin ? "Süper Admin" : "Admin"}</p>
                <p className="text-white/80 text-xs font-mono mt-1 truncate">{user.name}</p>
              </>
            )}
          </div>
          <nav className="flex-1 py-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"} ${sidebarCollapsed ? 'justify-center px-2' : ''}`} 
                data-testid={`admin-nav-${item.key}`}
                title={sidebarCollapsed ? item.label : ''}
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
              data-testid="sidebar-toggle-btn"
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              onClick={openProfileModal} 
              className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
              data-testid="profile-btn"
              title={sidebarCollapsed ? 'Profil Ayarları' : ''}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="ml-2">Profil Ayarları</span>}
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              className={`w-full text-white hover:bg-white/10 font-semibold text-sm py-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-4'}`} 
              data-testid="admin-logout-btn"
              title={sidebarCollapsed ? 'Çıkış Yap' : ''}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="ml-2">Çıkış Yap</span>}
            </Button>
          </div>
        </aside>

        <main className={`flex-1 p-4 md:p-6 pb-16 overflow-x-auto transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
          <Routes>
            <Route index element={<GuncelDurumPage companyId={user.company_id} />} />
            <Route path="vardiyalar" element={<VardiyaPage companyId={user.company_id} />} />
            <Route path="muhasebe" element={<MuhasebePage companyId={user.company_id} adminId={user.id} adminName={user.name || user.username} companyLogo={company?.logo_url} companyName={company?.name} />} />
            <Route path="zimmet" element={<ZimmetPage />} />
            <Route path="kuryeler" element={<KuryelerPage companyId={user.company_id} />} />
            {(isSuperAdmin || permissions.yoneticiler) && (
              <Route path="yoneticiler" element={<YoneticilerPage companyId={user.company_id} />} />
            )}
          </Routes>
        </main>
      </div>

      {/* Footer */}
      <footer className={`fixed bottom-0 right-0 bg-white border-t py-2 text-center text-xs text-muted-foreground transition-all duration-300 z-30 ${sidebarCollapsed ? 'lg:left-16' : 'lg:left-56'} left-0`}>
        © 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.
      </footer>

      {/* Profil Ayarları Modal */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Profil Ayarları
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded border">
              <p className="text-xs text-muted-foreground">Giriş yapmış kullanıcı</p>
              <p className="font-semibold">{user.name}</p>
              <p className="text-sm text-muted-foreground font-mono">{user.username}</p>
            </div>
            
            <div>
              <Label className="text-sm font-semibold">Yeni Kullanıcı Adı</Label>
              <Input 
                data-testid="profile-username"
                value={profileData.username} 
                onChange={(e) => setProfileData({ ...profileData, username: e.target.value })} 
                className="mt-1 h-11 border-2" 
                placeholder="Değiştirmek istemiyorsanız boş bırakın"
              />
            </div>
            
            <div>
              <Label className="text-sm font-semibold">Yeni Şifre</Label>
              <Input 
                data-testid="profile-new-password"
                type="password" 
                value={profileData.password} 
                onChange={(e) => setProfileData({ ...profileData, password: e.target.value })} 
                className="mt-1 h-11 border-2" 
                placeholder="Değiştirmek istemiyorsanız boş bırakın"
              />
            </div>
            
            {profileData.password && (
              <div>
                <Label className="text-sm font-semibold">Yeni Şifre (Tekrar)</Label>
                <Input 
                  data-testid="profile-confirm-password"
                  type="password" 
                  value={profileData.confirmPassword} 
                  onChange={(e) => setProfileData({ ...profileData, confirmPassword: e.target.value })} 
                  className="mt-1 h-11 border-2" 
                  placeholder="Yeni şifreyi tekrar girin"
                />
              </div>
            )}
            
            <div className="border-t pt-4">
              <Label className="text-sm font-semibold text-orange-600">Mevcut Şifre (Zorunlu)</Label>
              <Input 
                data-testid="profile-current-password"
                type="password" 
                value={profileData.currentPassword} 
                onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })} 
                className="mt-1 h-11 border-2 border-orange-200" 
                placeholder="Değişiklikleri onaylamak için mevcut şifrenizi girin"
                required
              />
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
              <strong>Not:</strong> Kullanıcı adı veya şifre değiştirildiğinde güvenlik nedeniyle yeniden giriş yapmanız istenecektir.
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-11 font-semibold" 
              disabled={profileLoading}
              data-testid="profile-submit-btn"
            >
              {profileLoading ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
