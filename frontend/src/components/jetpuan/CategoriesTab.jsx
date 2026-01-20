import { useState, useEffect, useCallback } from "react";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function CategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: "" });
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/categories`);
      setCategories(res.data);
    } catch (err) {
      if (!err.handled) {
      toast.error("Kategoriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: "" });
    setShowModal(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Kategori adı gerekli");
      return;
    }

    try {
      if (editingCategory) {
        await axios.put(`${API}/jetpuan/categories/${editingCategory.id}`, formData);
        toast.success("Kategori güncellendi");
      } else {
        await axios.post(`${API}/jetpuan/categories`, formData);
        toast.success("Kategori oluşturuldu");
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      if (!err.handled) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
      }
    }
  };

  const handleDelete = async (categoryId) => {
    setPendingDeleteId(categoryId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/jetpuan/categories/${pendingDeleteId}`);
      toast.success("Kategori silindi");
      fetchCategories();
    } catch (err) {
      if (!err.handled) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
      }
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Kategoriler ({categories.length})</h3>
        <Button onClick={openAddModal} className="font-semibold" data-testid="add-category-btn">
          <Plus className="w-4 h-4 mr-2" />
          Kategori Ekle
        </Button>
      </div>

      <div className="border-2 border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-primary">
              <TableHead className="font-bold">Kategori Adı</TableHead>
              <TableHead className="font-bold text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                  Henüz kategori eklenmemiş
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id} className="border-b border-border">
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(cat)} className="h-8 px-3 border-2">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(cat.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600">
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

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Kategori Düzenle" : "Yeni Kategori"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Kategori Adı</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Elektronik"
                className="mt-1 h-11 border-2"
                data-testid="category-name-input"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold">
              {editingCategory ? "Güncelle" : "Oluştur"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Kategori Silme"
        description="Bu kategoriyi silmek istediğinize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}
