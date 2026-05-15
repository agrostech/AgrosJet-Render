import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Calculator,
  Package,
  ShoppingBag,
  FileText,
  AlertTriangle,
  Coffee,
  Loader2,
  UserPlus
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const playTone = (frequency, startTime, duration) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = audioContext.currentTime;
    playTone(880, now, 0.15);           // A5
    playTone(1108.73, now + 0.1, 0.2);  // C#6
    playTone(1318.51, now + 0.2, 0.25); // E6
    
  } catch (e) {
    console.log("Audio not supported");
  }
};

const NOTIFICATION_ICONS = {
  muhasebe_hareket: Calculator,
  zimmet_hareket: Package,
  jetpuan_siparis: ShoppingBag,
  evrak_yuklendi: FileText,
  invoice_uploaded: FileText,
  fatura_eksik: AlertTriangle,
  fesih_3_gun: AlertTriangle,
  fesih_yarin: AlertTriangle,
  break_request: Coffee,
  break_approved: Coffee,
  break_rejected: Coffee,
  break_started: Coffee,
  break_ended: Coffee,
  basvuru: UserPlus,
};

const NOTIFICATION_COLORS = {
  muhasebe_hareket: "text-blue-600 bg-blue-100",
  zimmet_hareket: "text-purple-600 bg-purple-100",
  jetpuan_siparis: "text-amber-600 bg-amber-100",
  evrak_yuklendi: "text-green-600 bg-green-100",
  invoice_uploaded: "text-green-600 bg-green-100",
  fatura_eksik: "text-orange-600 bg-orange-100",
  fesih_3_gun: "text-orange-600 bg-orange-100",
  fesih_yarin: "text-red-600 bg-red-100",
  break_request: "text-amber-600 bg-amber-100",
  break_approved: "text-green-600 bg-green-100",
  break_rejected: "text-red-600 bg-red-100",
  break_started: "text-blue-600 bg-blue-100",
  break_ended: "text-gray-600 bg-gray-100",
  basvuru: "text-teal-600 bg-teal-100",
};

export default function NotificationsPopover({ companyId }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const prevUnreadCount = useRef(0);
  const isFirstLoad = useRef(true);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/notifications/company/${companyId}/unread-count`);
      const newCount = res.data.count;
      
      // Play sound if new notifications arrived (not on first load)
      if (!isFirstLoad.current && newCount > prevUnreadCount.current) {
        playNotificationSound();
      }
      
      prevUnreadCount.current = newCount;
      isFirstLoad.current = false;
      setUnreadCount(newCount);
    } catch (err) {
      console.error("Bildirim sayısı alınamadı");
    }
  }, [companyId]);

  const fetchNotifications = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Check fesih notifications
      await axios.get(`${API}/notifications/company/${companyId}/check-fesih`);
      // Check missing invoice notifications
      await axios.get(`${API}/notifications/company/${companyId}/check-missing-invoices`);
      
      const res = await axios.get(`${API}/notifications/company/${companyId}?include_read=true&limit=30`);
      setNotifications(res.data);
      
      // Update unread count - break_request tipini hariç tut (Talepler butonunda gösteriliyor)
      const unread = res.data.filter(n => !n.is_read && n.type !== 'break_request').length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Bildirimler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Fetch unread count on mount and periodically
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000); // Every 10 seconds
    
    // Also fetch when window gains focus
    const handleFocus = () => fetchUnreadCount();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchUnreadCount]);

  // Fetch notifications when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
      // Keep fetching while popover is open
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [open, fetchNotifications]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem başarısız");
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.put(`${API}/notifications/company/${companyId}/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("Tüm bildirimler okundu");
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem başarısız");
      }
    }
  };

  const handleDelete = async (notificationId) => {
    try {
      await axios.delete(`${API}/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success("Bildirim silindi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Silme başarısız");
      }
    }
  };

  const handleDeleteAll = async () => {
    setConfirmOpen(true);
  };

  const confirmDeleteAll = async () => {
    try {
      await axios.delete(`${API}/notifications/company/${companyId}/all`);
      setNotifications([]);
      setUnreadCount(0);
      toast.success("Tüm bildirimler silindi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Silme başarısız");
      }
    } finally {
      setConfirmOpen(false);
    }
  };

  // Mola talebi onay/red — Talepler butonuna taşındı (RequestsPopover.jsx)

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Az önce";
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="relative border-2 font-semibold"
          data-testid="notifications-btn"
        >
          <Bell className="w-4 h-4 mr-2" />
          Bildirimler
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-red-500">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0 mx-4" align="end">
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Bildirimler</h4>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleMarkAllAsRead}
                  className="h-7 px-2 text-xs"
                  title="Tümünü okundu işaretle"
                >
                  <CheckCheck className="w-4 h-4" />
                </Button>
              )}
              {notifications.filter(n => n.type !== 'break_request').length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDeleteAll}
                  className="h-7 px-2 text-xs hover:text-red-600"
                  title="Tümünü sil"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.filter(n => n.type !== 'break_request').length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Bildirim yok</p>
            </div>
          ) : (
            notifications.filter(n => n.type !== 'break_request').map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
              const colorClass = NOTIFICATION_COLORS[notification.type] || "text-slate-600 bg-slate-100";
              
              return (
                <div 
                  key={notification.id}
                  className={`p-3 border-b hover:bg-slate-50 transition-colors ${
                    !notification.is_read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </p>
                        <div className="flex gap-1 flex-shrink-0">
                          {!notification.is_read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="p-1 rounded hover:bg-green-100 text-green-600"
                              title="Okundu işaretle"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="p-1 rounded hover:bg-red-100 text-red-600"
                            title="Sil"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Tüm Bildirimleri Sil"
        description="Tüm bildirimleri silmek istediğinize emin misiniz?"
        onConfirm={confirmDeleteAll}
        variant="danger"
      />
    </Popover>
  );
}
