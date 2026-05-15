import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ClipboardCheck, Plus, Trash2, AlertTriangle, Clock, Image as ImageIcon, X, Loader2, CheckCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const playTaskSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tone = (f, t, d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, t + d);
      o.start(t); o.stop(t + d);
    };
    const now = ctx.currentTime;
    tone(523.25, now, 0.18);       // C5
    tone(659.25, now + 0.13, 0.2);  // E5
    tone(783.99, now + 0.26, 0.25); // G5
  } catch { /* noop */ }
};

const formatRelative = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return d.toLocaleDateString("tr-TR");
};

const formatDue = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const isOverdue = (task) =>
  task.status === "pending" && task.due_date && new Date(task.due_date) < new Date();


function TaskCard({ task, isSuper, currentUserId, onComplete, onDelete }) {
  const overdue = isOverdue(task);
  const canDelete = isSuper && task.assigned_by === currentUserId && task.status === "pending";
  const canComplete = task.assigned_to === currentUserId && task.status === "pending";

  return (
    <div
      data-testid={`task-card-${task.id}`}
      className={`p-3 border-b last:border-b-0 ${task.is_urgent ? "bg-red-50/60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h5 className="font-semibold text-sm">{task.title}</h5>
          {task.is_urgent && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded">ACİL</span>
          )}
          {overdue && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded">GECİKEN</span>
          )}
          {task.status === "completed" && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">Tamamlandı</span>
          )}
        </div>
        {canDelete && (
          <button
            onClick={() => onDelete(task)}
            className="p-1 rounded hover:bg-red-100 text-red-600"
            title="Sil"
            data-testid={`delete-task-${task.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground mb-1 whitespace-pre-wrap">{task.description}</p>
      )}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <div>👤 Atanan: <span className="font-medium text-foreground">{task.assigned_to_name}</span></div>
        {isSuper && (
          <div>📤 Atayan: {task.assigned_by_name}</div>
        )}
        {task.due_date && (
          <div className={overdue ? "text-orange-600 font-medium" : ""}>
            <Clock className="w-3 h-3 inline mr-0.5" />
            Teslim: {formatDue(task.due_date)}
          </div>
        )}
        <div>{formatRelative(task.created_at)}</div>
      </div>
      {task.status === "completed" && (
        <div className="mt-2 pt-2 border-t border-dashed">
          {task.completion_notes && (
            <p className="text-xs text-slate-700 whitespace-pre-wrap mb-1">{task.completion_notes}</p>
          )}
          {task.completion_image_urls && task.completion_image_urls.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {task.completion_image_urls.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noreferrer" className="block">
                  <img src={img.url} alt="task" className="w-12 h-12 object-cover rounded border" />
                </a>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(task.completed_at)} tamamlandı</p>
        </div>
      )}
      {canComplete && (
        <Button
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={() => onComplete(task)}
          data-testid={`complete-task-${task.id}`}
        >
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
          Görevi Tamamla
        </Button>
      )}
    </div>
  );
}


function CreateTaskDialog({ open, onOpenChange, admins, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription(""); setAssigneeIds([]); setDueDate(""); setIsUrgent(false);
    }
  }, [open]);

  const toggleAssignee = (id) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Başlık gerekli");
    if (assigneeIds.length === 0) return toast.error("En az bir admin seçin");

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        assignee_ids: assigneeIds,
        is_urgent: isUrgent,
      };
      if (dueDate) payload.due_date = new Date(dueDate).toISOString();

      await axios.post(`${API}/tasks`, payload);
      toast.success(`${assigneeIds.length} görev oluşturuldu`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Görev oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="create-task-dialog">
        <DialogHeader>
          <DialogTitle>Yeni Görev</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Başlık *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Görev başlığı"
              data-testid="task-title-input"
            />
          </div>
          <div>
            <Label className="text-xs">Açıklama</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detay (opsiyonel)"
              rows={3}
              data-testid="task-desc-input"
            />
          </div>
          <div>
            <Label className="text-xs">Atanan Admin(ler) *</Label>
            <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
              {admins.length === 0 && (
                <p className="text-xs text-muted-foreground">Admin listesi yükleniyor...</p>
              )}
              {admins.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                  <Checkbox
                    checked={assigneeIds.includes(a.id)}
                    onCheckedChange={() => toggleAssignee(a.id)}
                    data-testid={`assignee-checkbox-${a.id}`}
                  />
                  <span>{a.name || a.username}</span>
                  {a.role === "superadmin" && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">SuperAdmin</span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Teslim Tarihi (opsiyonel)</Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="task-due-input"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={isUrgent}
              onCheckedChange={(c) => setIsUrgent(!!c)}
              data-testid="task-urgent-checkbox"
            />
            <span className="font-medium text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Acil
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="task-create-submit">
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function CompleteTaskDialog({ open, onOpenChange, task, onCompleted }) {
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) { setNotes(""); setFiles([]); }
  }, [open]);

  const handleFileChange = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length > 3) {
      toast.error("En fazla 3 resim yükleyebilirsiniz");
      return;
    }
    setFiles(list);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!task) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("notes", notes);
      files.forEach(f => fd.append("files", f));
      await axios.post(`${API}/tasks/${task.id}/complete`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Görev tamamlandı");
      onCompleted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Tamamlama başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="complete-task-dialog">
        <DialogHeader>
          <DialogTitle>Görevi Tamamla</DialogTitle>
        </DialogHeader>
        {task && (
          <p className="text-sm text-muted-foreground -mt-2">{task.title}</p>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Notlarınız</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tamamlama notu (opsiyonel)"
              rows={3}
              data-testid="complete-notes"
            />
          </div>
          <div>
            <Label className="text-xs">Resim Ekle (max 3)</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              data-testid="complete-files"
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {files.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="w-12 h-12 object-cover rounded border" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="complete-submit">
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Tamamla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function TasksPopover({ user }) {
  const isSuper = !!(user && (user.role === "systemadmin" || user.role === "superadmin" || user.is_super || user.is_super_admin));
  const currentUserId = user?.id || user?.admin_id || user?.user_id;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(isSuper ? "mine" : "mine");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [badgeCount, setBadgeCount] = useState(0);
  const [admins, setAdmins] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeTask, setCompleteTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState("all");
  const prevBadge = useRef(0);
  const isFirst = useRef(true);

  const fetchBadge = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/tasks/badge-count`);
      const c = res.data.count || 0;
      if (!isFirst.current && c > prevBadge.current) {
        playTaskSound();
      }
      prevBadge.current = c;
      isFirst.current = false;
      setBadgeCount(c);
    } catch { /* ignore */ }
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (tab === "mine") params.role_filter = "mine";
      else if (tab === "assigned_by_me") {
        params.role_filter = "assigned_by_me";
        params.status = "pending";
      } else if (tab === "all_completed") {
        params.role_filter = "all_completed";
      } else if (tab === "my_completed") {
        params.role_filter = "mine";
        params.status = "completed";
      } else if (tab === "my_pending") {
        params.role_filter = "mine";
        params.status = "pending";
      }
      if (isSuper && (tab === "assigned_by_me" || tab === "all_completed") && filterAssignee !== "all") {
        params.assignee = filterAssignee;
      }
      const res = await axios.get(`${API}/tasks`, { params });
      setTasks(res.data.tasks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tab, filterAssignee, isSuper]);

  const fetchAdmins = useCallback(async () => {
    if (!isSuper) return;
    try {
      const res = await axios.get(`${API}/tasks/admins/list`);
      setAdmins(res.data.admins || []);
    } catch { /* ignore */ }
  }, [isSuper]);

  useEffect(() => {
    fetchBadge();
    const interval = setInterval(fetchBadge, 15000);
    return () => clearInterval(interval);
  }, [fetchBadge]);

  useEffect(() => {
    if (open) {
      fetchTasks();
      fetchAdmins();
    }
  }, [open, fetchTasks, fetchAdmins]);

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    try {
      await axios.delete(`${API}/tasks/${confirmDelete.id}`);
      toast.success("Görev silindi");
      setConfirmDelete(null);
      fetchTasks();
      fetchBadge();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  // Tab listesi role'e göre
  const tabsForSuper = [
    { value: "mine", label: "Görevlerim" },
    { value: "assigned_by_me", label: "Bekleyen Görevler" },
    { value: "all_completed", label: "Tamamlananlar" },
  ];
  const tabsForAdmin = [
    { value: "my_pending", label: "Görevlerim" },
    { value: "my_completed", label: "Tamamlanan" },
  ];
  const tabList = isSuper ? tabsForSuper : tabsForAdmin;

  // Default tab admin için my_pending
  useEffect(() => {
    if (!isSuper && tab === "mine") setTab("my_pending");
  }, [isSuper, tab]);

  const showAssigneeFilter = isSuper && (tab === "assigned_by_me" || tab === "all_completed");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="relative border-2 font-semibold"
            data-testid="tasks-btn"
          >
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Görevler
            {badgeCount > 0 && (
              <span className="absolute -top-2 -right-2 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-red-500">
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[440px] p-0 mx-4" align="end">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Görevler</h4>
              {isSuper && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCreateOpen(true)}
                  data-testid="new-task-btn"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Yeni
                </Button>
              )}
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className={`grid w-full ${tabList.length === 3 ? "grid-cols-3" : "grid-cols-2"} h-9`}>
                {tabList.map(t => (
                  <TabsTrigger key={t.value} value={t.value} className="text-[11px]" data-testid={`task-tab-${t.value}`}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {showAssigneeFilter && (
                <div className="mt-2">
                  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger className="h-7 text-xs" data-testid="task-assignee-filter">
                      <SelectValue placeholder="Tüm admin'ler" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm admin'ler</SelectItem>
                      {admins.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name || a.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="max-h-[400px] overflow-y-auto mt-2 -mx-3">
                {tabList.map(t => (
                  <TabsContent key={t.value} value={t.value} className="m-0">
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Görev yok</p>
                      </div>
                    ) : (
                      tasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isSuper={isSuper}
                          currentUserId={currentUserId}
                          onComplete={setCompleteTask}
                          onDelete={setConfirmDelete}
                        />
                      ))
                    )}
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        </PopoverContent>
      </Popover>

      {isSuper && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          admins={admins}
          onCreated={() => { fetchTasks(); fetchBadge(); }}
        />
      )}
      <CompleteTaskDialog
        open={!!completeTask}
        onOpenChange={(o) => !o && setCompleteTask(null)}
        task={completeTask}
        onCompleted={() => { fetchTasks(); fetchBadge(); }}
      />
      <ConfirmModal
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Görevi Sil"
        description={`"${confirmDelete?.title || ""}" görevini silmek istiyor musunuz?`}
        onConfirm={handleDeleteConfirm}
        variant="danger"
      />
    </>
  );
}
