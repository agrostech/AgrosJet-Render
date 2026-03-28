import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Trash2, Pencil, Shield, Clock, Calculator, Package, Users, ShoppingBag, GraduationCap, SlidersHorizontal, Link2, Unlink, FileText, BarChart3, ChevronDown, ChevronUp, ClipboardList, Wallet, Bike, Store, UserCog, FileSpreadsheet, Receipt, History } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// İzin tanımları
const PERMISSION_ITEMS = [
  { key: "vardiya", label: "Vardiyalar", icon: Clock },
  { 
    key: "muhasebe", label: "Muhasebe", icon: Calculator,
    subItems: [
      { key: "muhasebe_kuryeler", label: "Kuryeler", icon: Users },
      { key: "muhasebe_isletmeler", label: "Restoranlar", icon: Store },
      { key: "muhasebe_cariler", label: "Cariler", icon: Wallet },
      { key: "muhasebe_kurye_mutabakat", label: "Kurye Mütabakat", icon: Bike },
      { key: "muhasebe_restoran_mutabakat", label: "Restoran Mütabakat", icon: Store },
      { key: "muhasebe_yonetici_mutabakat", label: "Yönetici Mütabakat", icon: UserCog },
      { key: "muhasebe_haftalik_hakedis", label: "Haftalık Hakediş", icon: FileSpreadsheet },
      { key: "muhasebe_kurye_faturalari", label: "Kurye Faturaları", icon: Receipt },
      { key: "muhasebe_isletme_faturalari", label: "Restoran Faturaları", icon: Receipt },
      { key: "muhasebe_hareketler", label: "Hareketler", icon: History },
    ]
  },
  { key: "raporlar", label: "Raporlar", icon: BarChart3 },
  { key: "zimmet", label: "Zimmet", icon: Package },
  { key: "kuryeler", label: "Kuryeler", icon: Users },
  { key: "market", label: "Market", icon: ShoppingBag },
  { key: "akademi", label: "Akademi", icon: GraduationCap },
  { key: "basvurular", label: "Başvurular", icon: FileText },
  { key: "sistem", label: "Sistem Ayarları", icon: SlidersHorizontal },
];

// Sipariş alt izinleri (ana sekmede değil, ayrı kontrol)
const SIPARIS_SUB_ITEMS = [
  { key: "siparis_gecmis", label: "Geçmiş Siparişler", icon: ClipboardList },
  { key: "siparis_iptal", label: "İptal Siparişler", icon: ClipboardList },
];

export default function YoneticilerPage({ companyId }) {
  const [admins, setAdmins] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [permissionsData, setPermissionsData] = useState({});
  const [permLoading, setPermLoading] = useState(false);
  const [expandedPerms, setExpandedPerms] = useState(new Set());
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });
  const [editData, setEditData] = useState({ name: "", username: "", password: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [linkData, setLinkData] = useState({ linked_courier_id: "" });
  const [linkLoading, setLinkLoading] = useState(false);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
    } catch (err) {
      console.error("Kuryeler yüklenemedi");
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchAdmins();
      fetchCouriers();
    }
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

  const handleDeleteAdmin = async (id) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDeleteAdmin = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/admins/${pendingDeleteId}`);
      toast.success("Yönetici silindi");
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setEditData({ 
      name: admin.name, 
      username: admin.username, 
      password: ""
    });
    setShowEditModal(true);
  };

  const openLinkModal = (admin) => {
    setSelectedAdmin(admin);
    setLinkData({ linked_courier_id: admin.linked_courier_id || "" });
    setShowLinkModal(true);
  };

  const openPermModal = (admin) => {
    setSelectedAdmin(admin);
    setPermissionsData(admin.permissions || {
      vardiya: true, muhasebe: true, zimmet: true,
      kuryeler: true, market: true, akademi: true, sistem: false
    });
    setShowPermModal(true);
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
        toast.success("Yönetici güncellendi. Şifre değişti.");
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

  const handleLinkCourier = async () => {
    setLinkLoading(true);
    try {
      await axios.put(`${API}/admins/${selectedAdmin.id}`, {
        linked_courier_id: linkData.linked_courier_id || ""
      });
      toast.success(linkData.linked_courier_id ? "Kurye bağlandı" : "Kurye bağlantısı kaldırıldı");
      setShowLinkModal(false);
      fetchAdmins();
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleSavePermissions = async () => {
    setPermLoading(true);
    try {
      await axios.put(`${API}/admins/${selectedAdmin.id}/permissions`, {
        permissions: permissionsData
      });
      toast.success("İzinler güncellendi");
      setShowPermModal(false);
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İzin güncelleme başarısız");
    } finally {
      setPermLoading(false);
    }
  };

  const togglePermission = (key) => {
    setPermissionsData(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Ana sekme kapatıldığında alt sekmeleri de kapat
      const mainItem = PERMISSION_ITEMS.find(p => p.key === key);
      if (mainItem?.subItems && !next[key]) {
        mainItem.subItems.forEach(sub => { next[sub.key] = false; });
      }
      // Ana sekme açıldığında alt sekmeleri de aç
      if (mainItem?.subItems && next[key]) {
        mainItem.subItems.forEach(sub => { next[sub.key] = true; });
      }
      return next;
    });
  };

  const toggleSubPermission = (key) => {
    setPermissionsData(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpandPerm = (key) => {
    setExpandedPerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const enabledCount = PERMISSION_ITEMS.filter(p => permissionsData[p.key]).length;

  if (loading) return <PageLoading />;

  return (
    <div data-testid="admin-yoneticiler-page">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Yöneticiler</h2>
        <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-admin-btn">Yönetici Ekle</Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold text-xs">İsim</TableHead>
              <TableHead className="font-bold text-xs">Kullanıcı Adı</TableHead>
              <TableHead className="font-bold text-xs">Rol</TableHead>
              <TableHead className="font-bold text-xs">Bağlı Kurye</TableHead>
              <TableHead className="font-bold text-xs">Saatlik Ücret</TableHead>
              <TableHead className="font-bold text-xs text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => {
              const linkedCourier = couriers.find(c => c.id === a.linked_courier_id);
              return (
                <TableRow key={a.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="font-mono text-sm">{a.username}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold ${a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"}`}>
                      {a.role === "superadmin" ? "Süper Admin" : "Admin"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {linkedCourier ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        <Link2 className="w-3 h-3" />
                        {linkedCourier.name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {linkedCourier?.hourly_rate ? (
                      <span className="font-mono text-sm">{linkedCourier.hourly_rate} TL</span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.role !== "superadmin" && (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openLinkModal(a)} className="h-8 px-3 border-2 hover:bg-green-50 hover:text-green-600" title="Kurye Bağla">
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="h-8 px-3 border-2 hover:bg-amber-50 hover:text-amber-600" data-testid={`perm-admin-${a.id}`}>
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditModal(a)} className="h-8 px-3 border-2 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-admin-${a.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`delete-admin-${a.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {admins.map((a) => {
          const linkedCourier = couriers.find(c => c.id === a.linked_courier_id);
          return (
            <div key={a.id} className="border-2 border-border p-4 bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold">{a.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{a.username}</p>
                  {linkedCourier && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      {linkedCourier.name}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs font-semibold ${a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"}`}>
                  {a.role === "superadmin" ? "Süper Admin" : "Admin"}
                </span>
              </div>
              {a.role !== "superadmin" && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openLinkModal(a)} className="flex-1 border-2">
                    <Link2 className="w-4 h-4 mr-1" /> Kurye
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="flex-1 border-2">
                    <Shield className="w-4 h-4 mr-1" /> İzinler
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditModal(a)} className="flex-1 border-2">Düzenle</Button>
                  <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="border-2">Sil</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* İzin Modalı */}
      <Dialog open={showPermModal} onOpenChange={setShowPermModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Sayfa İzinleri
            </DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border">
                <p className="text-xs text-muted-foreground">Düzenlenen Yönetici</p>
                <p className="font-semibold">{selectedAdmin.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {enabledCount}/{PERMISSION_ITEMS.length} sayfa erişimi aktif
                </p>
              </div>
              
              <div className="space-y-2">
                {PERMISSION_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const hasSubItems = item.subItems && item.subItems.length > 0;
                  const isExpanded = expandedPerms.has(item.key);
                  const isActive = permissionsData[item.key];
                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isActive ? 'bg-primary/10' : 'bg-slate-100'}`}>
                            <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                          </div>
                          <span className={`font-medium ${!isActive && 'text-muted-foreground'}`}>
                            {item.label}
                          </span>
                          {hasSubItems && isActive && (
                            <button onClick={() => toggleExpandPerm(item.key)} className="ml-auto mr-2 p-1 rounded hover:bg-slate-200 transition-colors" data-testid={`perm-expand-${item.key}`}>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </button>
                          )}
                        </div>
                        <Switch
                          checked={isActive || false}
                          onCheckedChange={() => togglePermission(item.key)}
                          data-testid={`perm-switch-${item.key}`}
                        />
                      </div>
                      {hasSubItems && isActive && isExpanded && (
                        <div className="ml-6 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
                          {item.subItems.map((sub) => {
                            const SubIcon = sub.icon;
                            return (
                              <div key={sub.key} className="flex items-center justify-between py-2 px-2 rounded hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-2">
                                  <SubIcon className={`w-3.5 h-3.5 ${permissionsData[sub.key] ? 'text-primary' : 'text-slate-300'}`} />
                                  <span className={`text-sm ${permissionsData[sub.key] ? 'text-slate-700' : 'text-slate-400'}`}>{sub.label}</span>
                                </div>
                                <Switch
                                  checked={permissionsData[sub.key] || false}
                                  onCheckedChange={() => toggleSubPermission(sub.key)}
                                  className="scale-75"
                                  data-testid={`perm-switch-${sub.key}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Sipariş alt izinleri */}
                <div className="pt-2 border-t mt-2">
                  <p className="text-xs text-muted-foreground font-semibold mb-2 px-3">Sipariş Yönetimi Alt Sayfaları</p>
                  {SIPARIS_SUB_ITEMS.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <div key={sub.key} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${permissionsData[sub.key] ? 'bg-primary/10' : 'bg-slate-100'}`}>
                            <SubIcon className={`w-4 h-4 ${permissionsData[sub.key] ? 'text-primary' : 'text-slate-400'}`} />
                          </div>
                          <span className={`font-medium ${!permissionsData[sub.key] && 'text-muted-foreground'}`}>{sub.label}</span>
                        </div>
                        <Switch
                          checked={permissionsData[sub.key] || false}
                          onCheckedChange={() => toggleSubPermission(sub.key)}
                          data-testid={`perm-switch-${sub.key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <strong>Not:</strong> İzin değişikliklerinin etkili olması için yöneticinin yeniden giriş yapması gerekir.
              </div>
              
              <Button 
                onClick={handleSavePermissions} 
                className="w-full h-11 font-semibold" 
                disabled={permLoading}
                data-testid="save-permissions-btn"
              >
                {permLoading ? "Kaydediliyor..." : "İzinleri Kaydet"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Yönetici Düzenleme Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-base sm:text-lg">
              <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
              Yönetici Düzenle
            </DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <form onSubmit={handleEditAdmin} className="space-y-3 sm:space-y-4">
              <div className="p-2 sm:p-3 bg-slate-50 rounded border">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Düzenlenen Yönetici</p>
                <p className="font-semibold text-sm sm:text-base">{selectedAdmin.name}</p>
                <p className="text-xs sm:text-sm text-muted-foreground font-mono">{selectedAdmin.username}</p>
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm font-semibold">İsim Soyisim</Label>
                <Input data-testid="edit-admin-name" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="mt-1 h-9 sm:h-11 border-2 text-sm" placeholder="Boş bırakın" />
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Yeni Şifre</Label>
                <Input data-testid="edit-admin-password" type="password" value={editData.password} onChange={(e) => setEditData({ ...editData, password: e.target.value })} className="mt-1 h-9 sm:h-11 border-2 text-sm" placeholder="Boş bırakın" />
              </div>
              
              <Button type="submit" className="w-full h-10 sm:h-11 font-semibold text-sm" disabled={editLoading} data-testid="submit-edit-admin">
                {editLoading ? "Güncelleniyor..." : "Kaydet"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Yönetici Ekleme Modal */}
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

      {/* Kurye Bağlama Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Link2 className="w-5 h-5 text-green-500" />
              Kurye Hesabı Bağla
            </DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border">
                <p className="text-xs text-muted-foreground">Yönetici</p>
                <p className="font-semibold">{selectedAdmin.name}</p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <strong>Bilgi:</strong> Kurye hesabı bağlandığında:
                <ul className="mt-1 ml-3 list-disc">
                  <li>Admin aktif olunca kurye pasif olur (ve tersi)</li>
                  <li>Hakediş hesaplamaları birleştirilir</li>
                  <li>Kurye, kuryeler listesinde gizlenir</li>
                </ul>
              </div>
              
              <div>
                <Label className="text-sm font-semibold">Kurye Seçin</Label>
                <Select 
                  value={linkData.linked_courier_id || "none"} 
                  onValueChange={(val) => setLinkData({ linked_courier_id: val === "none" ? "" : val })}
                >
                  <SelectTrigger className="mt-1 h-11 border-2">
                    <SelectValue placeholder="Kurye seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-slate-500">Bağlantı yok</span>
                    </SelectItem>
                    {couriers
                      .filter(c => !c.is_admin_linked || c.id === selectedAdmin.linked_courier_id)
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.is_admin_linked && "(Bağlı)"}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => setShowLinkModal(false)} 
                  className="flex-1 h-11 font-semibold border-2"
                >
                  İptal
                </Button>
                <Button 
                  onClick={handleLinkCourier} 
                  className="flex-1 h-11 font-semibold" 
                  disabled={linkLoading}
                >
                  {linkLoading ? "Kaydediliyor..." : linkData.linked_courier_id ? "Bağla" : "Kaldır"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Silme Onay Modalı */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Yönetici Silme"
        description="Bu yöneticiyi silmek istediğinize emin misiniz?"
        onConfirm={confirmDeleteAdmin}
        variant="danger"
      />
    </div>
  );
}
