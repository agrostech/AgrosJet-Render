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
import { Menu, X, LogOut, Building2, Users, Trash2, Plus, Edit, UserPlus } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Şirketler Page
function SirketlerPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [newCompany, setNewCompany] = useState({ name: "", logo_url: "" });
  const [newSuperAdmin, setNewSuperAdmin] = useState({ name: "", username: "", password: "" });

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

  const handleDeleteCompany = async (id) => {
    if (!window.confirm("Bu şirketi ve tüm verilerini silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/companies/${id}`);
      toast.success("Şirket silindi");
      fetchCompanies();
    } catch (err) {
      toast.error("Silme başarısız");
    }
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
    } catch (err) {
      toast.error(err.response?.data?.detail || "Oluşturma başarısız");
    }
  };

  const openEditModal = (company) => {
    setSelectedCompany({ ...company });
    setShowEditModal(true);
  };

  const openSuperAdminModal = (company) => {
    setSelectedCompany(company);
    setShowSuperAdminModal(true);
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="system-sirketler-page">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">
          ŞİRKETLER
        </h2>
        <Button
          onClick={() => setShowAddModal(true)}
          className="uppercase font-bold text-xs tracking-wider"
          data-testid="add-company-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          ŞİRKET EKLE
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="uppercase tracking-wider font-bold text-xs">Logo</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Şirket Adı</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">Oluşturulma</TableHead>
              <TableHead className="uppercase tracking-wider font-bold text-xs">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Kayıtlı şirket bulunmuyor
                </TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow key={c.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell>
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.name} className="h-10 w-20 object-contain" />
                    ) : (
                      <div className="h-10 w-20 bg-slate-100 flex items-center justify-center text-xs text-muted-foreground">
                        Logo Yok
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {new Date(c.created_at).toLocaleDateString('tr-TR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(c)}
                        className="h-8 px-3 border-2"
                        data-testid={`edit-${c.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSuperAdminModal(c)}
                        className="h-8 px-3 border-2"
                        data-testid={`superadmin-${c.id}`}
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteCompany(c.id)}
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
        {companies.length === 0 ? (
          <div className="border-2 border-border p-6 bg-white text-center text-muted-foreground">
            Kayıtlı şirket bulunmuyor
          </div>
        ) : (
          companies.map((c) => (
            <div key={c.id} className="border-2 border-border p-4 bg-white">
              <div className="flex items-start gap-4 mb-3">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="h-12 w-24 object-contain" />
                ) : (
                  <div className="h-12 w-24 bg-slate-100 flex items-center justify-center text-xs text-muted-foreground">
                    Logo Yok
                  </div>
                )}
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditModal(c)}
                  className="flex-1 border-2"
                >
                  DÜZENLE
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openSuperAdminModal(c)}
                  className="flex-1 border-2"
                >
                  SÜPER ADMİN
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteCompany(c.id)}
                  className="border-2"
                >
                  SİL
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase">ŞİRKET EKLE</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompany} className="space-y-4">
            <div>
              <Label className="uppercase text-xs font-bold tracking-wider">Şirket Adı</Label>
              <Input
                data-testid="new-company-name"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="mt-1 h-12 border-2"
                required
              />
            </div>
            <div>
              <Label className="uppercase text-xs font-bold tracking-wider">Logo URL (Opsiyonel)</Label>
              <Input
                data-testid="new-company-logo"
                value={newCompany.logo_url}
                onChange={(e) => setNewCompany({ ...newCompany, logo_url: e.target.value })}
                className="mt-1 h-12 border-2"
                placeholder="https://..."
              />
            </div>
            <Button type="submit" className="w-full h-12 uppercase font-bold tracking-wider" data-testid="submit-new-company">
              EKLE
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase">ŞİRKET DÜZENLE</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleUpdateCompany} className="space-y-4">
              <div>
                <Label className="uppercase text-xs font-bold tracking-wider">Şirket Adı</Label>
                <Input
                  value={selectedCompany.name}
                  onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <div>
                <Label className="uppercase text-xs font-bold tracking-wider">Logo URL</Label>
                <Input
                  value={selectedCompany.logo_url || ""}
                  onChange={(e) => setSelectedCompany({ ...selectedCompany, logo_url: e.target.value })}
                  className="mt-1 h-12 border-2"
                  placeholder="https://..."
                />
              </div>
              {selectedCompany.logo_url && (
                <div>
                  <Label className="uppercase text-xs font-bold tracking-wider mb-2 block">Önizleme</Label>
                  <img src={selectedCompany.logo_url} alt="Logo" className="h-16 object-contain border p-2" />
                </div>
              )}
              <Button type="submit" className="w-full h-12 uppercase font-bold tracking-wider">
                KAYDET
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Super Admin Modal */}
      <Dialog open={showSuperAdminModal} onOpenChange={setShowSuperAdminModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase">SÜPER ADMİN EKLE</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <form onSubmit={handleAddSuperAdmin} className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                <strong>{selectedCompany.name}</strong> için süper admin oluşturun
              </p>
              <div>
                <Label className="uppercase text-xs font-bold tracking-wider">İsim Soyisim</Label>
                <Input
                  data-testid="superadmin-name"
                  value={newSuperAdmin.name}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, name: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <div>
                <Label className="uppercase text-xs font-bold tracking-wider">Kullanıcı Adı</Label>
                <Input
                  data-testid="superadmin-username"
                  value={newSuperAdmin.username}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, username: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <div>
                <Label className="uppercase text-xs font-bold tracking-wider">Şifre</Label>
                <Input
                  data-testid="superadmin-password"
                  type="password"
                  value={newSuperAdmin.password}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, password: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-12 uppercase font-bold tracking-wider" data-testid="submit-superadmin">
                OLUŞTUR
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Tüm Yöneticiler Page
function TumYoneticilerPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${API}/admins`);
      setAdmins(res.data);
    } catch (err) {
      toast.error("Yöneticiler yüklenemedi");
    } finally {
      setLoading(false);
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

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="system-yoneticiler-page">
      <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">
        TÜM YÖNETİCİLER
      </h2>

      <div className="border-2 border-border bg-white overflow-x-auto">
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
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Kayıtlı yönetici bulunmuyor
                </TableCell>
              </TableRow>
            ) : (
              admins.map((a) => (
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteAdmin(a.id)}
                      className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      data-testid={`delete-admin-${a.id}`}
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
    { path: "/system", label: "ŞİRKETLER", icon: Building2 },
    { path: "/system/yoneticiler", label: "YÖNETİCİLER", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-slate-50" data-testid="system-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-primary text-white p-4 flex items-center justify-between">
        <span className="font-heading text-lg font-bold uppercase">SİSTEM YÖNETİMİ</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-white hover:bg-white/10"
          data-testid="system-mobile-menu-btn"
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
            data-testid="system-mobile-logout-btn"
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
            <h1 className="font-heading text-xl font-bold uppercase">SİSTEM YÖNETİMİ</h1>
            <p className="text-white/60 text-sm mt-1">Ana Kontrol Paneli</p>
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
              data-testid="system-logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              ÇIKIŞ YAP
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8">
          <Routes>
            <Route index element={<SirketlerPage />} />
            <Route path="yoneticiler" element={<TumYoneticilerPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
