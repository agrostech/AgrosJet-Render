import { useState, useEffect } from "react";
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
import { Trash2, Pencil } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function YoneticilerPage({ companyId }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });
  const [editData, setEditData] = useState({ name: "", username: "", password: "" });
  const [editLoading, setEditLoading] = useState(false);
  
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
