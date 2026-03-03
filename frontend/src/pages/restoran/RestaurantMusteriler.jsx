import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  User,
  RefreshCw,
  Package
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantMusteriler({ restaurantId }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    address_direction: "",
    note: ""
  });

  const fetchCustomers = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const params = searchQuery ? { search: searchQuery } : {};
      const res = await axios.get(`${API}/customers/${restaurantId}`, { params });
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error("Müşteriler yüklenemedi:", err);
      toast.error("Müşteriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, searchQuery]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      address: "",
      address_direction: "",
      note: ""
    });
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.phone) {
      toast.error("Ad ve telefon zorunludur");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/customers/${restaurantId}`, formData);
      toast.success("Müşteri eklendi");
      setShowAddModal(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Müşteri eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!formData.name || !formData.phone) {
      toast.error("Ad ve telefon zorunludur");
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API}/customers/${restaurantId}/${selectedCustomer.id}`, formData);
      toast.success("Müşteri güncellendi");
      setShowEditModal(false);
      setSelectedCustomer(null);
      resetForm();
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Müşteri güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/customers/${restaurantId}/${selectedCustomer.id}`);
      toast.success("Müşteri silindi");
      setShowDeleteDialog(false);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Müşteri silinemedi");
    }
  };

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name || "",
      phone: customer.phone || "",
      address: customer.address || "",
      address_direction: customer.address_direction || "",
      note: customer.note || ""
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (customer) => {
    setSelectedCustomer(customer);
    setShowDeleteDialog(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="restaurant-musteriler">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-slate-700" />
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900">Müşteriler</h1>
          <span className="text-sm text-muted-foreground">({customers.length})</span>
        </div>
        <Button onClick={() => { resetForm(); setShowAddModal(true); }} data-testid="add-customer-btn">
          <Plus className="w-4 h-4 mr-2" />
          Müşteri Ekle
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Ad, telefon veya adres ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="customer-search-input"
              />
            </div>
            <Button type="submit" variant="outline" data-testid="customer-search-btn">
              <Search className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" onClick={() => { setSearchQuery(""); fetchCustomers(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Customer List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? "Arama sonucu bulunamadı" : "Henüz müşteri kaydı yok"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Telefon siparişleri otomatik olarak kaydedilir
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="p-4 hover:bg-muted/30 transition-colors"
                  data-testid={`customer-row-${customer.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="font-medium text-slate-900 truncate">{customer.name}</span>
                        {customer.order_count > 1 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {customer.order_count}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="font-mono">{customer.phone}</span>
                      </div>
                      {customer.address && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{customer.address}</span>
                        </div>
                      )}
                      {customer.note && (
                        <p className="text-xs text-muted-foreground italic pl-5">Not: {customer.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEditModal(customer)}
                        data-testid={`edit-customer-${customer.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeleteDialog(customer)}
                        data-testid={`delete-customer-${customer.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Yeni Müşteri
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Müşteri Adı *</Label>
              <Input
                id="add-name"
                placeholder="Müşteri adı"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="customer-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-phone">Telefon *</Label>
              <Input
                id="add-phone"
                placeholder="05XX XXX XX XX"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="customer-phone-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-address">Adres</Label>
              <Input
                id="add-address"
                placeholder="Teslimat adresi"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                data-testid="customer-address-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-direction">Adres Tarifi</Label>
              <Input
                id="add-direction"
                placeholder="Kapı no, kat, daire vb."
                value={formData.address_direction}
                onChange={(e) => setFormData({ ...formData, address_direction: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-note">Not</Label>
              <Input
                id="add-note"
                placeholder="Müşteri hakkında not"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>İptal</Button>
            <Button onClick={handleAdd} disabled={saving} data-testid="save-customer-btn">
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Müşteri Düzenle
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Müşteri Adı *</Label>
              <Input
                id="edit-name"
                placeholder="Müşteri adı"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefon *</Label>
              <Input
                id="edit-phone"
                placeholder="05XX XXX XX XX"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Adres</Label>
              <Input
                id="edit-address"
                placeholder="Teslimat adresi"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-direction">Adres Tarifi</Label>
              <Input
                id="edit-direction"
                placeholder="Kapı no, kat, daire vb."
                value={formData.address_direction}
                onChange={(e) => setFormData({ ...formData, address_direction: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-note">Not</Label>
              <Input
                id="edit-note"
                placeholder="Müşteri hakkında not"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>İptal</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Edit2 className="w-4 h-4 mr-2" />}
              Güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedCustomer?.name}</strong> adlı müşteriyi silmek istediğinize emin misiniz?
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
