import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChevronLeft, ChevronRight, FileText, AlertCircle, 
  Store, Download, Trash2, CheckCircle, Eye, Loader2,
  Archive, Check, Circle, Filter, MessageCircle, Phone, User,
  Upload, FileUp, Receipt, Settings, Clock, Plus, RefreshCw
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Utility functions
const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount || 0)) + ' TL';
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

// ==================== Month Selector ====================
function MonthSelector({ year, month, onPrev, onNext }) {
  return (
    <div className="border-2 border-border bg-white p-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onPrev}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <div className="text-center">
          <p className="font-semibold">{MONTH_NAMES[month - 1]} {year}</p>
        </div>
        
        <Button variant="outline" size="sm" onClick={onNext}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ==================== Month Invoices Card ====================
function MonthInvoicesCard({ invoices, selectedInvoices, onToggleSelection, onSelectAll, onDownloadBulk, onView, onVerifyWithAmount }) {
  const [verifyModal, setVerifyModal] = useState({ open: false, invoice: null });
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleOpenVerifyModal = (invoice) => {
    setVerifyModal({ open: true, invoice });
    setInvoiceAmount(invoice.verified_amount > 0 ? invoice.verified_amount.toString() : "");
  };

  const handleVerify = async () => {
    if (!invoiceAmount || parseFloat(invoiceAmount) <= 0) return;
    setVerifying(true);
    try {
      await onVerifyWithAmount(verifyModal.invoice.invoice_id, parseFloat(invoiceAmount));
      setVerifyModal({ open: false, invoice: null });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Ay Faturaları</h3>
              <span className="text-xs text-muted-foreground">({invoices.length})</span>
            </div>
            {invoices.length > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onSelectAll} className="h-8 text-xs">
                  {selectedInvoices.length === invoices.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                </Button>
                {selectedInvoices.length > 0 && (
                  <Button size="sm" onClick={onDownloadBulk} className="h-8 text-xs gap-1">
                    <Download className="w-3 h-3" />
                    İndir ({selectedInvoices.length})
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Archive className="w-12 h-12 mx-auto mb-2 opacity-20" />
              Bu ayda yüklenen fatura yok
            </div>
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <div 
                  key={invoice.invoice_id} 
                  className={`p-3 hover:bg-slate-50 ${
                    selectedInvoices.includes(invoice.invoice_id) ? 'bg-primary/5' : ''
                  } ${invoice.verified ? 'bg-green-50/50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div 
                      className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
                      onClick={() => onToggleSelection(invoice.invoice_id)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedInvoices.includes(invoice.invoice_id) 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-slate-300'
                      }`}>
                        {selectedInvoices.includes(invoice.invoice_id) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{invoice.restaurant_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.filename} • {formatDateTime(invoice.uploaded_at)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Hafta: {invoice.week_label}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-sm font-mono text-red-600">
                        {formatMoney(invoice.required_amount)}
                      </p>
                      {invoice.verified && invoice.verified_amount && (
                        <p className="text-xs text-green-600">
                          Onaylanan: {formatMoney(invoice.verified_amount)}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => onView(invoice.invoice_id)} className="h-8 w-8 p-0" title="Görüntüle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenVerifyModal(invoice)}
                        className={`h-8 w-8 p-0 ${invoice.verified ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-green-600'}`}
                        title={invoice.verified ? "Kontrol edildi" : "Kontrol et"}
                      >
                        {invoice.verified ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Verify Modal */}
      <Dialog open={verifyModal.open} onOpenChange={(open) => !open && setVerifyModal({ open: false, invoice: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Fatura Kontrol
            </DialogTitle>
          </DialogHeader>
          
          {verifyModal.invoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="font-semibold">{verifyModal.invoice.restaurant_name}</p>
                <p className="text-sm text-muted-foreground">{verifyModal.invoice.filename}</p>
                <p className="text-xs text-muted-foreground">Hafta: {verifyModal.invoice.week_label}</p>
                <p className="text-lg font-bold font-mono text-red-600 mt-2">
                  Beklenen: {formatMoney(verifyModal.invoice.required_amount)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fatura Tutarı (TL)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="h-12 text-lg font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Eğer tutar beklenen miktardan düşükse, kalan tutar için yeni fatura beklenecektir.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setVerifyModal({ open: false, invoice: null })}>İptal</Button>
                <Button 
                  onClick={handleVerify} 
                  disabled={verifying || !invoiceAmount}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  {verifying ? "Kontrol ediliyor..." : "Kontrol Et"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==================== Missing Invoices Card (All Time) ====================
function MissingInvoicesCard({ missingInvoices, isSuperAdmin, onDeleteInvoice, onRefresh }) {
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [restaurantUsers, setRestaurantUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Group by restaurant
  const restaurantGroups = missingInvoices.reduce((acc, inv) => {
    if (!acc[inv.restaurant_id]) {
      acc[inv.restaurant_id] = {
        restaurant_id: inv.restaurant_id,
        restaurant_name: inv.restaurant_name,
        total_remaining: 0,
        weeks: []
      };
    }
    acc[inv.restaurant_id].total_remaining += inv.remaining_amount;
    acc[inv.restaurant_id].weeks.push(inv);
    return acc;
  }, {});

  const restaurantList = Object.values(restaurantGroups);

  const filteredInvoices = selectedRestaurant 
    ? missingInvoices.filter(r => r.restaurant_id === selectedRestaurant)
    : missingInvoices;

  const selectedRestaurantData = selectedRestaurant 
    ? restaurantGroups[selectedRestaurant] 
    : null;

  const getBreakdownText = (breakdown) => {
    const parts = [];
    if (breakdown?.cash) parts.push(`Nakit: ${formatMoney(breakdown.cash)}`);
    if (breakdown?.credit_card) parts.push(`KK: ${formatMoney(breakdown.credit_card)}`);
    if (breakdown?.online) parts.push(`Online: ${formatMoney(breakdown.online)}`);
    if (breakdown?.meal_card) parts.push(`YK: ${formatMoney(breakdown.meal_card)}`);
    if (breakdown?.online_meal_card) parts.push(`OYK: ${formatMoney(breakdown.online_meal_card)}`);
    return parts.join(" • ");
  };

  // Open WhatsApp reminder modal
  const openReminderModal = async () => {
    if (!selectedRestaurantData) return;
    
    setReminderTarget(selectedRestaurantData);
    setShowReminderModal(true);
    setLoadingUsers(true);
    
    try {
      const res = await axios.get(`${API}/restaurant-users/restaurant/${selectedRestaurant}`);
      setRestaurantUsers(res.data.filter(u => u.is_active !== false));
    } catch (err) {
      console.error("Kullanıcılar yüklenemedi:", err);
      setRestaurantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Generate WhatsApp message
  const generateWhatsAppMessage = (userName) => {
    if (!reminderTarget) return "";
    
    const invoiceDetails = reminderTarget.weeks.map(w => 
      `• ${w.week_label}: ${formatMoney(w.remaining_amount)}`
    ).join("\n");
    
    const message = `Merhaba ${userName},

Eksik faturalarınız bulunmaktadır:

${invoiceDetails}

Toplam: ${formatMoney(reminderTarget.total_remaining)}

Lütfen en kısa sürede faturalarınızı yükleyiniz.`;
    
    return encodeURIComponent(message);
  };

  // Send WhatsApp reminder
  const sendWhatsAppReminder = (user) => {
    if (!user.phone) {
      toast.error("Bu kullanıcının telefon numarası yok");
      return;
    }
    
    // Clean phone number
    let phone = user.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '90' + phone.slice(1);
    } else if (!phone.startsWith('90')) {
      phone = '90' + phone;
    }
    
    const message = generateWhatsAppMessage(user.name);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    setShowReminderModal(false);
  };

  return (
    <>
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-red-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h3 className="font-semibold text-sm text-red-700">Eksik Faturalar</h3>
              <span className="text-xs text-red-500">({filteredInvoices.length})</span>
            </div>
            
            {/* WhatsApp reminder button - only when a restaurant is selected */}
            {selectedRestaurant && selectedRestaurantData && (
              <Button
                size="sm"
                variant="outline"
                onClick={openReminderModal}
                className="h-8 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Hatırlat
              </Button>
            )}
          </div>
          
          {restaurantList.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <select
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
                className="flex-1 h-9 text-sm border border-red-200 rounded px-2 bg-white"
              >
                <option value="">Tüm Restoranlar</option>
                {restaurantList.map(r => (
                  <option key={r.restaurant_id} value={r.restaurant_id}>
                    {r.restaurant_name} ({r.weeks.length} hafta - {formatMoney(r.total_remaining)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-green-600 text-sm">
              <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
              Tüm faturalar alındı
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredInvoices.map((item) => (
                <div key={`${item.restaurant_id}-${item.week_start}`} className="p-3 hover:bg-red-50/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.restaurant_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Hafta: {item.week_label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {getBreakdownText(item.breakdown)}
                      </p>
                      {item.verified_amount > 0 && (
                        <p className="text-[10px] text-green-600 mt-0.5">
                          Alınan: {formatMoney(item.verified_amount)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold font-mono text-red-600">
                        {formatMoney(item.remaining_amount)}
                      </span>
                      {isSuperAdmin && item.record_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDeleteInvoice(item.record_id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Total summary */}
        {filteredInvoices.length > 0 && (
          <div className="p-3 border-t border-border bg-red-50/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-red-700 font-medium">Toplam Eksik:</span>
              <span className="font-bold text-red-600">
                {formatMoney(filteredInvoices.reduce((sum, i) => sum + i.remaining_amount, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Reminder Modal */}
      <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              WhatsApp ile Hatırlat
            </DialogTitle>
          </DialogHeader>
          
          {reminderTarget && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="font-semibold">{reminderTarget.restaurant_name}</p>
                <p className="text-sm text-red-600 font-mono mt-1">
                  Toplam Eksik: {formatMoney(reminderTarget.total_remaining)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {reminderTarget.weeks.length} hafta eksik fatura
                </p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Kime hatırlatmak istiyorsunuz?</h4>
                
                {loadingUsers ? (
                  <div className="py-4 text-center">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
                  </div>
                ) : restaurantUsers.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">
                    <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Bu restoranın kullanıcısı yok
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {restaurantUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{user.name}</p>
                          {user.phone ? (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {user.phone}
                            </p>
                          ) : (
                            <p className="text-xs text-red-500">Telefon yok</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sendWhatsAppReminder(user)}
                          disabled={!user.phone}
                          className="h-8 gap-1 bg-green-600 hover:bg-green-700"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Hatırlat
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReminderModal(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==================== Restaurants List Card ====================
function RestaurantsListCard({ restaurants, selectedRestaurant, onSelect }) {
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Restoranlar</h3>
          <span className="text-xs text-muted-foreground">({restaurants.length})</span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {restaurants.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Fatura ayarı olan restoran yok
          </div>
        ) : (
          restaurants.map((restaurant) => (
            <div
              key={restaurant.restaurant_id}
              onClick={() => onSelect(selectedRestaurant?.restaurant_id === restaurant.restaurant_id ? null : restaurant)}
              className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                selectedRestaurant?.restaurant_id === restaurant.restaurant_id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{restaurant.restaurant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      restaurant.invoice_settings?.cash && "Nakit",
                      restaurant.invoice_settings?.credit_card && "KK",
                      restaurant.invoice_settings?.online && "Online",
                      restaurant.invoice_settings?.meal_card && "YK",
                      restaurant.invoice_settings?.online_meal_card && "OYK"
                    ].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== Restaurant Invoices Card ====================
function RestaurantInvoicesCard({ selectedRestaurant, restaurantData, loading, onView, onDelete, year, month }) {
  if (!selectedRestaurant) {
    return (
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Restoran Seçin</h3>
          </div>
        </div>
        <div className="p-8 text-center text-muted-foreground text-sm">
          <Store className="w-12 h-12 mx-auto mb-2 opacity-20" />
          Faturalarını görmek için bir restoran seçin
        </div>
      </div>
    );
  }

  const invoices = restaurantData?.invoices || [];

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{selectedRestaurant.restaurant_name}</h3>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>
      
      {/* Summary */}
      {restaurantData && (
        <div className="p-3 bg-slate-50/50 border-b border-border">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Beklenen</p>
              <p className="font-semibold text-red-600">{formatMoney(restaurantData.total_required)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Onaylanan</p>
              <p className="font-semibold text-green-600">{formatMoney(restaurantData.total_verified)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Kalan</p>
              <p className="font-semibold text-orange-600">{formatMoney(restaurantData.total_remaining)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
      )}
      
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Bu ayda fatura yok
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => (
              <div key={invoice.invoice_id} className={`p-3 hover:bg-slate-50 ${invoice.verified ? 'bg-green-50/30' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{invoice.filename}</p>
                      {invoice.verified && (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(invoice.uploaded_at)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Hafta: {invoice.week_label}
                      {invoice.verified && invoice.verified_amount && (
                        <span className="ml-2 text-green-600">
                          Onaylanan: {formatMoney(invoice.verified_amount)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => onView(invoice.invoice_id)} className="h-8 w-8 p-0" title="Görüntüle">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(invoice.invoice_id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" title="Sil">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Upcoming Invoices Preview Card ====================
function UpcomingInvoicesCard({ preview, loading, onRefresh }) {
  const getBreakdownText = (breakdown) => {
    const parts = [];
    if (breakdown?.cash) parts.push(`Nakit: ${formatMoney(breakdown.cash)}`);
    if (breakdown?.credit_card) parts.push(`KK: ${formatMoney(breakdown.credit_card)}`);
    if (breakdown?.online) parts.push(`Online: ${formatMoney(breakdown.online)}`);
    if (breakdown?.meal_card) parts.push(`YK: ${formatMoney(breakdown.meal_card)}`);
    if (breakdown?.online_meal_card) parts.push(`OYK: ${formatMoney(breakdown.online_meal_card)}`);
    return parts.join(" • ");
  };

  return (
    <div className="border-2 border-border bg-white lg:col-span-2">
      <div className="p-3 border-b-2 border-border bg-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm text-blue-700">Yaklaşan Faturalar (Önizleme)</h3>
            {preview && (
              <span className="text-xs text-blue-500">
                {preview.week_label} • {preview.restaurant_count} restoran
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 p-0"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-blue-600 mt-1">
          Pazartesi 02:00'da otomatik oluşturulacak faturalar
        </p>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : !preview || preview.previews.length === 0 ? (
          <div className="p-8 text-center text-green-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Oluşturulacak yeni fatura yok
          </div>
        ) : (
          <div className="divide-y divide-border">
            {preview.previews.map((item) => (
              <div key={item.restaurant_id} className="p-3 hover:bg-blue-50/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{item.restaurant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.order_count} sipariş
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {getBreakdownText(item.breakdown)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold font-mono text-blue-600 flex-shrink-0">
                    {formatMoney(item.required_amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Total summary */}
      {preview && preview.previews.length > 0 && (
        <div className="p-3 border-t border-border bg-blue-50/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700 font-medium">Toplam:</span>
            <span className="font-bold text-blue-600">
              {formatMoney(preview.total_amount)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Alınan Faturalar Tab Content ====================
function AlinanFaturalarContent({ companyId, adminId, adminName, isSuperAdmin }) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  
  const [restaurants, setRestaurants] = useState([]);
  const [missingInvoices, setMissingInvoices] = useState([]);
  const [monthInvoices, setMonthInvoices] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantData, setRestaurantData] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  
  // Upcoming preview state
  const [upcomingPreview, setUpcomingPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  
  // Auto settings state
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [lastAutoRun, setLastAutoRun] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [closingTime, setClosingTime] = useState("02:00");
  
  // View invoice modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  
  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteType, setDeleteType] = useState("invoice");
  
  // Manual trigger states
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch upcoming preview
  const fetchUpcomingPreview = useCallback(async () => {
    if (!companyId) return;
    setPreviewLoading(true);
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/upcoming-preview`);
      setUpcomingPreview(res.data);
    } catch (err) {
      console.error("Upcoming preview fetch error:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [companyId]);

  // Fetch auto settings
  const fetchAutoSettings = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/auto-settings`);
      setAutoEnabled(res.data.enabled || false);
      setLastAutoRun(res.data.last_auto_run);
    } catch (err) {
      console.error("Auto settings fetch error:", err);
    }
  }, [companyId]);

  // Fetch company closing time
  const fetchCompanyTime = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      if (res.data?.closing_time) {
        setClosingTime(res.data.closing_time);
      }
    } catch (err) {
      console.error("Company fetch error:", err);
    }
  }, [companyId]);

  // Toggle auto settings
  const handleAutoToggle = async (enabled) => {
    setAutoSaving(true);
    try {
      await axios.put(`${API}/restaurant-invoices/${companyId}/auto-settings`, { enabled });
      setAutoEnabled(enabled);
      toast.success(enabled ? "Otomatik işleme açıldı" : "Otomatik işleme kapatıldı");
    } catch (err) {
      toast.error("Ayar güncellenemedi");
    } finally {
      setAutoSaving(false);
    }
  };

  // Manuel veri oluştur
  const handleGenerateData = async () => {
    if (!companyId) return;
    setGenerating(true);
    try {
      // Geçen haftanın başlangıcını hesapla
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - diff - 7);
      lastMonday.setHours(9, 0, 0, 0);
      
      const res = await axios.post(`${API}/restaurant-invoices/${companyId}/generate-weekly`, null, {
        params: { week_start: lastMonday.toISOString() }
      });
      
      toast.success(`${res.data.count || 0} eksik fatura kaydı oluşturuldu`);
      fetchData();
      fetchUpcomingPreview(); // Also refresh preview after generating
    } catch (err) {
      toast.error(err.response?.data?.detail || "Veri oluşturulamadı");
    } finally {
      setGenerating(false);
    }
  };

  // Manuel veri sil
  const handleClearData = async () => {
    if (!companyId) return;
    setClearing(true);
    try {
      const res = await axios.delete(`${API}/restaurant-invoices/${companyId}/clear-all`);
      toast.success(`${res.data.deleted_count || 0} kayıt silindi`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Veriler silinemedi");
    } finally {
      setClearing(false);
    }
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    
    try {
      const [restaurantsRes, missingRes, monthRes] = await Promise.all([
        axios.get(`${API}/restaurant-invoices/${companyId}/restaurants`),
        axios.get(`${API}/restaurant-invoices/${companyId}/missing`),
        axios.get(`${API}/restaurant-invoices/${companyId}/month/${selectedYear}/${selectedMonth}`)
      ]);
      
      setRestaurants(restaurantsRes.data);
      setMissingInvoices(missingRes.data);
      setMonthInvoices(monthRes.data);
    } catch (err) {
      console.error("Veri yüklenemedi:", err);
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedYear, selectedMonth]);

  // Fetch restaurant data
  const fetchRestaurantData = useCallback(async () => {
    if (!companyId || !selectedRestaurant) {
      setRestaurantData(null);
      return;
    }
    
    setRestaurantLoading(true);
    try {
      const res = await axios.get(
        `${API}/restaurant-invoices/${companyId}/restaurant/${selectedRestaurant.restaurant_id}/month/${selectedYear}/${selectedMonth}`
      );
      setRestaurantData(res.data);
    } catch (err) {
      console.error("Restoran verileri yüklenemedi:", err);
      setRestaurantData(null);
    } finally {
      setRestaurantLoading(false);
    }
  }, [companyId, selectedRestaurant, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchRestaurantData();
  }, [fetchRestaurantData]);

  useEffect(() => {
    fetchAutoSettings();
    fetchCompanyTime();
    fetchUpcomingPreview();
  }, [fetchAutoSettings, fetchCompanyTime, fetchUpcomingPreview]);

  // Navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Selection handlers
  const handleToggleSelection = (invoiceId) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handleSelectAll = () => {
    const allIds = monthInvoices.map(inv => inv.invoice_id);
    if (selectedInvoices.length === allIds.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(allIds);
    }
  };

  // Verify handler
  const handleVerifyWithAmount = async (invoiceId, amount) => {
    try {
      await axios.post(`${API}/restaurant-invoices/${companyId}/verify`, {
        invoice_id: invoiceId,
        amount: amount,
        admin_id: adminId || "",
        admin_name: adminName || ""
      });
      toast.success("Fatura onaylandı");
      fetchData();
      if (selectedRestaurant) fetchRestaurantData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onaylama başarısız");
      throw err;
    }
  };

  // View invoice
  const handleViewInvoice = async (invoiceId) => {
    try {
      const res = await axios.get(`${API}/restaurant-invoices/${companyId}/download/${invoiceId}`);
      setViewingInvoice(res.data);
      setShowViewModal(true);
    } catch (err) {
      toast.error("Fatura yüklenemedi");
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (invoiceId) => {
    setPendingDeleteId(invoiceId);
    setDeleteType("invoice");
    setConfirmOpen(true);
  };

  // Delete missing invoice record
  const handleDeleteMissingInvoice = async (recordId) => {
    setPendingDeleteId(recordId);
    setDeleteType("missing");
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      if (deleteType === "missing") {
        await axios.delete(`${API}/restaurant-invoices/${companyId}/missing/${pendingDeleteId}`);
        toast.success("Eksik fatura kaydı silindi");
      } else {
        await axios.delete(`${API}/restaurant-invoices/${companyId}/invoice/${pendingDeleteId}`);
        toast.success("Fatura silindi");
      }
      fetchData();
      if (selectedRestaurant) fetchRestaurantData();
    } catch (err) {
      toast.error("Silme başarısız");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
      setDeleteType("invoice");
    }
  };

  // Download bulk as merged PDF
  const handleDownloadBulk = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("En az bir fatura seçin");
      return;
    }
    
    try {
      toast.loading("PDF birleştiriliyor...", { id: "pdf-download" });
      
      const res = await axios.post(`${API}/restaurant-invoices/${companyId}/download-zip`, {
        invoice_ids: selectedInvoices
      });
      
      // Base64'ten blob oluştur
      const byteCharacters = atob(res.data.pdf_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      // İndir
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = res.data.filename;
      link.click();
      URL.revokeObjectURL(link.href);
      
      toast.success(`${selectedInvoices.length} fatura birleştirildi`, { id: "pdf-download" });
      setSelectedInvoices([]);
    } catch (err) {
      console.error("PDF download error:", err);
      toast.error("PDF birleştirme başarısız", { id: "pdf-download" });
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      {/* Auto Settings Card */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-slate-500" />
              <div>
                <p className="text-sm font-medium">Otomatik İşleme</p>
                <p className="text-xs text-muted-foreground">
                  Her Pazartesi 02:00'da otomatik eksik fatura oluşturma
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lastAutoRun && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Son: {new Date(lastAutoRun).toLocaleDateString('tr-TR')}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-invoice"
                  checked={autoEnabled}
                  onCheckedChange={handleAutoToggle}
                  disabled={autoSaving}
                />
                <Label htmlFor="auto-invoice" className="text-sm">
                  {autoEnabled ? "Açık" : "Kapalı"}
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <MonthSelector
        year={selectedYear}
        month={selectedMonth}
        onPrev={handlePrevMonth}
        onNext={handleNextMonth}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthInvoicesCard
          invoices={monthInvoices}
          selectedInvoices={selectedInvoices}
          onToggleSelection={handleToggleSelection}
          onSelectAll={handleSelectAll}
          onDownloadBulk={handleDownloadBulk}
          onView={handleViewInvoice}
          onVerifyWithAmount={handleVerifyWithAmount}
        />

        <MissingInvoicesCard 
          missingInvoices={missingInvoices}
          isSuperAdmin={isSuperAdmin}
          onDeleteInvoice={handleDeleteMissingInvoice}
          onRefresh={fetchData}
        />

        <RestaurantsListCard
          restaurants={restaurants}
          selectedRestaurant={selectedRestaurant}
          onSelect={setSelectedRestaurant}
        />

        <RestaurantInvoicesCard
          selectedRestaurant={selectedRestaurant}
          restaurantData={restaurantData}
          loading={restaurantLoading}
          onView={handleViewInvoice}
          onDelete={handleDeleteInvoice}
          year={selectedYear}
          month={selectedMonth}
        />

        {/* Upcoming Invoices Preview - Full width at bottom */}
        <UpcomingInvoicesCard 
          preview={upcomingPreview}
          loading={previewLoading}
          onRefresh={fetchUpcomingPreview}
        />
      </div>

      {/* View Invoice Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Fatura Önizleme</DialogTitle>
          </DialogHeader>
          
          {viewingInvoice && (
            <div className="flex-1 overflow-auto">
              {viewingInvoice.extension === "pdf" ? (
                <iframe
                  src={`data:application/pdf;base64,${viewingInvoice.file_data}`}
                  className="w-full h-[70vh]"
                  title="Fatura"
                />
              ) : (
                <img
                  src={`data:image/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`}
                  alt="Fatura"
                  className="max-w-full max-h-[70vh] mx-auto"
                />
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Kapat
            </Button>
            {viewingInvoice && (
              <Button onClick={() => {
                const link = document.createElement("a");
                link.href = `data:application/${viewingInvoice.extension};base64,${viewingInvoice.file_data}`;
                link.download = viewingInvoice.filename;
                link.click();
              }}>
                <Download className="w-4 h-4 mr-2" />
                İndir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={deleteType === "missing" ? "Eksik Fatura Kaydı Silme" : "Fatura Silme"}
        description={deleteType === "missing" 
          ? "Bu eksik fatura kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
          : "Bu faturayı silmek istediğinize emin misiniz?"}
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}

// ==================== Main Export with Tabs ====================
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KesilenFaturalarTab from "./KesilenFaturalarTab";

export default function IsletmeFaturalariTab({ companyId, adminId, adminName, isSuperAdmin }) {
  const [activeSubTab, setActiveSubTab] = useState("alinan");

  if (!companyId) {
    return <div className="p-4 text-center text-muted-foreground">Şirket seçilmedi</div>;
  }

  return (
    <div className="space-y-4" data-testid="isletme-faturalari-tab">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
          <TabsTrigger value="alinan" className="flex items-center gap-2" data-testid="alinan-faturalar-tab">
            <FileText className="w-4 h-4" />
            Alınan Faturalar
          </TabsTrigger>
          <TabsTrigger value="kesilen" className="flex items-center gap-2" data-testid="kesilen-faturalar-tab">
            <Receipt className="w-4 h-4" />
            Kesilen Faturalar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alinan">
          <AlinanFaturalarContent 
            companyId={companyId} 
            adminId={adminId} 
            adminName={adminName} 
            isSuperAdmin={isSuperAdmin} 
          />
        </TabsContent>

        <TabsContent value="kesilen">
          <KesilenFaturalarTab 
            companyId={companyId} 
            adminId={adminId} 
            adminName={adminName} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
