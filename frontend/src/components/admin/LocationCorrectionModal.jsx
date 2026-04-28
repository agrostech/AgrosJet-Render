import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Check, X, RefreshCw, Navigation } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API = process.env.REACT_APP_BACKEND_URL;

// Marker icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function LocationCorrectionModal({ open, onOpenChange, companyId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef(null);

  const fetchOrders = useCallback(async (searchTerm = "") => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (searchTerm) params.search = searchTerm;
      const res = await axios.get(`${API}/location-corrections/${companyId}/orders`, { params });
      setOrders(res.data.orders || []);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (open) fetchOrders();
  }, [open, fetchOrders]);

  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchOrders(value), 400);
  };

  const openMap = (order) => {
    setSelectedOrder(order);
    const loc = order.delivery_location;
    if (loc && loc.latitude && loc.longitude) {
      setSelectedLocation({ lat: loc.latitude, lng: loc.longitude });
    } else {
      setSelectedLocation(null);
    }
    setMapOpen(true);
  };

  const handleSave = async () => {
    if (!selectedOrder || !selectedLocation) return;
    setSaving(true);
    try {
      await axios.put(`${API}/location-corrections/${companyId}/orders/${selectedOrder.id}`, {
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
      });
      toast.success("Konum düzeltildi ve kaydedildi");
      setMapOpen(false);
      setSelectedOrder(null);
      // Listeyi güncelle
      setOrders(prev => prev.map(o => 
        o.id === selectedOrder.id 
          ? { ...o, location_corrected: true, delivery_location: { latitude: selectedLocation.lat, longitude: selectedLocation.lng } }
          : o
      ));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  // Varsayılan harita merkezi (Isparta)
  const defaultCenter = [37.76, 30.55];
  const mapCenter = selectedLocation 
    ? [selectedLocation.lat, selectedLocation.lng] 
    : defaultCenter;

  return (
    <>
      <Dialog open={open && !mapOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Konum Düzeltmeleri
            </DialogTitle>
          </DialogHeader>

          {/* Arama */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Müşteri adı veya adres ara..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="location-search"
            />
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {loading ? (
              <div className="py-8 text-center">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Sipariş bulunamadı</div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors hover:bg-slate-50 ${
                    order.location_corrected ? "border-green-200 bg-green-50/30" : "border-slate-200"
                  }`}
                  onClick={() => openMap(order)}
                  data-testid={`correction-order-${order.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-slate-800 truncate">{order.customer_name || "-"}</span>
                        {order.location_corrected && (
                          <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-muted-foreground line-clamp-1">{order.delivery_address || "-"}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>{order.restaurant_name}</span>
                        <span>{order.source}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] flex-shrink-0 gap-1">
                      <Navigation className="w-3 h-3" />
                      {order.location_corrected ? "Düzenle" : "Düzelt"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Harita Modalı */}
      <Dialog open={mapOpen} onOpenChange={(v) => { if (!v) setMapOpen(false); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              {selectedOrder?.customer_name} - Konum Seç
            </DialogTitle>
            {selectedOrder?.delivery_address && (
              <p className="text-xs text-muted-foreground mt-1">{selectedOrder.delivery_address}</p>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-[400px] relative">
            <MapContainer
              center={mapCenter}
              zoom={selectedLocation ? 16 : 13}
              style={{ height: "100%", width: "100%", minHeight: "400px" }}
              key={`${selectedOrder?.id}-${mapCenter[0]}-${mapCenter[1]}`}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onLocationSelect={setSelectedLocation} />
              {selectedLocation && (
                <Marker position={[selectedLocation.lat, selectedLocation.lng]} />
              )}
            </MapContainer>
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {selectedLocation ? (
                <span className="text-slate-700 font-mono">{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</span>
              ) : (
                <span>Haritaya tıklayarak konum seçin</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMapOpen(false)} className="h-8">
                <X className="w-3.5 h-3.5 mr-1" /> İptal
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!selectedLocation || saving}
                className="h-8"
                data-testid="save-location-btn"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
