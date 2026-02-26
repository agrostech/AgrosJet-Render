import { useState, useEffect, useCallback } from "react";
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
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  Bike, 
  Plus, 
  Wrench, 
  Pencil, 
  Trash2, 
  Loader2,
  AlertTriangle,
  X,
  Gauge,
  Calendar
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatKm = (km) => {
  if (km === null || km === undefined) return "-";
  return new Intl.NumberFormat('tr-TR').format(km) + " km";
};

export default function CourierMotosikletimPage({ courierId, companyId }) {
  const [motorcycles, setMotorcycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState({ has_notifications: false, total_count: 0, motorcycles: [] });
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [selectedMotorcycle, setSelectedMotorcycle] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({ brand: "", model: "", plate: "", current_km: "" });
  const [maintenanceData, setMaintenanceData] = useState({ 
    km_at_maintenance: "", 
    oil_change: false, 
    brake_maintenance: false, 
    variator_maintenance: false 
  });

  const fetchMotorcycles = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/motorcycles/courier/${courierId}`);
      setMotorcycles(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Motosikletler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/motorcycles/notifications/${courierId}/active`);
      setNotifications(res.data);
    } catch (err) {
      console.error("Bildirimler yüklenemedi");
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) {
      fetchMotorcycles();
      fetchNotifications();
    }
  }, [courierId, fetchMotorcycles, fetchNotifications]);

  // Add motorcycle
  const handleAddMotorcycle = async () => {
    if (!formData.brand || !formData.model || !formData.plate || !formData.current_km) {
      toast.error("Tüm alanları doldurun");
      return;
    }
    
    setSaving(true);
    try {
      await axios.post(`${API}/motorcycles`, {
        courier_id: courierId,
        company_id: companyId,
        brand: formData.brand,
        model: formData.model,
        plate: formData.plate,
        current_km: parseInt(formData.current_km)
      });
      setShowAddModal(false);
      setFormData({ brand: "", model: "", plate: "", current_km: "" });
      fetchMotorcycles();
    } catch (err) {
      if (!err.handled) {
        const errorMsg = typeof err.response?.data?.detail === 'string' 
          ? err.response.data.detail 
          : "Eklenemedi";
        toast.error(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Edit motorcycle
  const handleEditMotorcycle = async () => {
    if (!formData.brand || !formData.model || !formData.plate) {
      toast.error("Tüm alanları doldurun");
      return;
    }
    
    setSaving(true);
    try {
      await axios.put(`${API}/motorcycles/${selectedMotorcycle.id}`, {
        brand: formData.brand,
        model: formData.model,
        plate: formData.plate
      });
      setShowEditModal(false);
      setSelectedMotorcycle(null);
      fetchMotorcycles();
    } catch (err) {
      if (!err.handled) {
        const errorMsg = typeof err.response?.data?.detail === 'string' 
          ? err.response.data.detail 
          : "Güncellenemedi";
        toast.error(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete motorcycle
  const handleDeleteMotorcycle = async () => {
    if (!selectedMotorcycle) return;
    
    try {
      await axios.delete(`${API}/motorcycles/${selectedMotorcycle.id}`);
      setShowDeleteConfirm(false);
      setSelectedMotorcycle(null);
      fetchMotorcycles();
    } catch (err) {
      if (!err.handled) {
        const errorMsg = typeof err.response?.data?.detail === 'string' 
          ? err.response.data.detail 
          : "Silinemedi";
        toast.error(errorMsg);
      }
    }
  };

  // Add maintenance
  const handleAddMaintenance = async () => {
    if (!maintenanceData.km_at_maintenance) {
      toast.error("Kilometre giriniz");
      return;
    }
    
    if (!maintenanceData.oil_change && !maintenanceData.brake_maintenance && !maintenanceData.variator_maintenance) {
      toast.error("En az bir bakım türü seçin");
      return;
    }
    
    const kmValue = parseInt(maintenanceData.km_at_maintenance);
    if (kmValue < selectedMotorcycle.current_km) {
      toast.error("Kilometre mevcut km'den düşük olamaz");
      return;
    }
    
    setSaving(true);
    try {
      await axios.post(`${API}/motorcycles/maintenance`, {
        motorcycle_id: selectedMotorcycle.id,
        courier_id: courierId,
        company_id: companyId,
        km_at_maintenance: kmValue,
        oil_change: maintenanceData.oil_change,
        brake_maintenance: maintenanceData.brake_maintenance,
        variator_maintenance: maintenanceData.variator_maintenance
      });
      setShowMaintenanceModal(false);
      setSelectedMotorcycle(null);
      setMaintenanceData({ km_at_maintenance: "", oil_change: false, brake_maintenance: false, variator_maintenance: false });
      fetchMotorcycles();
      fetchNotifications();
    } catch (err) {
      if (!err.handled) {
        const errorMsg = typeof err.response?.data?.detail === 'string' 
          ? err.response.data.detail 
          : "Kaydedilemedi";
        toast.error(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Dismiss notification
  const handleDismissNotification = async (motorcycleId, notificationType) => {
    try {
      await axios.post(`${API}/motorcycles/notifications/${courierId}/dismiss?motorcycle_id=${motorcycleId}&notification_type=${notificationType}`);
      fetchNotifications();
    } catch (err) {
      console.error("Bildirim kapatılamadı");
    }
  };

  // Open modals
  const openAddModal = () => {
    setFormData({ brand: "", model: "", plate: "", current_km: "" });
    setShowAddModal(true);
  };

  const openEditModal = (moto) => {
    setSelectedMotorcycle(moto);
    setFormData({ brand: moto.brand, model: moto.model, plate: moto.plate, current_km: "" });
    setShowEditModal(true);
  };

  const openMaintenanceModal = (moto) => {
    setSelectedMotorcycle(moto);
    setMaintenanceData({ 
      km_at_maintenance: moto.current_km.toString(), 
      oil_change: false, 
      brake_maintenance: false, 
      variator_maintenance: false 
    });
    setShowMaintenanceModal(true);
  };

  const openDeleteConfirm = (moto) => {
    setSelectedMotorcycle(moto);
    setShowDeleteConfirm(true);
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="courier-motosikletim-page">
      {/* Notifications */}
      {notifications.has_notifications && (
        <div className="border-2 border-border bg-white">
          <div className="p-3 border-b border-border bg-slate-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold text-sm">Bakım Hatırlatmaları</span>
          </div>
          <div className="divide-y divide-border">
            {notifications.motorcycles.map((moto) => (
              <div key={moto.motorcycle_id} className="p-3">
                <p className="text-sm font-medium mb-2">{moto.motorcycle_name}</p>
                <div className="space-y-1">
                  {moto.notifications.map((notif) => (
                    <div key={notif.type} className="flex items-center justify-between text-xs">
                      <span>{notif.label} bakımı geçti ({notif.days_overdue} gün)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleDismissNotification(moto.motorcycle_id, notif.type)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                <Bike className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl">Motosikletlerim</h2>
                <p className="text-sm text-muted-foreground">Araçlarınızı ve bakımlarınızı yönetin</p>
              </div>
            </div>
            <Button onClick={openAddModal} size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Ekle</span>
            </Button>
          </div>
        </div>

        {/* Motorcycles List */}
        {motorcycles.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bike className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Henüz motosiklet eklenmemiş</p>
            <Button onClick={openAddModal} variant="outline" size="sm" className="mt-4 gap-1">
              <Plus className="w-4 h-4" />
              Motosiklet Ekle
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {motorcycles.map((moto) => (
              <div key={moto.id} className="p-4">
                {/* Motorcycle Info */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{moto.brand} {moto.model}</h3>
                    <p className="text-sm text-muted-foreground">{moto.plate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">{formatKm(moto.current_km)}</p>
                  </div>
                </div>

                {/* Maintenance Info */}
                <div className="grid grid-cols-3 gap-2 text-xs mb-3 p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-muted-foreground">Yağ</p>
                    <p className="font-medium">{formatDate(moto.last_oil_date)}</p>
                    <p className="text-muted-foreground">
                      Sonraki: {moto.last_oil_km ? formatKm(moto.last_oil_km + 2000) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fren</p>
                    <p className="font-medium">{formatDate(moto.last_brake_date)}</p>
                    <p className="text-muted-foreground">
                      Sonraki: {moto.last_brake_km ? formatKm(moto.last_brake_km + 2000) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Varyatör</p>
                    <p className="font-medium">{formatDate(moto.last_variator_date)}</p>
                    <p className="text-muted-foreground">
                      Sonraki: {moto.last_variator_km ? formatKm(moto.last_variator_km + 5000) : "-"}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => openMaintenanceModal(moto)} 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-1"
                  >
                    <Wrench className="w-4 h-4" />
                    Bakıma Girdim
                  </Button>
                  <Button 
                    onClick={() => openEditModal(moto)} 
                    variant="ghost" 
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={() => openDeleteConfirm(moto)} 
                    variant="ghost" 
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Motorcycle Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motosiklet Ekle</DialogTitle>
            <DialogDescription>Yeni motosiklet bilgilerinizi girin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Marka</Label>
              <Input
                placeholder="Honda, Yamaha, vb."
                value={formData.brand}
                onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                placeholder="PCX, NMAX, vb."
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Plaka</Label>
              <Input
                placeholder="34 ABC 123"
                value={formData.plate}
                onChange={(e) => setFormData(prev => ({ ...prev, plate: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Mevcut Kilometre</Label>
              <Input
                type="number"
                placeholder="15000"
                value={formData.current_km}
                onChange={(e) => setFormData(prev => ({ ...prev, current_km: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>İptal</Button>
            <Button onClick={handleAddMotorcycle} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Motorcycle Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motosiklet Düzenle</DialogTitle>
            <DialogDescription>Motosiklet bilgilerini güncelleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Marka</Label>
              <Input
                value={formData.brand}
                onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Plaka</Label>
              <Input
                value={formData.plate}
                onChange={(e) => setFormData(prev => ({ ...prev, plate: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Mevcut Kilometre</Label>
              <Input
                value={selectedMotorcycle?.current_km || ""}
                disabled
                className="bg-slate-100"
              />
              <p className="text-xs text-muted-foreground">Kilometre sadece bakım kaydıyla güncellenebilir</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>İptal</Button>
            <Button onClick={handleEditMotorcycle} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance Modal */}
      <Dialog open={showMaintenanceModal} onOpenChange={setShowMaintenanceModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bakım Kaydı</DialogTitle>
            <DialogDescription>
              {selectedMotorcycle && `${selectedMotorcycle.brand} ${selectedMotorcycle.model} - ${selectedMotorcycle.plate}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bakım Kilometresi</Label>
              <Input
                type="number"
                placeholder={selectedMotorcycle?.current_km?.toString()}
                value={maintenanceData.km_at_maintenance}
                onChange={(e) => setMaintenanceData(prev => ({ ...prev, km_at_maintenance: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Mevcut: {selectedMotorcycle && formatKm(selectedMotorcycle.current_km)}
              </p>
            </div>
            
            <div className="space-y-3">
              <Label>Yapılan Bakımlar</Label>
              
              <div className="flex items-center space-x-3 p-3 border rounded">
                <Checkbox
                  id="oil_change"
                  checked={maintenanceData.oil_change}
                  onCheckedChange={(checked) => setMaintenanceData(prev => ({ ...prev, oil_change: checked }))}
                />
                <div className="flex-1">
                  <label htmlFor="oil_change" className="text-sm font-medium cursor-pointer">
                    Yağ Bakımı
                  </label>
                  <p className="text-xs text-muted-foreground">Sonraki: +2.000 km</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 p-3 border rounded">
                <Checkbox
                  id="brake_maintenance"
                  checked={maintenanceData.brake_maintenance}
                  onCheckedChange={(checked) => setMaintenanceData(prev => ({ ...prev, brake_maintenance: checked }))}
                />
                <div className="flex-1">
                  <label htmlFor="brake_maintenance" className="text-sm font-medium cursor-pointer">
                    Fren Bakımı
                  </label>
                  <p className="text-xs text-muted-foreground">Sonraki: +2.000 km</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 p-3 border rounded">
                <Checkbox
                  id="variator_maintenance"
                  checked={maintenanceData.variator_maintenance}
                  onCheckedChange={(checked) => setMaintenanceData(prev => ({ ...prev, variator_maintenance: checked }))}
                />
                <div className="flex-1">
                  <label htmlFor="variator_maintenance" className="text-sm font-medium cursor-pointer">
                    Kayış/Varyatör Bakımı
                  </label>
                  <p className="text-xs text-muted-foreground">Sonraki: +5.000 km</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaintenanceModal(false)}>İptal</Button>
            <Button onClick={handleAddMaintenance} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Motosiklet Sil"
        description={`${selectedMotorcycle?.brand} ${selectedMotorcycle?.model} (${selectedMotorcycle?.plate}) silinecek. Bu işlem geri alınamaz.`}
        onConfirm={handleDeleteMotorcycle}
        variant="danger"
      />
    </div>
  );
}
