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
import { Menu, X, LogOut, Clock, FileText, Package, Users, UserCog, Trash2, Settings, Search, UserPlus } from "lucide-react";
import { useSessionCheck } from "@/hooks/useSessionCheck";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function VardiyaPage({ companyId }) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newShift, setNewShift] = useState({ name: "", start_time: "", end_time: "" });

  const DAYS = [
    { key: "pazartesi", label: "Pazartesi" },
    { key: "sali", label: "Salı" },
    { key: "carsamba", label: "Çarşamba" },
    { key: "persembe", label: "Perşembe" },
    { key: "cuma", label: "Cuma" },
    { key: "cumartesi", label: "Cumartesi" },
    { key: "pazar", label: "Pazar" },
  ];

  const fetchData = async () => {
    try {
      const [shiftsRes, assignmentsRes, leavesRes, couriersRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/shifts`),
        axios.get(`${API}/companies/${companyId}/shift-assignments`),
        axios.get(`${API}/companies/${companyId}/leaves`),
        axios.get(`${API}/companies/${companyId}/couriers`),
      ]);
      setShifts(shiftsRes.data);
      setAssignments(assignmentsRes.data);
      setLeaves(leavesRes.data);
      setCouriers(couriersRes.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleAddShift = async (e) => {
    e.preventDefault();
    if (!newShift.start_time || !newShift.end_time) {
      toast.error("Başlangıç ve bitiş saati gerekli");
      return;
    }
    try {
      const shiftName = newShift.name || `${newShift.start_time} - ${newShift.end_time}`;
      await axios.post(`${API}/companies/${companyId}/shifts`, {
        name: shiftName,
        start_time: newShift.start_time,
        end_time: newShift.end_time,
        company_id: companyId
      });
      toast.success("Vardiya eklendi");
      setShowAddShiftModal(false);
      setNewShift({ name: "", start_time: "", end_time: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Vardiya eklenemedi");
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm("Bu vardiyayı silmek istediğinize emin misiniz? Tüm atamalar da silinecek.")) return;
    try {
      await axios.delete(`${API}/shifts/${shiftId}`);
      toast.success("Vardiya silindi");
      fetchData();
    } catch (err) {
      toast.error("Vardiya silinemedi");
    }
  };

  const openAssignModal = (shift, day) => {
    setSelectedShift(shift);
    setSelectedDay(day);
    setShowAssignModal(true);
  };

  const openLeaveModal = (day) => {
    setSelectedDay(day);
    setShowLeaveModal(true);
  };

  const handleAssignCourier = async (courierId) => {
    try {
      await axios.post(`${API}/shifts/${selectedShift.id}/assign`, {
        courier_id: courierId,
        day: selectedDay
      });
      toast.success("Kurye atandı");
      setShowAssignModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Atama başarısız");
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await axios.delete(`${API}/shift-assignments/${assignmentId}`);
      toast.success("Kurye vardiyadan çıkarıldı");
      fetchData();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const handleAddLeave = async (courierId) => {
    try {
      await axios.post(`${API}/companies/${companyId}/leaves`, {
        courier_id: courierId,
        day: selectedDay
      });
      toast.success("İzin eklendi");
      setShowLeaveModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İzin eklenemedi");
    }
  };

  const handleRemoveLeave = async (leaveId) => {
    try {
      await axios.delete(`${API}/leaves/${leaveId}`);
      toast.success("İzin kaldırıldı");
      fetchData();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const getAssignmentsForCell = (shiftId, day) => {
    return assignments.filter(a => a.shift_id === shiftId && a.day === day);
  };

  const getLeavesForDay = (day) => {
    return leaves.filter(l => l.day === day);
  };

  const getAvailableCouriersForShift = (day) => {
    const assignedIds = assignments
      .filter(a => a.shift_id === selectedShift?.id && a.day === day)
      .map(a => a.courier_id);
    return couriers.filter(c => !assignedIds.includes(c.id));
  };

  const getAvailableCouriersForLeave = (day) => {
    const onLeaveIds = leaves.filter(l => l.day === day).map(l => l.courier_id);
    return couriers.filter(c => !onLeaveIds.includes(c.id));
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-vardiya-page">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Vardiya Yönetimi</h2>
        <Button onClick={() => setShowAddShiftModal(true)} className="font-semibold" data-testid="add-shift-btn">
          <Clock className="w-4 h-4 mr-2" />
          Vardiya Ekle
        </Button>
      </div>

      {shifts.length === 0 ? (
        <div className="border-2 border-border p-8 bg-white text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">Henüz vardiya eklenmemiş</p>
          <Button onClick={() => setShowAddShiftModal(true)} variant="outline" className="border-2">
            İlk Vardiyayı Ekle
          </Button>
        </div>
      ) : (
        <div className="border-2 border-border bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-primary">
                <TableHead className="font-bold text-xs min-w-[100px] bg-slate-50">Gün</TableHead>
                {shifts.map(shift => (
                  <TableHead key={shift.id} className="font-bold text-xs min-w-[150px] text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{shift.start_time}</span>
                      <span className="text-[10px] text-muted-foreground">{shift.end_time}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteShift(shift.id)}
                        className="h-5 w-5 p-0 hover:bg-red-50 hover:text-red-600"
                        data-testid={`delete-shift-${shift.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="font-bold text-xs min-w-[150px] text-center bg-orange-50 text-orange-700">
                  İzinliler
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DAYS.map(day => (
                <TableRow key={day.key} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-semibold bg-slate-50">{day.label}</TableCell>
                  {shifts.map(shift => {
                    const cellAssignments = getAssignmentsForCell(shift.id, day.key);
                    return (
                      <TableCell key={shift.id} className="p-2 align-top">
                        <div className="min-h-[60px] space-y-1">
                          {cellAssignments.map(a => (
                            <div key={a.id} className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded text-xs group">
                              <span className="font-medium truncate">{a.courier_name}</span>
                              <button
                                onClick={() => handleRemoveAssignment(a.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => openAssignModal(shift, day.key)}
                            className="w-full text-xs text-muted-foreground hover:text-primary hover:bg-slate-100 py-1 rounded border border-dashed border-slate-300"
                            data-testid={`assign-${shift.id}-${day.key}`}
                          >
                            + Kurye Ekle
                          </button>
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="p-2 align-top bg-orange-50/50">
                    <div className="min-h-[60px] space-y-1">
                      {getLeavesForDay(day.key).map(l => (
                        <div key={l.id} className="flex items-center justify-between bg-orange-100 px-2 py-1 rounded text-xs group">
                          <span className="font-medium truncate">{l.courier_name}</span>
                          <button
                            onClick={() => handleRemoveLeave(l.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => openLeaveModal(day.key)}
                        className="w-full text-xs text-muted-foreground hover:text-orange-600 hover:bg-orange-100 py-1 rounded border border-dashed border-orange-300"
                        data-testid={`add-leave-${day.key}`}
                      >
                        + İzin Ekle
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Vardiya Ekle Modal */}
      <Dialog open={showAddShiftModal} onOpenChange={setShowAddShiftModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Vardiya Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddShift} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Vardiya Adı (Opsiyonel)</Label>
              <Input
                placeholder="Örn: Sabah Vardiyası"
                value={newShift.name}
                onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                className="mt-1 h-12 border-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold">Başlangıç Saati</Label>
                <Input
                  type="time"
                  value={newShift.start_time}
                  onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Bitiş Saati</Label>
                <Input
                  type="time"
                  value={newShift.end_time}
                  onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-shift">
              Vardiya Ekle
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kurye Ata Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Kurye Ata</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {selectedShift?.start_time} - {selectedShift?.end_time} vardiyasına kurye seçin
            </p>
            {getAvailableCouriersForShift(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Atanabilecek kurye yok</p>
            ) : (
              getAvailableCouriersForShift(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAssignCourier(courier.id)}
                  className="w-full flex items-center justify-between p-3 border-2 border-border rounded hover:bg-slate-50 hover:border-primary transition-colors"
                  data-testid={`select-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{courier.plate}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* İzin Ekle Modal */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">İzin Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {DAYS.find(d => d.key === selectedDay)?.label} günü için izinli kurye seçin
            </p>
            {getAvailableCouriersForLeave(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4">İzin eklenebilecek kurye yok</p>
            ) : (
              getAvailableCouriersForLeave(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAddLeave(courier.id)}
                  className="w-full flex items-center justify-between p-3 border-2 border-border rounded hover:bg-orange-50 hover:border-orange-400 transition-colors"
                  data-testid={`select-leave-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{courier.plate}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MuhasebePage() {
  return (
    <div data-testid="admin-muhasebe-page">
      <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">Muhasebe</h2>
      <div className="border-2 border-border p-6 bg-white">
        <p className="text-muted-foreground">Muhasebe içeriği burada görünecek.</p>
      </div>
    </div>
  );
}

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
                      <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="h-8 px-3 border-2" data-testid={`perm-${a.id}`}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600" data-testid={`delete-admin-${a.id}`}>
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
                <Button size="sm" variant="outline" onClick={() => openPermModal(a)} className="flex-1 border-2">Yetkiler</Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteAdmin(a.id)} className="border-2">Sil</Button>
              </div>
            )}
          </div>
        ))}
      </div>

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

  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";
  const permissions = user.permissions || {};
  const company = user.company;

  const NAV_ITEMS = [
    { path: "/admin", label: "Vardiya", icon: Clock, key: "vardiya" },
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
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
          <div className="p-6 border-b border-white/20">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-10 mb-2 object-contain" />
            ) : (
              <h1 className="font-heading text-xl font-bold">{company?.name}</h1>
            )}
            <p className="text-white/60 text-sm mt-1">{isSuperAdmin ? "Süper Admin Paneli" : "Admin Paneli"}</p>
            <p className="text-white/80 text-sm font-mono mt-2">{user.name}</p>
          </div>
          <nav className="flex-1 py-4">
            {NAV_ITEMS.map((item) => (
              <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-6 py-3 text-sm font-semibold transition-colors ${location.pathname === item.path ? "bg-white/20 border-l-4 border-orange-500" : "hover:bg-white/10"}`} data-testid={`admin-nav-${item.key}`}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-white/20">
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-white hover:bg-white/10 font-semibold text-sm" data-testid="admin-logout-btn">
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 pb-16">
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

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t py-3 text-center text-xs text-muted-foreground">
        © 2026 ShiftJet. Tüm hakları saklıdır. Bir AgrosJet kuruluşudur.
      </footer>
    </div>
  );
}
