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
import { Menu, X, LogOut, Clock, FileText, Package, Users, UserCog, Check, XIcon, Trash2, Settings } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Vardiya Page (Placeholder)
function VardiyaPage() {
  return (
    <div data-testid="admin-vardiya-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        VARDİYA YÖNETİMİ
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Vardiya yönetimi içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

// Muhasebe Page (Placeholder)
function MuhasebePage() {
  return (
    <div data-testid="admin-muhasebe-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        MUHASEBE
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Muhasebe içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

// Zimmet Page (Placeholder)
function ZimmetPage() {
  return (
    <div data-testid="admin-zimmet-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        ZİMMET
      </h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Zimmet takibi içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

// Kuryeler Page
function KuryelerPage({ companyId }) {
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/couriers?company_id=${companyId}`);
      setCouriers(res.data);
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchCouriers();
  }, [companyId]);

  const handleApprove = async (id) => {
    try {
      await axios.put(`${API}/couriers/${id}/approve`);
      toast.success("Kurye onaylandı");
      fetchCouriers();
    } catch (err) {
      toast.error("Onaylama başarısız");
    }
  };

  const handleReject = async (id) => {
    try {
      await axios.put(`${API}/couriers/${id}/reject`);
      toast.success("Kurye reddedildi");
      fetchCouriers();
    } catch (err) {
      toast.error("Reddetme başarısız");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu kuryeyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/couriers/${id}`);
      toast.success("Kurye silindi");
      fetchCouriers();
    } catch (err) {
      toast.error("Silme başarısız");
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-amber-100 text-amber-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    const labels = {
      pending: "BEKLİYOR",
      approved: "ONAYLANDI",
      rejected: "REDDEDİLDİ",
    };
    return (
      <span className={`px-2 py-1 text-xs font-bold uppercase ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-kuryeler-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        KURYELER
      </h2>

      {/* Desktop Table */}
      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="uppercase tracking-wider font-bold text-xs">İsim</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Telefon</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Plaka</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Durum</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {couriers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Kayıtlı kurye bulunmuyor
                </TableCell>
              </TableRow>
            ) : (
              couriers.map((c) => (
                <TableRow key={c.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="font-mono text-sm">{c.plate}</TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {c.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(c.id)}
                            className="h-8 px-3 bg-green-600 hover:bg-green-700"
                            data-testid={`approve-${c.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(c.id)}
                            className="h-8 px-3"
                            data-testid={`reject-${c.id}`}
                          >
                            <XIcon className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(c.id)}
                        className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        data-testid={`delete-${c.id}`}
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

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {couriers.length === 0 ? (
          <div className="border-2 border-border p-6 bg-white text-center text-muted-foreground">
            Kayıtlı kurye bulunmuyor
          </div>
        ) : (
          couriers.map((c) => (
            <div key={c.id} className="border-2 border-border p-4 bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{c.phone}</p>
                </div>
                {getStatusBadge(c.status)}
              </div>
              <p className="text-sm mb-3">
                <span className="text-muted-foreground">Plaka:</span>{" "}
                <span className="font-mono">{c.plate}</span>
              </p>
              <div className="flex gap-2">
                {c.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(c.id)}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      ONAYLA
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(c.id)}
                      className="flex-1"
                    >
                      REDDET
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(c.id)}
                  className="border-2"
                >
                  SİL
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Yoneticiler Page (Super Admin Only)
function YoneticilerPage({ companyId }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: "", username: "", password: "" });

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

  const handleUpdatePermissions = async () => {
    try {
      await axios.put(`${API}/admins/${selectedAdmin.id}/permissions`, {
        permissions: selectedAdmin.permissions,
      });
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
      toast.success("Yönetici silindi");
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  const openPermModal = (admin) => {
    setSelectedAdmin({ ...admin });
    setShowPermModal(true);
  };

  const togglePermission = (key) => {
    setSelectedAdmin({
      ...selectedAdmin,
      permissions: {
        ...selectedAdmin.permissions,
        [key]: !selectedAdmin.permissions[key],
      },
    });
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-yoneticiler-page">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">
          YÖNETİCİLER
        </h2>
        <Button
          onClick={() => setShowAddModal(true)}
          className="uppercase font-bold text-xs tracking-wider"
          data-testid="add-admin-btn"
        >
          YÖNETİCİ EKLE
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="uppercase tracking-wider font-bold text-xs">İsim</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Kullanıcı Adı</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Rol</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.id} className="border-b border-border hover:bg-slate-50">
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="font-mono text-sm">{a.username}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs font-bold uppercase ${
                    a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"
                  }`}>
                    {a.role === "superadmin" ? "SÜPER ADMİN" : "ADMİN"}
                  </span>
                </TableCell>
                <TableCell>
                  {a.role !== "superadmin" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPermModal(a)}
                        className="h-8 px-3 border-2"
                        data-testid={`perm-${a.id}`}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteAdmin(a.id)}
                        className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        data-testid={`delete-admin-${a.id}`}
                      >
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

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {admins.map((a) => (
          <div key={a.id} className="border-2 border-border p-4 bg-white">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold">{a.name}</p>
                <p className="font-mono text-sm text-muted-foreground">{a.username}</p>
              </div>
              <span className={`px-2 py-1 text-xs font-bold uppercase ${
                a.role === "superadmin" ? "bg-primary text-white" : "bg-slate-200 text-slate-800"
              }`}>
                {a.role === "superadmin" ? "SÜPER ADMİN" : "ADMİN"}
              </span>
            </div>
            {a.role !== "superadmin" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openPermModal(a)}
                  className="flex-1 border-2"
                >
                  YETKİLER
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteAdmin(a.id)}
                  className="border-2"
                >
                  SİL
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Admin Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase">YÖNETİCİ EKLE</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <Label className="uppercase text-xs font-bold tracking-wider">İsim Soyisim</Label>
              <Input
                data-testid="new-admin-name"
                value={newAdmin.name}
                onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                className="mt-1 h-12 border-2"
                required
              />
            </div>
            <div>
              <Label className="uppercase text-xs font-bold tracking-wider">Kullanıcı Adı</Label>
              <Input
                data-testid="new-admin-username"
                value={newAdmin.username}
                onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                className="mt-1 h-12 border-2"
                required
              />
            </div>
            <div>
              <Label className="uppercase text-xs font-bold tracking-wider">Şifre</Label>
              <Input
                data-testid="new-admin-password"
                type="password"
                value={newAdmin.password}
                onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                className="mt-1 h-12 border-2"
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 uppercase font-bold tracking-wider" data-testid="submit-new-admin">
              EKLE
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog open={showPermModal} onOpenChange={setShowPermModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase">YETKİ AYARLARI</DialogTitle>
          </DialogHeader>
          {selectedAdmin && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedAdmin.name} için yetkileri ayarlayın
              </p>
              <div className="space-y-3">
                {Object.entries(selectedAdmin.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={key}
                      checked={value}
                      onCheckedChange={() => togglePermission(key)}
                      disabled={key === "yoneticiler"}
                      data-testid={`perm-checkbox-${key}`}
                    />
                    <Label htmlFor={key} className="uppercase text-sm font-medium">
                      {key}
                    </Label>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleUpdatePermissions}
                className="w-full h-12 uppercase font-bold tracking-wider"
                data-testid="save-permissions-btn"
              >
                KAYDET
              </Button>
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

  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";
  const permissions = user.permissions || {};
  const company = user.company;

  const NAV_ITEMS = [
    { path: "/admin", label: "VARDİYA", icon: Clock, key: "vardiya" },
    { path: "/admin/muhasebe", label: "MUHASEBE", icon: FileText, key: "muhasebe" },
    { path: "/admin/zimmet", label: "ZİMMET", icon: Package, key: "zimmet" },
    { path: "/admin/kuryeler", label: "KURYELER", icon: Users, key: "kuryeler" },
    { path: "/admin/yoneticiler", label: "YÖNETİCİLER", icon: UserCog, key: "yoneticiler" },
  ].filter((item) => isSuperAdmin || permissions[item.key]);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
          ) : (
            <span className="font-heading text-lg font-bold uppercase">{company?.name}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-white hover:bg-white/10"
          data-testid="admin-mobile-menu-btn"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-primary text-white border-t border-white/20">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider ${
                location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-wider hover:bg-white/10 text-left"
            data-testid="admin-mobile-logout-btn"
          >
            <LogOut className="w-5 h-5" />
            ÇIKIŞ
          </button>
        </nav>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
          <div className="p-6 border-b border-white/20">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-10 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-xl font-bold uppercase">{company?.name}</h1>
            )}
            <p className="text-white/60 text-sm mt-1">
              {isSuperAdmin ? "Süper Admin Paneli" : "Admin Paneli"}
            </p>
            <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
          </div>
          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                  location.pathname === item.path
                    ? "bg-white/20 border-l-4 border-orange-500"
                    : "hover:bg-white/10"
                }`}
                data-testid={`admin-nav-${item.key}`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-white/20">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-white hover:bg-white/10 uppercase font-bold text-xs tracking-wider"
              data-testid="admin-logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              ÇIKIŞ YAP
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8">
          <Routes>
            <Route index element={<VardiyaPage />} />
            <Route path="muhasebe" element={<MuhasebePage />} />
            <Route path="zimmet" element={<ZimmetPage />} />
            <Route path="kuryeler" element={<KuryelerPage companyId={user.company_id} />} />
            {(isSuperAdmin || permissions.yoneticiler) && (
              <Route path="yoneticiler" element={<YoneticilerPage companyId={user.company_id} />} />
            )}
          </Routes>
        </main>
      </div>
    </div>
  );
}
