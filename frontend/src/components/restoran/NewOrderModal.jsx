import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  MapPin,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ShoppingBag,
  Package,
  Navigation,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function NewOrderModal({ open, onOpenChange, restaurantId, onOrderCreated }) {
  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [addressDetails, setAddressDetails] = useState(""); // Apartman, kat, daire
  const [deliveryLocation, setDeliveryLocation] = useState(null); // {lat, lng}
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Products state
  const [products, setProducts] = useState({ categories: [], products: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Google Places Autocomplete ref
  const autocompleteRef = useRef(null);
  const addressInputId = "delivery-address-autocomplete";

  // Initialize Google Places Autocomplete when modal opens
  useEffect(() => {
    if (!open) {
      // Cleanup when modal closes
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
      return;
    }

    // Wait for DOM to be ready
    const initAutocomplete = () => {
      const inputElement = document.getElementById(addressInputId);
      
      if (!inputElement || !window.google?.maps?.places) {
        console.log("Waiting for input or Google Maps...");
        return false;
      }

      // Already initialized
      if (autocompleteRef.current) {
        return true;
      }

      console.log("Initializing Google Places Autocomplete...");
      
      const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: "tr" },
        types: ["geocode", "establishment"],
        fields: ["formatted_address", "geometry", "name"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        console.log("Place selected:", place);
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setDeliveryAddress(place.formatted_address || place.name);
          setDeliveryLocation({ lat, lng });
        }
      });

      autocompleteRef.current = autocomplete;
      console.log("Autocomplete initialized successfully");
      return true;
    };

    // Try to initialize immediately, or retry after a delay
    if (!initAutocomplete()) {
      const timer = setTimeout(initAutocomplete, 500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Load products when modal opens
  useEffect(() => {
    if (open && restaurantId) {
      loadProducts();
    }
  }, [open, restaurantId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await axios.get(`${API}/products/restaurant/${restaurantId}`);
      setProducts(res.data);
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setAddressDetails("");
    setDeliveryLocation(null);
    setNotes("");
    setPaymentMethod("cash");
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
    setSelectedItems([]);
  };

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    products.categories.forEach((cat) => {
      groups[cat.id] = {
        category: cat,
        products: products.products.filter((p) => p.category_id === cat.id),
      };
    });
    return groups;
  }, [products]);

  // Add product to order
  const addProduct = (product) => {
    const existingIndex = selectedItems.findIndex((item) => item.product_id === product.id);
    if (existingIndex >= 0) {
      // Increase quantity
      const newItems = [...selectedItems];
      newItems[existingIndex].quantity += 1;
      setSelectedItems(newItems);
    } else {
      // Add new item
      setSelectedItems([
        ...selectedItems,
        {
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        },
      ]);
    }
  };

  // Update item quantity
  const updateQuantity = (productId, delta) => {
    const newItems = selectedItems
      .map((item) => {
        if (item.product_id === productId) {
          const newQuantity = item.quantity + delta;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
        }
        return item;
      })
      .filter(Boolean);
    setSelectedItems(newItems);
  };

  // Remove item
  const removeItem = (productId) => {
    setSelectedItems(selectedItems.filter((item) => item.product_id !== productId));
  };

  // Calculate total
  const totalAmount = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [selectedItems]);

  // Format price
  const formatPrice = (price) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Handle submit
  const handleSubmit = async () => {
    // Validation
    if (!customerName.trim()) {
      toast.error("Müşteri adı gerekli");
      return;
    }
    if (!deliveryAddress.trim()) {
      toast.error("Teslimat adresi gerekli");
      return;
    }
    if (selectedItems.length === 0) {
      toast.error("En az bir ürün seçmelisiniz");
      return;
    }
    if (isScheduled && (!scheduledDate || !scheduledTime)) {
      toast.error("Programlı teslimat için tarih ve saat seçmelisiniz");
      return;
    }

    // Build scheduled datetime if needed
    let scheduledTimeISO = null;
    if (isScheduled) {
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      scheduledTimeISO = scheduledDateTime.toISOString();
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/orders/manual`, {
        restaurant_id: restaurantId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        delivery_address: deliveryAddress.trim(),
        delivery_location: deliveryLocation, // Koordinatlar
        items: selectedItems,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
        is_scheduled: isScheduled,
        scheduled_time: scheduledTimeISO,
      });

      toast.success("Sipariş başarıyla oluşturuldu");
      onOrderCreated?.(res.data.order);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sipariş oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  // Get minimum time based on date
  const getMinTime = () => {
    if (!scheduledDate) return "";
    const today = new Date().toISOString().split("T")[0];
    if (scheduledDate === today) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 45); // At least 45 min from now
      return now.toTimeString().slice(0, 5);
    }
    return "00:00";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] overflow-y-auto" 
        data-testid="new-order-modal"
        onInteractOutside={(e) => {
          // Prevent modal close when clicking on Google Places autocomplete dropdown
          const target = e.target;
          if (target.closest('.pac-container') || target.classList.contains('pac-item') || target.classList.contains('pac-item-query')) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          // Also prevent on pointer down for pac-container clicks
          const target = e.target;
          if (target.closest('.pac-container') || target.classList.contains('pac-item') || target.classList.contains('pac-item-query')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Yeni Telefon Siparişi
          </DialogTitle>
          <DialogDescription>Manuel sipariş girişi yapın</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Left Column - Customer Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Müşteri Bilgileri
            </h3>

            {/* Customer Name */}
            <div className="space-y-2">
              <Label htmlFor="customer-name" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Müşteri Adı *
              </Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ahmet Yılmaz"
                data-testid="customer-name-input"
              />
            </div>

            {/* Customer Phone */}
            <div className="space-y-2">
              <Label htmlFor="customer-phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Telefon
              </Label>
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                data-testid="customer-phone-input"
              />
            </div>

            {/* Delivery Address with Google Places Autocomplete */}
            <div className="space-y-2">
              <Label htmlFor={addressInputId} className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Teslimat Adresi *
              </Label>
              <input
                id={addressInputId}
                type="text"
                value={deliveryAddress}
                onChange={(e) => {
                  setDeliveryAddress(e.target.value);
                  setDeliveryLocation(null);
                }}
                placeholder="Adres aramak için yazmaya başlayın..."
                data-testid="delivery-address-input"
                autoComplete="off"
                className="flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              {deliveryLocation && (
                <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Konum alındı</span>
                  <a
                    href={`https://www.google.com/maps?q=${deliveryLocation.lat},${deliveryLocation.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Navigation className="w-3 h-3" />
                    Haritada Gör
                  </a>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Ödeme Yöntemi *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("cash")}
                  data-testid="payment-cash"
                >
                  <Banknote className="w-4 h-4" />
                  Nakit
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("card")}
                  data-testid="payment-card"
                >
                  <CreditCard className="w-4 h-4" />
                  Kart
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "online" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("online")}
                  data-testid="payment-online"
                >
                  <Smartphone className="w-4 h-4" />
                  Online
                </Button>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Sipariş Notu</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Zile basma, kapıda bekle, vb."
                rows={2}
                data-testid="notes-input"
              />
            </div>

            {/* Scheduled Delivery */}
            <div className="space-y-3 p-3 rounded-lg border bg-slate-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="scheduled"
                  checked={isScheduled}
                  onCheckedChange={setIsScheduled}
                  data-testid="scheduled-checkbox"
                />
                <Label htmlFor="scheduled" className="flex items-center gap-2 cursor-pointer">
                  <Clock className="w-4 h-4" />
                  Programlı Teslimat
                </Label>
              </div>
              
              {isScheduled && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <Label htmlFor="scheduled-date" className="text-xs">Tarih</Label>
                    <Input
                      id="scheduled-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={getMinDate()}
                      data-testid="scheduled-date-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="scheduled-time" className="text-xs">Saat</Label>
                    <Input
                      id="scheduled-time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={getMinTime()}
                      data-testid="scheduled-time-input"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    * Sipariş belirtilen saatten 30 dk önce hazırlanmaya başlar
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Product Selection */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Ürün Seçimi
            </h3>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : products.products.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Henüz ürün eklenmemiş</p>
                <p className="text-xs">Önce Ürünler sayfasından ürün ekleyin</p>
              </div>
            ) : (
              <div className="border rounded-lg max-h-[280px] overflow-y-auto">
                {Object.entries(groupedProducts).map(([catId, group]) => (
                  <div key={catId} className="border-b last:border-b-0">
                    <div className="px-3 py-2 bg-slate-50 font-medium text-sm">
                      {group.category.name}
                    </div>
                    <div className="divide-y">
                      {group.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          onClick={() => addProduct(product)}
                          data-testid={`product-${product.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{formatPrice(product.price)}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="shrink-0">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Items */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Sepet ({selectedItems.length})
              </h4>
              
              {selectedItems.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground border rounded-lg border-dashed">
                  <p className="text-sm">Sepet boş</p>
                  <p className="text-xs">Yukarıdan ürün seçin</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-[180px] overflow-y-auto">
                  {selectedItems.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-2 p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.product_id, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.product_id, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => removeItem(item.product_id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              {selectedItems.length > 0 && (
                <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg">
                  <span className="font-semibold">Toplam</span>
                  <span className="text-lg font-bold text-primary">{formatPrice(totalAmount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="submit-order-btn">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Siparişi Oluştur
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
