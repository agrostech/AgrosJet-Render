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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Search, UserPlus, Pencil, AlertTriangle, XCircle, User, FileText, UserCheck, UserX, Power, PowerOff } from "lucide-react";
import CourierDocumentsSection from "@/components/admin/CourierDocumentsSection";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryelerPage({ companyId }) {
  const [activeCouriers, setActiveCouriers] = useState([]);
  const [inactiveCouriers, setInactiveCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [editData, setEditData] = useState({ name: "", phone: "", plate: "", address: "", password: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [detailTab, setDetailTab] = useState("info");
  const [activeTab, setActiveTab] = useState("active");

  const fetchCouriers = async () => {
    try {
      // Fetch active couriers
      const activeRes = await axios.get(`${API}/companies/${companyId}/couriers`);
      const sortedActive = activeRes.data.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', 'tr')
      );
      setActiveCouriers(sortedActive);

      // Fetch inactive couriers
      const inactiveRes = await axios.get(`${API}/companies/${companyId}/couriers/inactive`);
      const sortedInactive = inactiveRes.data.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', 'tr')
      );
      setInactiveCouriers(sortedInactive);
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyName = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyName(res.data.name);
    } catch (err) {
      console.error("Şirket bilgisi alınamadı");
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchCouriers();
      fetchCompanyName();
    }
  }, [companyId]);

  const openEditModal = (courier) => {
    setSelectedCourier(courier);
    setEditData({
      name: courier.name || "",
      phone: courier.phone || "",
      plate: courier.plate || "",
      address: courier.address || "",
      password: ""
    });
    setShowEditModal(true);
  };

  const handleEditCourier = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const updatePayload = {};
      if (editData.name && editData.name !== selectedCourier.name) updatePayload.name = editData.name;
      if (editData.phone && editData.phone !== selectedCourier.phone) updatePayload.phone = editData.phone;
      if (editData.plate && editData.plate !== selectedCourier.plate) updatePayload.plate = editData.plate;
      if (editData.address !== selectedCourier.address) updatePayload.address = editData.address;
      if (editData.password) updatePayload.password = editData.password;

      if (Object.keys(updatePayload).length === 0) {
        toast.error("Değişiklik yapılmadı");
        setEditLoading(false);
        return;
      }

      const res = await axios.put(`${API}/couriers/${selectedCourier.id}`, updatePayload);
      
      if (res.data.password_changed) {
        toast.success("Kurye güncellendi. Şifre değiştiği için oturumu kapatıldı.");
      } else {
        toast.success("Kurye güncellendi");
      }
      
      setShowEditModal(false);
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setEditLoading(false);
    }
  };

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
    } catch (err) { /* ignore */ }
    
    if (!window.confirm("Bu kuryeyi şirketten çıkarmak istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/companies/${companyId}/couriers/${courierId}`);
      toast.success("Kurye şirketten çıkarıldı");
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const openDetailModal = (courier) => {
    setSelectedCourier(courier);
    setDetailTab("info");
    setShowDetailModal(true);
  };

  const handleStartTermination = async (courierId) => {
    if (!window.confirm("Bu kurye için 15 günlük fesih sürecini başlatmak istediğinize emin misiniz? Süre yarından itibaren başlayacak.")) return;
    try {
      await axios.post(`${API}/companies/${companyId}/couriers/${courierId}/start-termination`);
      toast.success("Fesih süreci başlatıldı");
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleCancelTermination = async (courierId) => {
    if (!window.confirm("Fesih sürecini iptal etmek istediğinize emin misiniz?")) return;
    try {
      await axios.post(`${API}/companies/${companyId}/couriers/${courierId}/cancel-termination`);
      toast.success("Fesih süreci iptal edildi");
      fetchCouriers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const filteredCouriers = couriers.filter(c => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    return c.name.toLowerCase().includes(query) || c.plate.toLowerCase().includes(query);
  });

  if (loading) return <PageLoading />;

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
                <TableRow key={c.id} className={`border-b border-border hover:bg-slate-50 ${c.termination_start_date ? 'bg-orange-50' : ''}`}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.termination_start_date && (
                      <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-semibold">
                        Fesih: {c.termination_remaining_days} gün
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="font-mono text-sm">{c.plate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openDetailModal(c)} className="h-8 px-3 border-2" data-testid={`detail-${c.id}`}>Detaylar</Button>
                      <Button size="sm" variant="outline" onClick={() => openEditModal(c)} className="h-8 px-3 border-2 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-courier-${c.id}`}><Pencil className="w-4 h-4" /></Button>
                      {c.termination_start_date ? (
                        <Button size="sm" variant="outline" onClick={() => handleCancelTermination(c.id)} className="h-8 px-3 border-2 hover:bg-green-50 hover:text-green-600" title="Fesih İptal" data-testid={`cancel-termination-${c.id}`}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleStartTermination(c.id)} className="h-8 px-3 border-2 hover:bg-orange-50 hover:text-orange-600" title="Fesih Başlat" data-testid={`start-termination-${c.id}`}>
                          <AlertTriangle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleRemove(c.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`remove-${c.id}`}><Trash2 className="w-4 h-4" /></Button>
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
            <div key={c.id} className={`border-2 border-border p-4 bg-white ${c.termination_start_date ? 'border-orange-300 bg-orange-50' : ''}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{c.phone}</p>
                  {c.termination_start_date && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-semibold">
                      Fesih: {c.termination_remaining_days} gün kaldı
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm mb-3"><span className="text-muted-foreground">Plaka:</span> <span className="font-mono">{c.plate}</span></p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openDetailModal(c)} className="flex-1 border-2">Detaylar</Button>
                <Button size="sm" variant="outline" onClick={() => openEditModal(c)} className="flex-1 border-2 hover:bg-blue-50 hover:text-blue-600">Düzenle</Button>
                {c.termination_start_date ? (
                  <Button size="sm" variant="outline" onClick={() => handleCancelTermination(c.id)} className="border-2 hover:bg-green-50 hover:text-green-600" title="Fesih İptal">
                    <XCircle className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleStartTermination(c.id)} className="border-2 hover:bg-orange-50 hover:text-orange-600" title="Fesih Başlat">
                    <AlertTriangle className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handleRemove(c.id)} className="border-2 hover:bg-red-50 hover:text-red-600">Çıkar</Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Kurye Düzenleme Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-base sm:text-lg">
              <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
              Kurye Düzenle
            </DialogTitle>
          </DialogHeader>
          {selectedCourier && (
            <form onSubmit={handleEditCourier} className="space-y-3 sm:space-y-4">
              <div className="p-2 sm:p-3 bg-slate-50 rounded border">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Düzenlenen Kurye</p>
                <p className="font-semibold text-sm sm:text-base">{selectedCourier.name}</p>
                <p className="text-xs sm:text-sm text-muted-foreground font-mono">{selectedCourier.phone}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label className="text-xs sm:text-sm font-semibold">İsim Soyisim</Label>
                  <Input data-testid="edit-courier-name" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" />
                </div>
                <div>
                  <Label className="text-xs sm:text-sm font-semibold">Telefon</Label>
                  <Input data-testid="edit-courier-phone" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 font-mono text-sm" />
                </div>
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Plaka</Label>
                <Input data-testid="edit-courier-plate" value={editData.plate} onChange={(e) => setEditData({ ...editData, plate: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 font-mono uppercase text-sm" />
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Adres</Label>
                <Input data-testid="edit-courier-address" value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" />
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm font-semibold">Yeni Şifre</Label>
                <Input data-testid="edit-courier-password" type="password" value={editData.password} onChange={(e) => setEditData({ ...editData, password: e.target.value })} className="mt-1 h-9 sm:h-10 border-2 text-sm" placeholder="Boş bırakın" />
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded p-2 sm:p-3 text-[10px] sm:text-xs text-amber-700">
                <strong>Not:</strong> Şifre değiştirildiğinde kurye yeniden giriş yapmak zorunda kalacaktır.
              </div>
              
              <Button type="submit" className="w-full h-10 sm:h-11 font-semibold text-sm" disabled={editLoading} data-testid="submit-edit-courier">
                {editLoading ? "Güncelleniyor..." : "Kaydet"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Kurye Detayları</DialogTitle>
          </DialogHeader>
          {selectedCourier && (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="info" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Bilgiler
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Evraklar
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="info" className="space-y-4">
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
              </TabsContent>
              
              <TabsContent value="documents">
                <CourierDocumentsSection 
                  courierId={selectedCourier.id}
                  courierName={selectedCourier.name}
                  companyName={companyName}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
