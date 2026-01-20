import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  GraduationCap, 
  Plus, 
  Video, 
  FileText, 
  Trash2, 
  Pencil,
  Upload,
  Play,
  Calendar
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AkademiPage({ companyId }) {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  
  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  
  // Add form state
  const [addForm, setAddForm] = useState({
    title: "",
    content: "",
    training_type: "video",
    video: null
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchTrainings = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/academy/company/${companyId}/trainings`);
      setTrainings(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Eğitimler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  const handleAddTraining = async (e) => {
    e.preventDefault();
    if (!addForm.title.trim()) {
      toast.error("Eğitim başlığı gerekli");
      return;
    }
    
    if (addForm.training_type === "video" && !addForm.video) {
      toast.error("Video dosyası seçin");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", addForm.title);
      formData.append("content", addForm.content || "");
      formData.append("training_type", addForm.training_type);
      if (addForm.video) {
        formData.append("video", addForm.video);
      }

      await axios.post(`${API}/academy/company/${companyId}/trainings`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      toast.success("Eğitim eklendi");
      setShowAddModal(false);
      setAddForm({ title: "", content: "", training_type: "video", video: null });
      fetchTrainings();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Eğitim eklenemedi");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateTraining = async (e) => {
    e.preventDefault();
    if (!selectedTraining) return;

    try {
      await axios.put(`${API}/academy/training/${selectedTraining.id}`, {
        title: selectedTraining.title,
        content: selectedTraining.content
      });
      toast.success("Eğitim güncellendi");
      setShowEditModal(false);
      fetchTrainings();
    } catch (err) {
      toast.error("Güncelleme başarısız");
    }
  };

  const handleDeleteClick = (training) => {
    setPendingDelete(training);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await axios.delete(`${API}/academy/training/${pendingDelete.id}`);
      toast.success("Eğitim silindi");
      fetchTrainings();
    } catch (err) {
      toast.error("Silme başarısız");
    }
    setConfirmOpen(false);
    setPendingDelete(null);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (loading) return <PageLoading />;

  return (
    <div data-testid="admin-akademi-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-xl sm:text-2xl font-bold">Akademi</h2>
            <p className="text-sm text-muted-foreground">Kurye eğitim içerikleri</p>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)} data-testid="add-training-btn">
          <Plus className="w-4 h-4 mr-2" />
          Eğitim Ekle
        </Button>
      </div>

      {/* Trainings List */}
      {trainings.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 sm:p-12 text-center">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground mb-4">Henüz eğitim içeriği eklenmemiş</p>
          <Button variant="outline" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            İlk Eğitimi Ekle
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainings.map((training) => (
            <div 
              key={training.id} 
              className="border-2 border-border bg-white rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
            >
              {/* Thumbnail / Type indicator */}
              <div 
                className={`h-32 flex items-center justify-center cursor-pointer ${
                  training.training_type === "video" 
                    ? "bg-slate-900" 
                    : "bg-gradient-to-br from-slate-100 to-slate-200"
                }`}
                onClick={() => {
                  setSelectedTraining(training);
                  setShowVideoModal(true);
                }}
              >
                {training.training_type === "video" ? (
                  <div className="text-center">
                    <Play className="w-12 h-12 text-white/80 mx-auto" />
                    <span className="text-xs text-white/60 mt-1">Video</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                    <span className="text-xs text-slate-500 mt-1">Yazılı İçerik</span>
                  </div>
                )}
              </div>
              
              {/* Content */}
              <div className="p-3">
                <h3 className="font-semibold text-sm truncate">{training.title}</h3>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {formatDate(training.created_at)}
                </div>
                
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setSelectedTraining(training);
                      setShowEditModal(true);
                    }}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Düzenle
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    onClick={() => handleDeleteClick(training)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Training Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Yeni Eğitim Ekle
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTraining} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Eğitim Başlığı</Label>
              <Input
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                placeholder="Örn: Uygulama Kullanım Rehberi"
                className="mt-1 border-2"
                data-testid="training-title-input"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Eğitim Tipi</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, training_type: "video", video: null })}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    addForm.training_type === "video"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Video className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-xs font-medium">Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, training_type: "text", video: null })}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    addForm.training_type === "text"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <FileText className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-xs font-medium">Yazılı</span>
                </button>
              </div>
            </div>

            {addForm.training_type === "video" && (
              <div>
                <Label className="text-sm font-semibold">Video Dosyası</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => setAddForm({ ...addForm, video: e.target.files?.[0] || null })}
                  className="hidden"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {addForm.video ? (
                    <div className="flex items-center justify-center gap-2">
                      <Video className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium truncate">{addForm.video.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">Video seçmek için tıklayın</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">MP4, WebM, MOV (max 500MB)</p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-semibold">
                {addForm.training_type === "text" ? "İçerik" : "Açıklama (Opsiyonel)"}
              </Label>
              <Textarea
                value={addForm.content}
                onChange={(e) => setAddForm({ ...addForm, content: e.target.value })}
                placeholder={addForm.training_type === "text" ? "Eğitim içeriğini yazın..." : "Video hakkında kısa açıklama"}
                className="mt-1 border-2 min-h-[120px]"
                data-testid="training-content-input"
              />
            </div>

            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? "Yükleniyor..." : "Eğitim Ekle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Training Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Eğitimi Düzenle
            </DialogTitle>
          </DialogHeader>
          {selectedTraining && (
            <form onSubmit={handleUpdateTraining} className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Eğitim Başlığı</Label>
                <Input
                  value={selectedTraining.title}
                  onChange={(e) => setSelectedTraining({ ...selectedTraining, title: e.target.value })}
                  className="mt-1 border-2"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">
                  {selectedTraining.training_type === "text" ? "İçerik" : "Açıklama"}
                </Label>
                <Textarea
                  value={selectedTraining.content || ""}
                  onChange={(e) => setSelectedTraining({ ...selectedTraining, content: e.target.value })}
                  className="mt-1 border-2 min-h-[120px]"
                />
              </div>
              <Button type="submit" className="w-full">Kaydet</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* View Training Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTraining?.title}</DialogTitle>
          </DialogHeader>
          {selectedTraining && (
            <div className="space-y-4">
              {selectedTraining.training_type === "video" && selectedTraining.video_path && (
                <video 
                  controls 
                  className="w-full rounded-lg bg-black"
                  src={`${process.env.REACT_APP_BACKEND_URL}${selectedTraining.video_path}`}
                >
                  Tarayıcınız video oynatmayı desteklemiyor.
                </video>
              )}
              {selectedTraining.content && (
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap text-sm">{selectedTraining.content}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eğitimi Sil"
        description={`"${pendingDelete?.title}" eğitimini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        variant="danger"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
