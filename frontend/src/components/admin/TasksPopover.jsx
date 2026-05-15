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
import { ClipboardCheck, Plus, Trash2, AlertTriangle, Clock, Image as ImageIcon, X, Loader2, CheckCircle, ChevronDown } from "lucide-react";

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
  const isTemplate = task.status === "recurring_template";
  const isScheduled = task.status === "scheduled";
  const canDelete = isSuper && task.assigned_by === currentUserId && task.status !== "completed";
  const canComplete = task.assigned_to === currentUserId && task.status === "pending";
  const [expanded, setExpanded] = useState(false);
  const hasDetails = task.description || task.due_date || isTemplate || isScheduled || (task.status === "completed" && (task.completion_notes || (task.completion_image_urls && task.completion_image_urls.length > 0)));

  const dayShort = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const recDays = (task.recurrence?.days_of_week || []).map(d => dayShort[d]).join(", ");

  return (
    <div
      data-testid={`task-card-${task.id}`}
      className={`group px-3 py-2 border-b last:border-b-0 hover:bg-slate-50/50 transition-colors ${
        task.is_urgent && task.status === "pending" ? "border-l-2 border-l-red-500" : ""
      } ${isTemplate ? "border-l-2 border-l-purple-500 bg-purple-50/20" : ""} ${isScheduled ? "border-l-2 border-l-amber-500 bg-amber-50/20" : ""}`}
    >
      {/* Üst satır: başlık + rozetler + aksiyonlar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={`font-medium text-[13px] truncate ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </span>
          {isTemplate && (
            <span className="px-1 py-0 text-[9px] font-bold bg-purple-500 text-white rounded leading-tight flex-shrink-0">TEKRARLAYAN</span>
          )}
          {isScheduled && (
            <span className="px-1 py-0 text-[9px] font-bold bg-amber-500 text-white rounded leading-tight flex-shrink-0">ZAMANLANMIŞ</span>
          )}
          {task.is_urgent && task.status === "pending" && (
            <span className="px-1 py-0 text-[9px] font-bold bg-red-500 text-white rounded leading-tight flex-shrink-0">ACİL</span>
          )}
          {overdue && (
            <span className="px-1 py-0 text-[9px] font-bold bg-orange-500 text-white rounded leading-tight flex-shrink-0">GECİKEN</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {hasDetails && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-0.5 rounded hover:bg-slate-200 text-muted-foreground"
              title={expanded ? "Detayı gizle" : "Detayı göster"}
              data-testid={`expand-task-${task.id}`}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          {canComplete && (
            <button
              onClick={() => onComplete(task)}
              className="p-1 rounded hover:bg-green-100 text-green-600"
              title="Görevi Tamamla"
              data-testid={`complete-task-${task.id}`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
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
      </div>

      {/* Alt satır: meta */}
      <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground mt-0.5">
        <span className="truncate">{task.assigned_to_name}</span>
        {isSuper && task.assigned_by !== task.assigned_to && (
          <>
            <span className="opacity-40">·</span>
            <span className="truncate">↤ {task.assigned_by_name}</span>
          </>
        )}
        {isTemplate ? (
          <>
            <span className="opacity-40">·</span>
            <span className="whitespace-nowrap">{recDays} · {task.recurrence?.time_of_day}</span>
          </>
        ) : isScheduled ? (
          <>
            <span className="opacity-40">·</span>
            <span className="whitespace-nowrap">{formatDue(task.scheduled_at)}</span>
          </>
        ) : (
          <>
            <span className="opacity-40">·</span>
            <span className="whitespace-nowrap">{formatRelative(task.created_at)}</span>
            {task.due_date && task.status === "pending" && (
              <>
                <span className="opacity-40">·</span>
                <span className={`whitespace-nowrap ${overdue ? "text-orange-600 font-medium" : ""}`}>
                  <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                  {formatDue(task.due_date)}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Genişletilmiş detay */}
      {expanded && hasDetails && (
        <div className="mt-1.5 pl-2 border-l-2 border-slate-200 space-y-1">
          {task.description && (
            <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap">{task.description}</p>
          )}
          {isTemplate && task.recurrence?.until && (
            <p className="text-[11px] text-muted-foreground">Bitiş: {formatDue(task.recurrence.until)}</p>
          )}
          {task.status === "completed" && task.completion_notes && (
            <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap italic">"{task.completion_notes}"</p>
          )}
          {task.status === "completed" && task.completion_image_urls && task.completion_image_urls.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {task.completion_image_urls.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noreferrer">
                  <img src={img.url} alt="" className="w-10 h-10 object-cover rounded border hover:scale-110 transition-transform" />
                </a>
              ))}
            </div>
          )}
          {task.status === "completed" && task.completed_at && (
            <p className="text-[10px] text-muted-foreground">
              {formatRelative(task.completed_at)} tamamlandı
            </p>
          )}
        </div>
      )}
    </div>
  );
}


function CreateTaskDialog({ open, onOpenChange, admins, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [scheduleMode, setScheduleMode] = useState("now"); // now | scheduled | recurring
  const [dueDate, setDueDate] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recDays, setRecDays] = useState([]); // 0..6 (Pzt..Paz)
  const [recTime, setRecTime] = useState("09:00");
  const [recUntil, setRecUntil] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription(""); setAssigneeIds([]);
      setScheduleMode("now");
      setDueDate(""); setScheduledAt("");
      setRecDays([]); setRecTime("09:00"); setRecUntil("");
      setIsUrgent(false);
    }
  }, [open]);

  const toggleAssignee = (id) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDay = (d) => {
    setRecDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const dayLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Başlık gerekli");
    if (assigneeIds.length === 0) return toast.error("En az bir admin seçin");

    if (scheduleMode === "scheduled" && !scheduledAt) {
      return toast.error("İleri tarih için tarih/saat seçin");
    }
    if (scheduleMode === "recurring") {
      if (recDays.length === 0) return toast.error("En az bir gün seçin");
      if (!recTime) return toast.error("Tekrar saati gerekli");
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        assignee_ids: assigneeIds,
        is_urgent: scheduleMode === "recurring" ? false : isUrgent,
      };
      if (scheduleMode === "scheduled") {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
      } else if (scheduleMode === "recurring") {
        payload.recurrence = {
          days_of_week: recDays,
          time_of_day: recTime,
          until: recUntil ? new Date(recUntil).toISOString() : null,
        };
      } else if (dueDate) {
        payload.due_date = new Date(dueDate).toISOString();
      }

      await axios.post(`${API}/tasks`, payload);
      const msg = scheduleMode === "recurring"
        ? `${assigneeIds.length} tekrarlayan görev oluşturuldu`
        : scheduleMode === "scheduled"
          ? `${assigneeIds.length} görev zamanlandı`
          : `${assigneeIds.length} görev oluşturuldu`;
      toast.success(msg);
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
              rows={2}
              data-testid="task-desc-input"
            />
          </div>
          <div>
            <Label className="text-xs">Atanan Yönetici(ler) *</Label>
            <div className="border rounded p-2 max-h-32 overflow-y-auto space-y-1">
              {admins.length === 0 && (
                <p className="text-xs text-muted-foreground">Yönetici listesi yükleniyor...</p>
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

          {/* Zamanlama Modu */}
          <div>
            <Label className="text-xs">Zamanlama</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {[
                { val: "now", label: "Hemen" },
                { val: "scheduled", label: "İleri Tarih" },
                { val: "recurring", label: "Tekrarlayan" },
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setScheduleMode(opt.val)}
                  className={`text-xs py-1.5 px-2 rounded border transition-colors ${
                    scheduleMode === opt.val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                  data-testid={`schedule-mode-${opt.val}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {scheduleMode === "now" && (
            <div>
              <Label className="text-xs">Teslim Tarihi (opsiyonel)</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="task-due-input"
              />
            </div>
          )}

          {scheduleMode === "scheduled" && (
            <div>
              <Label className="text-xs">Görev tarihi/saati *</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                data-testid="task-scheduled-input"
              />
              <p className="text-[10.5px] text-muted-foreground mt-1">
                Görev bu tarih/saat gelene kadar atanan yöneticide görünmez.
              </p>
            </div>
          )}

          {scheduleMode === "recurring" && (
            <div className="space-y-2 p-2 border border-dashed rounded">
              <div>
                <Label className="text-xs">Günler *</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {dayLabels.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`text-xs w-9 h-7 rounded border transition-colors ${
                        recDays.includes(i)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                      data-testid={`rec-day-${i}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Saat *</Label>
                  <Input
                    type="time"
                    value={recTime}
                    onChange={(e) => setRecTime(e.target.value)}
                    data-testid="rec-time-input"
                  />
                </div>
                <div>
                  <Label className="text-xs">Bitiş (ops.)</Label>
                  <Input
                    type="date"
                    value={recUntil}
                    onChange={(e) => setRecUntil(e.target.value)}
                    data-testid="rec-until-input"
                  />
                </div>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Seçilen gün(ler)de belirlenen saatte yönetici paneline her seferinde yeni bir görev düşer.
              </p>
            </div>
          )}

          {scheduleMode !== "recurring" && (
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
          )}
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
      if (tab === "mine") {
        params.role_filter = "mine";
        params.status = "pending"; // Tamamlananlar "Tamamlananlar" sekmesinde
      }
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
                      <SelectValue placeholder="Tüm Yöneticiler" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm Yöneticiler</SelectItem>
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
