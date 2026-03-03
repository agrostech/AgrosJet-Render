import { useState, useEffect, useMemo, useRef } from "react";
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
  Search,
  UtensilsCrossed,
  ChevronRight,
  ChevronLeft,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Step indicator component
function StepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 border-b">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            currentStep === index 
              ? "bg-primary text-primary-foreground" 
              : currentStep > index 
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
          }`}>
            {currentStep > index ? (
              <Check className="w-4 h-4" />
            ) : (
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/20 text-xs">
                {index + 1}
              </span>
            )}
            <span className="hidden sm:inline">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 mx-1 text-slate-300" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewOrderModal({ open, onOpenChange, restaurantId, onOrderCreated }) {
  // Step state
  const [currentStep, setCurrentStep] = useState(0);
  const steps = [
    { id: "products", label: "Ürün Seçimi" },
    { id: "customer", label: "Müşteri Bilgileri" },
    { id: "payment", label: "Ödeme" },
  ];

  // Yemek kartı türleri
  const MEAL_CARD_TYPES = [
    { id: "ticket", label: "Ticket" },
    { id: "sodexo", label: "Sodexo" },
    { id: "multinet", label: "Multinet" },
    { id: "setcard", label: "Setcard" },
    { id: "metropol", label: "Metropol" },
    { id: "edenred", label: "Edenred" },
    { id: "other", label: "Diğer" },
  ];

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [addressDetails, setAddressDetails] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethodDetail, setPaymentMethodDetail] = useState("");
  const [showMealCardTypes, setShowMealCardTypes] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Products state
  const [products, setProducts] = useState({ categories: [], products: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  // Manuel tutar state
  const [manualAmount, setManualAmount] = useState("");
  const [manualAmountNote, setManualAmountNote] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Google Places Autocomplete ref
  const autocompleteRef = useRef(null);
  const addressInputId = "delivery-address-autocomplete";

  // Initialize Google Places when on step 2
  useEffect(() => {
    if (!open || currentStep !== 1) {
      return;
    }

    const initAutocomplete = () => {
      const inputElement = document.getElementById(addressInputId);
      
      if (!inputElement || !window.google?.maps?.places) {
        return false;
      }

      if (autocompleteRef.current) {
        return true;
      }

      const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: "tr" },
        types: ["geocode", "establishment"],
        fields: ["formatted_address", "geometry", "name"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setDeliveryAddress(place.formatted_address || place.name);
          setDeliveryLocation({ lat, lng });
        }
      });

      autocompleteRef.current = autocomplete;
      return true;
    };

    if (!initAutocomplete()) {
      const timer = setTimeout(initAutocomplete, 500);
      return () => clearTimeout(timer);
    }
  }, [open, currentStep]);

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

  // Müşteri arama fonksiyonu
  const searchCustomers = async (query) => {
    if (!query || query.length < 2) {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    
    setSearchingCustomer(true);
    try {
      const res = await axios.get(`${API}/customers/${restaurantId}`, {
        params: { search: query }
      });
      setCustomerSearchResults(res.data.customers || []);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error("Müşteri arama hatası:", err);
      setCustomerSearchResults([]);
    } finally {
      setSearchingCustomer(false);
    }
  };

  // Müşteri seçildiğinde bilgileri doldur
  const selectCustomer = (customer) => {
    setCustomerName(customer.name || "");
    setCustomerPhone(customer.phone || "");
    setDeliveryAddress(customer.address || "");
    setAddressDetails(customer.address_direction || "");
    if (customer.latitude && customer.longitude) {
      setDeliveryLocation({ lat: customer.latitude, lng: customer.longitude });
    }
    setShowCustomerDropdown(false);
    setCustomerSearchQuery("");
    toast.success("Müşteri bilgileri dolduruldu");
  };

  const resetForm = () => {
    setCurrentStep(0);
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setAddressDetails("");
    setDeliveryLocation(null);
    setNotes("");
    setPaymentMethod("");
    setPaymentMethodDetail("");
    setShowMealCardTypes(false);
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
    setSelectedItems([]);
    setProductSearch("");
    setSelectedCategory("all");
    setManualAmount("");
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
    setManualAmountNote("");
    if (autocompleteRef.current) {
      window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
      autocompleteRef.current = null;
    }
  };

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    const searchLower = productSearch.toLowerCase().trim();
    
    products.categories.forEach((cat) => {
      if (selectedCategory !== "all" && cat.id !== selectedCategory) {
        return;
      }
      
      let categoryProducts = products.products.filter((p) => p.category_id === cat.id);
      
      if (searchLower) {
        categoryProducts = categoryProducts.filter((p) => 
          p.name.toLowerCase().includes(searchLower)
        );
      }
      
      if (categoryProducts.length > 0) {
        groups[cat.id] = {
          category: cat,
          products: categoryProducts,
        };
      }
    });
    return groups;
  }, [products, productSearch, selectedCategory]);

  // Product functions
  const addProduct = (product) => {
    const existingIndex = selectedItems.findIndex((item) => item.product_id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...selectedItems];
      newItems[existingIndex].quantity += 1;
      setSelectedItems(newItems);
    } else {
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

  const removeItem = (productId) => {
    setSelectedItems(selectedItems.filter((item) => item.product_id !== productId));
  };

  // Calculate total (ürünler + manuel tutar)
  const totalAmount = useMemo(() => {
    const productsTotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const manualTotal = parseFloat(manualAmount) || 0;
    return productsTotal + manualTotal;
  }, [selectedItems, manualAmount]);

  // Format price
  const formatPrice = (price) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Step navigation
  const canGoNext = () => {
    if (currentStep === 0) {
      // Ürün seçilmiş veya manuel tutar girilmiş olmalı
      return selectedItems.length > 0 || (parseFloat(manualAmount) > 0);
    }
    if (currentStep === 1) {
      if (!customerName.trim()) return false;
      if (!customerPhone.trim()) return false;
      if (!deliveryAddress.trim()) return false;
      if (isScheduled && (!scheduledDate || !scheduledTime)) return false;
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 0 && selectedItems.length === 0 && !(parseFloat(manualAmount) > 0)) {
      toast.error("En az bir ürün seçin veya manuel tutar girin");
      return;
    }
    if (currentStep === 1) {
      if (!customerName.trim()) {
        toast.error("Müşteri adı gerekli");
        return;
      }
      if (!customerPhone.trim()) {
        toast.error("Telefon numarası gerekli");
        return;
      }
      if (!deliveryAddress.trim()) {
        toast.error("Teslimat adresi gerekli");
        return;
      }
      if (isScheduled && (!scheduledDate || !scheduledTime)) {
        toast.error("İleri tarihli teslimat için tarih ve saat seçmelisiniz");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // Handle payment selection
  const handlePaymentSelect = async (selectedPayment, detail = null) => {
    // Yemek kartı seçildiyse tür seçimi ekranını göster
    if (selectedPayment === "meal_card" && !detail) {
      setShowMealCardTypes(true);
      return;
    }
    
    setPaymentMethod(selectedPayment);
    setPaymentMethodDetail(detail);
    setShowMealCardTypes(false);
    
    let scheduledTimeISO = null;
    if (isScheduled) {
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      scheduledTimeISO = scheduledDateTime.toISOString();
    }

    setSubmitting(true);
    try {
      const fullAddress = addressDetails.trim() 
        ? `${deliveryAddress.trim()}, ${addressDetails.trim()}`
        : deliveryAddress.trim();

      // Manuel tutar varsa items'a ekle
      const finalItems = [...selectedItems];
      if (parseFloat(manualAmount) > 0) {
        finalItems.push({
          product_id: "manual_amount",
          name: manualAmountNote.trim() || "Manuel Tutar",
          price: parseFloat(manualAmount),
          quantity: 1,
        });
      }

      const res = await axios.post(`${API}/orders/manual`, {
        restaurant_id: restaurantId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_address: fullAddress,
        delivery_location: deliveryLocation,
        items: finalItems,
        payment_method: selectedPayment,
        payment_method_detail: detail,
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

  // Date/time helpers
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const getMinTime = () => {
    if (!scheduledDate) return "";
    const today = new Date().toISOString().split("T")[0];
    if (scheduledDate === today) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 45);
      return now.toTimeString().slice(0, 5);
    }
    return "00:00";
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderProductStep();
      case 1:
        return renderCustomerStep();
      case 2:
        return renderPaymentStep();
      default:
        return null;
    }
  };

  // Step 1: Product Selection
  const renderProductStep = () => (
    <div className="space-y-4 py-4">
      {/* Search and Category Filter */}
      {products.products.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Ürün ara..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          {products.categories.length > 1 && (
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                {products.categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product List */}
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Ürünler
          </h4>
          {loadingProducts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : products.products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Henüz ürün eklenmemiş</p>
            </div>
          ) : Object.keys(groupedProducts).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Ürün bulunamadı</p>
            </div>
          ) : (
            <div className="border rounded-lg max-h-[350px] overflow-y-auto">
              {Object.entries(groupedProducts).map(([catId, group]) => (
                <div key={catId} className="border-b last:border-b-0">
                  <div className="px-3 py-2 bg-slate-50 font-medium text-sm sticky top-0">
                    {group.category.name}
                  </div>
                  <div className="divide-y">
                    {group.products.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        onClick={() => addProduct(product)}
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
        </div>

        {/* Cart */}
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            Sepet ({selectedItems.length})
          </h4>
          
          <div className="space-y-3">
            {selectedItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sepet boş</p>
                <p className="text-xs">Soldan ürün seçin veya manuel tutar girin</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-[220px] overflow-y-auto">
                {selectedItems.map((item) => (
                  <div key={item.product_id} className="flex items-center gap-2 p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(item.price)} x {item.quantity} = {formatPrice(item.price * item.quantity)}
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

            {/* Manuel Tutar */}
            <div className="p-3 border rounded-lg bg-slate-50 space-y-2">
              <Label className="text-xs font-medium text-slate-600">Manuel Tutar Ekle</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Tutar (₺)"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-24 h-8 text-sm"
                  min="0"
                  step="0.01"
                />
                <Input
                  type="text"
                  placeholder="Açıklama (opsiyonel)"
                  value={manualAmountNote}
                  onChange={(e) => setManualAmountNote(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
              </div>
            </div>

            {/* Total */}
            {(selectedItems.length > 0 || parseFloat(manualAmount) > 0) && (
              <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg">
                <span className="font-semibold">Toplam</span>
                <span className="text-lg font-bold text-primary">{formatPrice(totalAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Step 2: Customer Info
  const renderCustomerStep = () => (
    <div className="space-y-4 py-4 max-w-lg mx-auto">
      {/* Kayıtlı Müşteri Arama */}
      <div className="p-3 rounded-lg border bg-blue-50/50 border-blue-200 space-y-2">
        <Label className="text-sm font-medium text-blue-700 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Kayıtlı Müşterilerde Ara
        </Label>
        <div className="relative">
          <Input
            placeholder="İsim, telefon veya adres ile ara..."
            value={customerSearchQuery}
            onChange={(e) => {
              setCustomerSearchQuery(e.target.value);
              searchCustomers(e.target.value);
            }}
            className="bg-white"
          />
          {searchingCustomer && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {/* Dropdown */}
          {showCustomerDropdown && customerSearchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {customerSearchResults.map((customer) => (
                <div
                  key={customer.id}
                  className="p-2 hover:bg-slate-50 cursor-pointer border-b last:border-b-0"
                  onClick={() => selectCustomer(customer)}
                >
                  <div className="font-medium text-sm">{customer.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    {customer.phone}
                  </div>
                  {customer.address && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{customer.address}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {showCustomerDropdown && customerSearchResults.length === 0 && customerSearchQuery.length >= 2 && !searchingCustomer && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-center text-sm text-muted-foreground">
              Müşteri bulunamadı
            </div>
          )}
        </div>
      </div>

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
        />
      </div>

      {/* Customer Phone */}
      <div className="space-y-2">
        <Label htmlFor="customer-phone" className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Telefon *
        </Label>
        <Input
          id="customer-phone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="05XX XXX XX XX"
        />
      </div>

      {/* Delivery Address */}
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
          placeholder="Sokak ve bina numarası girin"
          autoComplete="off"
          className="flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
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

      {/* Address Details */}
      <div className="space-y-2">
        <Label htmlFor="address-details">Adres Detayları</Label>
        <Input
          id="address-details"
          value={addressDetails}
          onChange={(e) => setAddressDetails(e.target.value)}
          placeholder="Apartman / Site Adı, Kat ve Daire"
        />
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
        />
      </div>

      {/* Scheduled Delivery */}
      <div className="space-y-3 p-3 rounded-lg border bg-slate-50">
        <div className="flex items-center gap-2">
          <Checkbox
            id="scheduled"
            checked={isScheduled}
            onCheckedChange={(checked) => {
              setIsScheduled(checked);
              if (checked) {
                const now = new Date();
                setScheduledDate(now.toISOString().split("T")[0]);
                now.setHours(now.getHours() + 1);
                now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
                setScheduledTime(now.toTimeString().slice(0, 5));
              }
            }}
          />
          <Label htmlFor="scheduled" className="flex items-center gap-2 cursor-pointer">
            <Clock className="w-4 h-4" />
            İleri Tarihli Teslimat
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
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              * Sipariş belirtilen saatten 30 dk önce hazır olacak şekilde hazırlanır
            </p>
          </div>
        )}
      </div>

      {/* Order Summary */}
      <div className="p-3 bg-slate-100 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{selectedItems.length} ürün</span>
          <span className="font-bold text-primary">{formatPrice(totalAmount)}</span>
        </div>
      </div>
    </div>
  );

  // Step 3: Payment Selection
  const renderPaymentStep = () => (
    <div className="py-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">
          {showMealCardTypes ? "Yemek Kartı Türü Seçin" : "Ödeme Yöntemi Seçin"}
        </h3>
        <p className="text-2xl font-bold text-primary mt-2">{formatPrice(totalAmount)}</p>
        <p className="text-sm text-muted-foreground mt-1">{customerName} - {customerPhone}</p>
      </div>
      
      {showMealCardTypes ? (
        // Yemek kartı türleri
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {MEAL_CARD_TYPES.map((type) => (
              <Button
                key={type.id}
                variant="outline"
                className="h-16 flex flex-col items-center justify-center gap-1 hover:bg-orange-50 hover:border-orange-500 transition-all"
                onClick={() => handlePaymentSelect("meal_card", type.label)}
                disabled={submitting}
              >
                <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                <span className="font-medium text-sm">{type.label}</span>
              </Button>
            ))}
          </div>
          <Button 
            variant="ghost" 
            className="w-full mt-2" 
            onClick={() => setShowMealCardTypes(false)}
            disabled={submitting}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Geri
          </Button>
        </div>
      ) : (
        // Ana ödeme yöntemleri
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-green-50 hover:border-green-500 transition-all"
            onClick={() => handlePaymentSelect("cash")}
            disabled={submitting}
          >
            <Banknote className="w-8 h-8 text-green-600" />
            <span className="font-medium">Nakit</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-blue-50 hover:border-blue-500 transition-all"
            onClick={() => handlePaymentSelect("card")}
            disabled={submitting}
          >
            <CreditCard className="w-8 h-8 text-blue-600" />
            <span className="font-medium">Kredi Kartı</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-orange-50 hover:border-orange-500 transition-all"
            onClick={() => handlePaymentSelect("meal_card")}
            disabled={submitting}
          >
            <UtensilsCrossed className="w-8 h-8 text-orange-600" />
            <span className="font-medium">Yemek Kartı</span>
          </Button>
          
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-purple-50 hover:border-purple-500 transition-all"
            onClick={() => handlePaymentSelect("online")}
            disabled={submitting}
          >
            <Smartphone className="w-8 h-8 text-purple-600" />
            <span className="font-medium">Online</span>
          </Button>
        </div>
      )}
      
      {submitting && (
        <div className="flex items-center justify-center py-4 mt-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Sipariş oluşturuluyor...</span>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] overflow-y-auto p-0" 
        data-testid="new-order-modal"
        onInteractOutside={(e) => {
          const target = e.target;
          if (target.closest('.pac-container') || target.classList.contains('pac-item')) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target;
          if (target.closest('.pac-container') || target.classList.contains('pac-item')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Yeni Telefon Siparişi
          </DialogTitle>
          <DialogDescription>Manuel sipariş girişi yapın</DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} steps={steps} />

        {/* Step Content */}
        <div className="px-6">
          {renderStepContent()}
        </div>

        {/* Footer Navigation */}
        <DialogFooter className="px-6 py-4 border-t flex justify-between">
          <div>
            {currentStep > 0 && currentStep < 2 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Geri
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              İptal
            </Button>
            {currentStep < 2 && (
              <Button onClick={handleNext} disabled={!canGoNext()}>
                {currentStep === 0 ? "Müşteri Bilgileri" : "Ödeme Seçimi"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
