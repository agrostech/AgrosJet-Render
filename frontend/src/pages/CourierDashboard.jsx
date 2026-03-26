import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Routes, Route, Link, useLocation, useSearchParams, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Clock, Calculator, Package, FileText, ShoppingBag, GraduationCap, Bike, MoreHorizontal, ClipboardList, Check, Coffee, XCircle, BarChart3, ChevronDown, Shield, Moon, Sun } from "lucide-react";
import CourierSidebar from "@/components/courier/CourierSidebar";
import { BreakModal } from "@/components/courier/BreakModal";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Page components
import CourierVardiyalarPage from "./courier/CourierVardiyalarPage";
import CourierMuhasebePage from "./courier/CourierMuhasebePage";
import CourierZimmetPage from "./courier/CourierZimmetPage";
import CourierEvraklarPage from "./courier/CourierEvraklarPage";
import CourierMotosikletimPage from "./courier/CourierMotosikletimPage";
import CourierJetPuanPage from "./courier/CourierJetPuanPage";
import CourierAkademiPage from "./courier/CourierAkademiPage";
import CourierSiparisPage from "./courier/CourierSiparisPage";
import CourierRaporlarPage from "./courier/CourierRaporlarPage";
import CourierKVKKPage from "./courier/CourierKVKKPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// İsim kısaltma fonksiyonu (AHMET MEHMET YILMAZ -> AHMET M. YILMAZ)
const formatCourierName = (name) => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  // İlk isim + orta isimlerin baş harfleri + son isim
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleInitials = parts.slice(1, -1).map(p => p[0] + ".").join(" ");
  return `${firstName} ${middleInitials} ${lastName}`;
};

// Bottom bar itemları (mobilde alt bar, masaüstünde sidebar'da da görünür)
const getBottomBarItems = (basePath) => [
  { path: basePath, label: "Siparişler", icon: ClipboardList, key: "siparis" },
  { path: `${basePath}/vardiyalar`, label: "Vardiyalar", icon: Clock, key: "vardiya" },
  { path: `${basePath}/muhasebe`, label: "Muhasebe", icon: Calculator, key: "muhasebe" },
  { path: `${basePath}/raporlar`, label: "Raporlar", icon: BarChart3, key: "raporlar" },
];

// Sidebar-only itemlar (bottom bar'da görünmez)
const getSidebarItems = (basePath) => [
  { path: `${basePath}/zimmet`, label: "Zimmetlerim", icon: Package, key: "zimmet" },
  { path: `${basePath}/motosikletim`, label: "Motosikletim", icon: Bike, key: "motosikletim" },
  { path: `${basePath}/akademi`, label: "Akademi", icon: GraduationCap, key: "akademi" },
  { path: `${basePath}/jetpuan`, label: "Market", icon: ShoppingBag, key: "jetpuan" },
  { path: `${basePath}/evraklar`, label: "Evraklar", icon: FileText, key: "evraklar" },
];

// Kurye durumları
const AVAILABILITY_STATUSES = {
  active: { label: "Aktif", color: "bg-green-500", icon: Check },
  on_break: { label: "Molada", color: "bg-yellow-500", icon: Coffee },
  offline: { label: "Çevrimdışı", color: "bg-gray-400", icon: XCircle },
};

export default function CourierDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courierId: urlCourierId } = useParams(); // URL'den courier ID al (/kurye/:courierId)
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [documentsComplete, setDocumentsComplete] = useState(true);
  const [maintenanceNotifications, setMaintenanceNotifications] = useState(0);
  const [navItems, setNavItems] = useState([]);
  const [bottomBarItems, setBottomBarItems] = useState([]);
  const [sidebarOnlyItems, setSidebarOnlyItems] = useState([]);
  const [availabilityStatus, setAvailabilityStatus] = useState("offline");
  const [statusLoading, setStatusLoading] = useState(false);
  const [breakStatus, setBreakStatus] = useState(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [courierBreakInfo, setCourierBreakInfo] = useState({ dailyLimit: 30, usedTime: 0 });
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  
  // Base path for navigation (dynamic based on URL)
  const basePath = urlCourierId ? `/kurye/${urlCourierId}` : '/courier';
  
  // NavItems'ı basePath değiştiğinde güncelle
  useEffect(() => {
    setNavItems([...getBottomBarItems(basePath), ...getSidebarItems(basePath)]);
    setBottomBarItems(getBottomBarItems(basePath));
    setSidebarOnlyItems(getSidebarItems(basePath));
  }, [basePath]);
  
  // Refs for background task management
  const wakeLockRef = useRef(null);
  const lastLocationRef = useRef({ lat: 0, lng: 0, time: 0 });

  // Wake Lock API - ekranın kapanmasını önle
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && availabilityStatus !== 'offline') {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock aktif - kurye paneli ekran açık kalacak');
        
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock serbest bırakıldı');
        });
      }
    } catch (err) {
      console.log('Wake Lock alınamadı:', err.message);
    }
  }, [availabilityStatus]);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Native'den gelen konum güncellemelerini backend'e gönder
  const sendLocationToBackend = useCallback(async (latitude, longitude, accuracy, speed) => {
    const courierId = user?.id;
    if (!courierId) return;

    try {
      const payload = { latitude, longitude };
      if (accuracy != null) payload.accuracy = accuracy;
      if (speed != null && speed >= 0) payload.speed = speed;

      // Push token ve platform bilgisini de gönder
      const pushToken = localStorage.getItem("push_token") || "";
      if (pushToken) {
        payload.push_token = pushToken;
        payload.platform = pushToken.startsWith("ExponentPushToken") ? "ios" : "android";
      }

      await axios.put(`${API}/couriers/${courierId}/location`, payload);
    } catch (err) {
      // Sessiz hata
    }
  }, [user?.id]);

  // Native konum mesajlarını dinle (LOCATION_UPDATE, LAST_LOCATION_RESULT, LOCATION_RESULT)
  useEffect(() => {
    const handleLocationMessage = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'LOCATION_UPDATE' && msg?.data) {
          const { latitude, longitude, accuracy, speed } = msg.data;
          if (latitude && longitude) {
            lastLocationRef.current = { lat: latitude, lng: longitude, time: Date.now() };
            sendLocationToBackend(latitude, longitude, accuracy, speed);
          }
        }
      } catch (e) {}
    };

    const handleLocationCustomEvent = (e) => {
      handleLocationMessage({ data: e.detail });
    };

    window.addEventListener('message', handleLocationMessage);
    window.addEventListener('nativeMessage', handleLocationCustomEvent);

    return () => {
      window.removeEventListener('message', handleLocationMessage);
      window.removeEventListener('nativeMessage', handleLocationCustomEvent);
    };
  }, [sendLocationToBackend]);

  // Fetch document status
  const checkDocumentStatus = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/documents/courier/${courierId}/status`);
      setDocumentsComplete(res.data.all_complete);
    } catch (err) {
      console.error("Evrak durumu alınamadı", err);
    }
  }, []);

  // FCM Token'ı backend'e kaydet
  const saveFcmToken = useCallback(async (courierId, fcmToken) => {
    try {
      const sessionId = localStorage.getItem("push_session_id") || "";
      await axios.put(`${API}/couriers/${courierId}/fcm-token`, {
        fcm_token: fcmToken,
        session_id: sessionId
      });
      console.log('FCM Token kaydedildi');
    } catch (err) {
      console.error('FCM Token kaydetme hatası:', err);
    }
  }, []);

  // Native app'ten gelen mesajları dinle (FCM Token için)
  useEffect(() => {
    const handleNativeMessage = async (data) => {
      if (data?.type === 'PUSH_TOKEN' && data?.data && user?.id) {
        const fcmToken = data.data;
        console.log('FCM Token alındı:', fcmToken?.substring(0, 30) + '...');
        localStorage.setItem("push_token", fcmToken);
        await saveFcmToken(user.id, fcmToken);
      }
    };
    
    // Yöntem 1: Custom event (nativeMessage)
    const handleCustomEvent = (e) => {
      console.log('Native custom event:', e.detail?.type);
      handleNativeMessage(e.detail);
    };
    
    // Yöntem 2: window.postMessage
    const handlePostMessage = (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'PUSH_TOKEN') {
          console.log('Native postMessage:', data.type);
          handleNativeMessage(data);
        }
      } catch (err) {
        // JSON parse hatası - normal mesaj olabilir, ignore
      }
    };
    
    window.addEventListener('nativeMessage', handleCustomEvent);
    window.addEventListener('message', handlePostMessage);
    
    // Token'ı iste (native app varsa)
    if (user?.id && window.AgrosJetNative?.getPushToken) {
      try {
        window.AgrosJetNative.getPushToken();
        console.log('Native getPushToken çağrıldı');
      } catch (e) {
        console.error('Native getPushToken hatası:', e);
      }
    }

    // Login öncesi cache'lenmiş token varsa hemen gönder
    if (user?.id) {
      const cachedToken = sessionStorage.getItem("cached_push_token");
      if (cachedToken) {
        sessionStorage.removeItem("cached_push_token");
        localStorage.setItem("push_token", cachedToken);
        saveFcmToken(user.id, cachedToken);
        console.log('Cache\'ten push token gönderildi');
      }
    }
    
    return () => {
      window.removeEventListener('nativeMessage', handleCustomEvent);
      window.removeEventListener('message', handlePostMessage);
    };
  }, [user?.id, saveFcmToken]);

  // Fetch maintenance notifications
  const checkMaintenanceNotifications = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/motorcycles/notifications/${courierId}/active`);
      setMaintenanceNotifications(res.data.total_count || 0);
    } catch (err) {
      console.error("Bakım bildirimleri alınamadı", err);
    }
  }, []);

  // Fetch company name and logo
  const fetchCompanyInfo = useCallback(async (companyId) => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyName(res.data.name);
      setCompanyLogo(res.data.logo_dark || res.data.logo_url || "");
    } catch (err) {
      console.error("Şirket bilgisi alınamadı", err);
    }
  }, []);

  // Fetch courier availability status
  const fetchAvailabilityStatus = useCallback(async (courierId, isInitialLoad = false) => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}`);
      const newStatus = res.data.availability_status || "offline";
      
      setAvailabilityStatus(prevStatus => {
        // İlk yükleme veya durum değiştiyse native'e bildir
        if (isInitialLoad || prevStatus !== newStatus) {
          // Kısa bir gecikme ile bildir (state güncellemesi sonrası)
          setTimeout(() => {
            const statusMap = {
              'active': 'aktif',
              'on_break': 'molada',
              'offline': 'çevrimdışı'
            };
            const nativeStatus = statusMap[newStatus] || 'çevrimdışı';
            
            if (window.AgrosJetNative && typeof window.AgrosJetNative.statusChange === 'function') {
              try {
                window.AgrosJetNative.statusChange(nativeStatus);
                console.log('[Native] statusChange çağrıldı (fetch):', nativeStatus);
              } catch (e) {
                console.error('[Native] statusChange hatası:', e);
              }
            }
          }, 100);
        }
        return newStatus;
      });
    } catch (err) {
      console.error("Kurye durumu alınamadı", err);
    }
  }, []);

  // Fetch break status
  const fetchBreakStatus = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}/break-status`);
      setBreakStatus(res.data);
    } catch (err) {
      console.error("Mola durumu alınamadı", err);
    }
  }, []);

  // Fetch courier break info (daily limit, used time)
  const fetchCourierBreakInfo = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}`);
      setCourierBreakInfo({
        dailyLimit: res.data.daily_break_limit || 30,
        usedTime: res.data.used_break_time || 0
      });
    } catch (err) {
      console.error("Kurye mola bilgisi alınamadı", err);
    }
  }, []);

  // Handle status change - Mola için modal aç
  const handleStatusChange = (newStatus) => {
    if (newStatus === "on_break") {
      // Önce günlük mola hakkını kontrol et
      const remaining = courierBreakInfo.dailyLimit - courierBreakInfo.usedTime;
      if (remaining <= 0) {
        toast.error("Günlük mola hakkınız doldu");
        return;
      }
      // Mola modalını aç
      setShowBreakModal(true);
    } else {
      // Diğer durumlar için direkt güncelle
      updateAvailabilityStatus(newStatus);
    }
  };

  // Native app'e durum değişikliğini bildir
  const notifyNativeStatusChange = useCallback((status) => {
    const statusMap = {
      'active': 'aktif',
      'on_break': 'molada',
      'offline': 'çevrimdışı'
    };
    const nativeStatus = statusMap[status] || 'çevrimdışı';
    
    console.log('[Native] Durum bildirimi gönderiliyor:', nativeStatus);
    console.log('[Native] window.AgrosJetNative:', typeof window.AgrosJetNative);
    console.log('[Native] window.isAgrosJetApp:', window.isAgrosJetApp);
    
    // AgrosJetNative - Android/iOS Native App
    if (window.AgrosJetNative && typeof window.AgrosJetNative.statusChange === 'function') {
      try {
        window.AgrosJetNative.statusChange(nativeStatus);
        console.log('[Native] AgrosJetNative.statusChange çağrıldı:', nativeStatus);
      } catch (e) {
        console.error('[Native] AgrosJetNative.statusChange hatası:', e);
      }
    } else {
      console.log('[Native] AgrosJetNative.statusChange bulunamadı');
    }
    
    // ReactNativeWebView - Eski yöntem (fallback)
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'STATUS_CHANGE', 
          status: nativeStatus 
        }));
        console.log('[Native] ReactNativeWebView.postMessage çağrıldı:', nativeStatus);
      } catch (e) {
        console.error('[Native] ReactNativeWebView.postMessage hatası:', e);
      }
    }
  }, []);

  // Update availability status
  const updateAvailabilityStatus = async (newStatus) => {
    if (!user?.id) return;
    setStatusLoading(true);
    try {
      await axios.put(`${API}/couriers/${user.id}/availability`, {
        availability_status: newStatus
      });
      setAvailabilityStatus(newStatus);
      
      // Native app'e bildir
      notifyNativeStatusChange(newStatus);
      
      // Mola durumunu yenile
      fetchBreakStatus(user.id);
      fetchCourierBreakInfo(user.id);
    } catch (err) {
      // Mola limiti dolmuşsa özel hata mesajı göster
      const errorMsg = err.response?.data?.detail || "Durum güncellenemedi";
      toast.error(errorMsg);
    } finally {
      setStatusLoading(false);
    }
  };

  // Wake Lock - kurye aktifken ekranı açık tut
  useEffect(() => {
    if (!user?.id) return;
    
    if (availabilityStatus === "offline") {
      releaseWakeLock();
      return;
    }
    
    // Wake Lock al - kurye aktifken ekran açık kalsın
    requestWakeLock();
    
    // Sayfa görünür olduğunda Wake Lock güncelle
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && availabilityStatus !== "offline") {
        // Wake Lock'ı yeniden al (arka plandan dönünce kaybolabilir)
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [user?.id, availabilityStatus, requestWakeLock, releaseWakeLock]);

  // Check if courier is deactivated (forced logout)
  const checkCourierStatus = useCallback(async (courierId, companyId) => {
    try {
      const sessionId = localStorage.getItem("push_session_id") || "";
      const res = await axios.get(`${API}/auth/courier/${courierId}/check-status?company_id=${companyId}&session_id=${sessionId}`);
      if (res.data.should_logout) {
        // Native'e ÖNCE haber ver (konum gönderimi dursun!)
        if (window.AgrosJetNative) {
          try { window.AgrosJetNative.notifyLogout(); } catch(e) {}
        }
        if (window.ReactNativeWebView) {
          try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGOUT' })); } catch(e) {}
        }
        localStorage.removeItem("user");
        localStorage.removeItem("push_session_id");
        localStorage.removeItem("push_token");
        navigate("/courier-login", { state: { message: res.data.reason || "Hesabınız pasif durumda" } });
      } else if (res.data.resend_token) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_PUSH_TOKEN' }));
        }
        if (window.AgrosJetNative?.getPushToken) {
          window.AgrosJetNative.getPushToken();
        }
      }
    } catch (err) {
      // Sessizce devam et
    }
  }, [navigate]);

  useEffect(() => {
    // URL'den gelen courierId varsa (/kurye/:courierId), direkt API'den kurye bilgisini al
    if (urlCourierId) {
      const fetchCourierById = async () => {
        try {
          const res = await axios.get(`${API}/couriers/${urlCourierId}`);
          const courierData = {
            id: res.data.id,
            name: res.data.name,
            phone: res.data.phone,
            company_id: res.data.company_id,
            role: "courier"
          };
          setUser(courierData);
          localStorage.setItem("user", JSON.stringify(courierData));
          
          // Fetch additional data
          if (courierData.company_id) {
            fetchCompanyInfo(courierData.company_id);
          }
          checkDocumentStatus(courierData.id);
          checkMaintenanceNotifications(courierData.id);
          fetchAvailabilityStatus(courierData.id, true); // İlk yükleme - native'e bildir
          fetchBreakStatus(courierData.id);
          fetchCourierBreakInfo(courierData.id);
          checkCourierStatus(courierData.id, courierData.company_id);
          
          // Her 10 saniyede bir durumu kontrol et (mola onayı için hızlı güncelleme)
          const intervalId = setInterval(() => {
            checkCourierStatus(courierData.id, courierData.company_id);
            fetchAvailabilityStatus(courierData.id, false); // Polling - sadece değişiklikte bildir
            fetchBreakStatus(courierData.id);
            fetchCourierBreakInfo(courierData.id);
          }, 10000);
          
          return () => clearInterval(intervalId);
        } catch (err) {
          console.error("Kurye bilgisi alınamadı:", err);
          navigate("/courier-login");
        }
      };
      fetchCourierById();
      return;
    }
    
    // Normal akış - localStorage'dan oku
    const stored = localStorage.getItem("user");
    if (!stored) {
      navigate("/courier-login");
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed.role !== "courier") {
      navigate("/courier-login");
      return;
    }
    setUser(parsed);
    
    // Fetch additional data
    if (parsed.company_id) {
      fetchCompanyInfo(parsed.company_id);
    }
    if (parsed.id) {
      checkDocumentStatus(parsed.id);
      checkMaintenanceNotifications(parsed.id);
      fetchAvailabilityStatus(parsed.id, true); // İlk yükleme - native'e bildir
      fetchBreakStatus(parsed.id);
      fetchCourierBreakInfo(parsed.id);
      
      // Aktif sipariş sayısını çek
      const fetchActiveOrderCount = () => {
        axios.get(`${API}/orders/v2/list`, {
          params: { panel: 'courier', courier_id: parsed.id, status: 'active', limit: 50 }
        }).then(res => {
          setActiveOrderCount((res.data.orders || []).length);
        }).catch(() => {});
      };
      fetchActiveOrderCount();

      // İlk kontrol
      checkCourierStatus(parsed.id, parsed.company_id);
      
      // Her 10 saniyede bir durumu kontrol et (mola onayı için hızlı güncelleme)
      const intervalId = setInterval(() => {
        checkCourierStatus(parsed.id, parsed.company_id);
        fetchAvailabilityStatus(parsed.id, false);
        fetchBreakStatus(parsed.id);
        fetchCourierBreakInfo(parsed.id);
        fetchActiveOrderCount();
      }, 10000);
      
      return () => clearInterval(intervalId);
    }
  }, [urlCourierId, navigate, fetchCompanyInfo, checkDocumentStatus, checkMaintenanceNotifications, checkCourierStatus, fetchAvailabilityStatus, fetchBreakStatus, fetchCourierBreakInfo]);

  const handleLogout = async () => {
    // Sadece explicit logout'ta token temizle (kendi session'ı ise)
    if (user?.id) {
      try {
        const sessionId = localStorage.getItem("push_session_id") || "";
        await axios.put(`${API}/couriers/${user.id}/fcm-token`, { 
          fcm_token: "", 
          session_id: sessionId 
        });
      } catch (e) {
        // ignore
      }
    }

    localStorage.removeItem("user");
    localStorage.removeItem("courierSession");
    sessionStorage.removeItem("courierSession");
    localStorage.removeItem("push_session_id");
    localStorage.removeItem("push_token");
    
    // Native app'e bildir (AgrosJet App)
    if (window.isAgrosJetApp && window.AgrosJetNative) {
      try {
        window.AgrosJetNative.notifyLogout();
      } catch (e) {
        console.error('Native notifyLogout hatası:', e);
      }
    }
    if (window.ReactNativeWebView) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGOUT' }));
      } catch (e) {
        console.error('ReactNativeWebView postMessage hatası:', e);
      }
    }
    navigate("/courier-login");
  };

  if (!user) return null;

  const currentStatus = AVAILABILITY_STATUSES[availabilityStatus] || AVAILABILITY_STATUSES.offline;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" data-testid="courier-dashboard">
      {/* Mobile Header */}
      <header className="lg:hidden bg-slate-900 text-white px-3 py-0.5 flex items-center justify-between sticky top-0 z-40 relative">
        {/* Sol: Menü butonu */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          className="text-white hover:bg-white/10 shrink-0 z-10 !w-12 !h-12"
        >
          {mobileMenuOpen ? <X className="!w-5 !h-5" /> : <Menu className="!w-5 !h-5" />}
        </Button>
        
        {/* Orta: Durum butonu - tam ortada */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${currentStatus.color} text-white`}
                  disabled={statusLoading}
                  data-testid="mobile-status-dropdown"
                >
                  <StatusIcon className="w-4 h-4" />
                  <span className="text-xs font-medium">{currentStatus.label}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {Object.entries(AVAILABILITY_STATUSES).map(([key, status]) => {
                  const Icon = status.icon;
                  const isOnBreak = key === "on_break";
                  return (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={`flex items-center justify-between ${availabilityStatus === key ? 'bg-accent' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status.color}`} />
                        <Icon className="w-4 h-4" />
                        {status.label}
                      </div>
                      {isOnBreak && breakStatus && (
                        <span className={`text-xs ${breakStatus.remaining_break_time <= 5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          (Kalan {breakStatus.remaining_break_time}dk)
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Sağ: Logo */}
        <div className="shrink-0 z-10">
          {companyLogo ? (
            <img 
              src={companyLogo} 
              alt={companyName} 
              className="w-14 h-14 rounded object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : null}
        </div>
      </header>

      {/* Mobile Navigation - Soldan açılan sidebar */}
      <div 
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Overlay */}
        <div 
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        />
        
        {/* Sidebar */}
        <nav 
          className={`absolute left-0 top-0 h-full w-64 bg-slate-900 text-white transform transition-transform duration-300 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header */}
          <div className="px-4 pt-5 pb-4 border-b border-white/10 relative">
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3 right-3 p-1.5 hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                {companyLogo ? (
                  <img src={companyLogo} alt={companyName} className="w-11 h-11 rounded-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <span className="text-lg font-bold">{user.name?.charAt(0)?.toUpperCase()}</span>
                )}
              </div>
              <div>
                <span className="text-sm font-semibold block leading-tight">{user.name}</span>
                {companyName && <span className="text-[11px] text-white/40">{companyName}</span>}
              </div>
            </div>
          </div>
          
          {/* Menu Items - Sadece sidebar-only itemlar */}
          <div className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            {sidebarOnlyItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setMobileMenuOpen(false)} 
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                  location.pathname === item.path ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
                {item.path.includes("/motosikletim") && maintenanceNotifications > 0 && (
                  <span className="ml-auto w-5 h-5 bg-white text-primary text-[10px] font-bold rounded-full flex items-center justify-center">
                    {maintenanceNotifications}
                  </span>
                )}
              </Link>
            ))}
          </div>
          
          {/* Logout Button */}
          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/20 space-y-2">
            <button 
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              data-testid="courier-dark-mode-toggle"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}
            </button>
            <Link 
              to={`${basePath}/kvkk`}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-white/70 hover:text-white transition-colors"
            >
              <Shield className="w-4 h-4" />
              KVKK ve Gizlilik
            </Link>
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          </div>
        </nav>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <CourierSidebar
          user={user}
          navItems={navItems}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          onLogout={handleLogout}
          companyName={companyName}
          companyLogo={companyLogo}
          maintenanceNotifications={maintenanceNotifications}
          availabilityStatus={availabilityStatus}
          onStatusChange={handleStatusChange}
          statusLoading={statusLoading}
        />

        {/* Main Content */}
        <main className={`flex-1 overflow-x-auto transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'
        }`}>
          <div className="p-4 md:p-6 min-h-[calc(100vh-80px)]">
            <Routes>
              <Route index element={<CourierSiparisPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="vardiyalar" element={<CourierVardiyalarPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="muhasebe" element={<CourierMuhasebePage courierId={user.id} courierName={user.name} companyId={user.company_id} />} />
              <Route path="raporlar" element={<CourierRaporlarPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="zimmet" element={<CourierZimmetPage courierId={user.id} />} />
              <Route path="motosikletim" element={<CourierMotosikletimPage courierId={user.id} companyId={user.company_id} />} />
              <Route path="jetpuan" element={<CourierJetPuanPage courierId={user.id} />} />
              <Route path="akademi" element={<CourierAkademiPage companyId={user.company_id} />} />
              <Route path="evraklar" element={
                <CourierEvraklarPage 
                  courierId={user.id} 
                  companyId={user.company_id} 
                  companyName={companyName}
                />
              } />
              <Route path="kvkk" element={<CourierKVKKPage companyName={companyName} />} />
            </Routes>
          </div>
          
          {/* Bottom Bar için alt boşluk */}
          <div className="h-16" />
        </main>

        {/* Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 safe-area-bottom" data-testid="courier-bottom-bar">
          <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
            {bottomBarItems.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.key === "siparis" && location.pathname === basePath);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  data-testid={`bottom-bar-${item.key}`}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                    isActive 
                      ? "text-slate-900 dark:text-white" 
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {isActive && <span className="absolute top-0 left-3 right-3 h-[2.5px] bg-slate-900 dark:bg-white rounded-b" />}
                  <span className="relative">
                    <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                    {item.key === "siparis" && activeOrderCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">{activeOrderCount}</span>
                    )}
                  </span>
                  <span className={`text-[10px] mt-0.5 ${isActive ? "font-semibold" : "font-medium"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Mola Modalı */}
      <BreakModal
        open={showBreakModal}
        onOpenChange={setShowBreakModal}
        courierId={user.id}
        companyId={user.company_id}
        dailyBreakLimit={courierBreakInfo.dailyLimit}
        usedBreakTime={courierBreakInfo.usedTime}
        onBreakStarted={() => {
          fetchAvailabilityStatus(user.id);
          fetchBreakStatus(user.id);
          fetchCourierBreakInfo(user.id);
        }}
      />
    </div>
  );
}
