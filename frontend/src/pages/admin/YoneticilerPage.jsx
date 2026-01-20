import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Trash2, Settings, Pencil, ChevronDown, ChevronRight, Layout, Calculator, Package, Users, ShoppingBag, GraduationCap, Calendar, Cog } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Granüler izin grupları tanımı
const PERMISSION_GROUPS = [
  {
    id: "pages",
    label: "Sayfa Erişimi",
    icon: Layout,
    permissions: [
      { key: "page_vardiya", label: "Vardiya" },
      { key: "page_muhasebe", label: "Muhasebe" },
      { key: "page_zimmet", label: "Zimmet" },
      { key: "page_kuryeler", label: "Kuryeler" },
      { key: "page_market", label: "Market" },
      { key: "page_akademi", label: "Akademi" },
      { key: "page_sistem", label: "Sistem Ayarları" },
      { key: "page_yoneticiler", label: "Yöneticiler", disabled: true },
    ]
  },
  {
    id: "muhasebe",
    label: "Muhasebe İşlemleri",
    icon: Calculator,
    permissions: [
      { key: "muhasebe_view", label: "Görüntüleme" },
      { key: "muhasebe_add_transaction", label: "İşlem Ekleme" },
      { key: "muhasebe_edit_transaction", label: "İşlem Düzenleme" },
      { key: "muhasebe_delete_transaction", label: "İşlem Silme" },
      { key: "muhasebe_archive", label: "Arşivleme" },
      { key: "muhasebe_export_pdf", label: "PDF Dışa Aktarma" },
      { key: "muhasebe_bulk_hakedis", label: "Toplu Hakediş" },
    ]
  },
  {
    id: "kuryeler",
    label: "Kurye İşlemleri",
    icon: Users,
    permissions: [
      { key: "kurye_add", label: "Kurye Ekleme" },
      { key: "kurye_edit", label: "Bilgi Düzenleme" },
      { key: "kurye_remove", label: "Şirketten Çıkarma" },
      { key: "kurye_deactivate", label: "Pasife Alma" },
      { key: "kurye_start_termination", label: "Fesih Başlatma" },
      { key: "kurye_cancel_termination", label: "Fesih İptali" },
    ]
  },
  {
    id: "zimmet",
    label: "Zimmet İşlemleri",
    icon: Package,
    permissions: [
      { key: "zimmet_view", label: "Görüntüleme" },
      { key: "zimmet_add_product", label: "Ürün Ekleme" },
      { key: "zimmet_edit_product", label: "Ürün Düzenleme" },
      { key: "zimmet_delete_product", label: "Ürün Silme" },
      { key: "zimmet_assign", label: "Zimmet Atama" },
      { key: "zimmet_return", label: "Zimmet İade" },
    ]
  },
  {
    id: "market",
    label: "Market İşlemleri",
    icon: ShoppingBag,
    permissions: [
      { key: "market_view", label: "Görüntüleme" },
      { key: "market_add_product", label: "Ürün Ekleme" },
      { key: "market_edit_product", label: "Ürün Düzenleme" },
      { key: "market_delete_product", label: "Ürün Silme" },
      { key: "market_manage_orders", label: "Sipariş Yönetimi" },
      { key: "market_add_jetpuan", label: "JetPuan Ekleme" },
    ]
  },
  {
    id: "akademi",
    label: "Akademi İşlemleri",
    icon: GraduationCap,
    permissions: [
      { key: "akademi_view", label: "Görüntüleme" },
      { key: "akademi_add", label: "Eğitim Ekleme" },
      { key: "akademi_edit", label: "Eğitim Düzenleme" },
      { key: "akademi_delete", label: "Eğitim Silme" },
    ]
  },
  {
    id: "vardiya",
    label: "Vardiya İşlemleri",
    icon: Calendar,
    permissions: [
      { key: "vardiya_view", label: "Görüntüleme" },
      { key: "vardiya_add", label: "Vardiya Ekleme" },
      { key: "vardiya_delete", label: "Vardiya Silme" },
      { key: "vardiya_assign", label: "Atama Yapma" },
    ]
  },
  {
    id: "sistem",
    label: "Sistem Ayarları",
    icon: Cog,
    permissions: [
      { key: "sistem_company_info", label: "Şirket Bilgileri" },
      { key: "sistem_email_settings", label: "E-posta Ayarları" },
      { key: "sistem_backup", label: "Yedekleme İşlemleri" },
    ]
  }
];

export default function YoneticilerPage({ companyId }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });
  const [editData, setEditData] = useState({ name: "", username: "", password: "" });
  const [editLoading, setEditLoading] = useState(false);
  
  // Permission groups expanded state
  const [expandedGroups, setExpandedGroups] = useState(["pages"]);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${API}/admins?company_id=${companyId}`);
      setAdmins(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Yöneticiler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchAdmins();
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
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Ekleme başarısız");
      }
    }
  };

  const handleUpdatePermissions = async () => {
    try {
      await axios.put(`${API}/admins/${selectedAdmin.id}/permissions`, { permissions: selectedAdmin.permissions });
      toast.success("Yetkiler güncellendi");
      setShowPermModal(false);
      fetchAdmins();
    } catch (err) {
      if (!err.handled) {
        toast.error("Güncelleme başarısız");
      }
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
      toast.success("Yönetici silindi (oturumu kapatıldı)");
      fetchAdmins();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Silme başarısız");
      }
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
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
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Güncelleme başarısız");
      }
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

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleAllInGroup = (group, checked) => {
    const newPermissions = { ...selectedAdmin.permissions };
    group.permissions.forEach(perm => {
      if (!perm.disabled) {
        newPermissions[perm.key] = checked;
      }
    });
    setSelectedAdmin({ ...selectedAdmin, permissions: newPermissions });
  };

  const getGroupStatus = (group) => {
    const enabledCount = group.permissions.filter(p => !p.disabled && selectedAdmin?.permissions?.[p.key]).length;
    const totalCount = group.permissions.filter(p => !p.disabled).length;
    return { enabledCount, totalCount, allEnabled: enabledCount === totalCount };
  };

  if (loading) return <PageLoading />;

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
              <TableHead className="font-bold text-xs text-right">İşlemler</TableHead>
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
                <TableCell className="text-right">
                  {a.role !== "superadmin" && (
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(a)} className="h-8 px-3 border-2 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-admin-${a.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="h-8 px-3 border-2" data-testid={`perm-${a.id}`}><Settings className="w-4 h-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`delete-admin-${a.id}`}><Trash2 className="w-4 h-4" /></Button>
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
              
              <div className="bg-amber-50 border border-amber-200 rounded p-2 sm:p-3 text-[10px] sm:text-xs text-amber-700">
                <strong>Not:</strong> Şifre değiştirildiğinde bu yöneticinin aktif oturumu kapatılacaktır.
              </div>
              
              <Button type="submit" className="w-full h-10 sm:h-11 font-semibold text-sm" disabled={editLoading} data-testid="submit-edit-admin">
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
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading">Yetki Ayarları</DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              <p className="text-sm text-muted-foreground sticky top-0 bg-background pb-2">
                <span className="font-semibold text-foreground">{selectedAdmin.name}</span> için detaylı yetkileri ayarlayın
              </p>
              
              {PERMISSION_GROUPS.map((group) => {
                const Icon = group.icon;
                const { enabledCount, totalCount, allEnabled } = getGroupStatus(group);
                const isExpanded = expandedGroups.includes(group.id);
                
                return (
                  <Collapsible 
                    key={group.id} 
                    open={isExpanded}
                    onOpenChange={() => toggleGroup(group.id)}
                    className="border-2 border-border rounded-lg overflow-hidden"
                  >
                    <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">{group.label}</p>
                          <p className="text-xs text-muted-foreground">{enabledCount}/{totalCount} aktif</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={allEnabled}
                          onCheckedChange={(checked) => {
                            toggleAllInGroup(group, checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="data-[state=checked]:bg-primary"
                        />
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t border-border bg-slate-50/50 p-3 space-y-2">
                        {group.permissions.map((perm) => (
                          <div 
                            key={perm.key} 
                            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white transition-colors"
                          >
                            <Label 
                              htmlFor={perm.key} 
                              className={`text-sm cursor-pointer ${perm.disabled ? 'text-muted-foreground' : ''}`}
                            >
                              {perm.label}
                            </Label>
                            <Checkbox 
                              id={perm.key}
                              checked={selectedAdmin.permissions?.[perm.key] || false}
                              onCheckedChange={() => togglePermission(perm.key)}
                              disabled={perm.disabled}
                              data-testid={`perm-checkbox-${perm.key}`}
                            />
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              
              <Button 
                onClick={handleUpdatePermissions} 
                className="w-full h-12 font-semibold sticky bottom-0" 
                data-testid="save-permissions-btn"
              >
                Kaydet
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Yönetici Silme"
        description="Bu yöneticiyi silmek istediğinize emin misiniz? Aktif oturumu kapatılacaktır."
        onConfirm={confirmDeleteAdmin}
        variant="danger"
      />
    </div>
  );
}
