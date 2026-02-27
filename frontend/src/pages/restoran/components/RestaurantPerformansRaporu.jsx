import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RefreshCw, Search, Package, Clock, Truck, Zap,
  Timer, AlertTriangle, Info, MapPin, BarChart3
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatMinutes(val) {
  if (val === null || val === undefined) return "-";
  if (val < 1) return "< 1 dk";
  const mins = Math.floor(val);
  const secs = Math.round((val - mins) * 60);
  if (secs > 0) return `${mins} dk ${secs} sn`;
  return `${mins} dk`;
}

function HeatMap({ points, center, totalOrders }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!center?.lat || !center?.lng || !mapRef.current) return;
    if (points.length === 0) return;

    // Destroy previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current).setView([center.lat, center.lng], 13);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    // Heatmap layer
    const heatData = points.map((p) => [p.lat, p.lng, 1]);
    L.heatLayer(heatData, {
      radius: 28,
      blur: 20,
      maxZoom: 16,
      max: 1.0,
      minOpacity: 0.4,
      gradient: { 0.2: "#00ff00", 0.4: "#adff2f", 0.6: "#ffff00", 0.8: "#ff4500", 1.0: "#ff0000" },
    }).addTo(map);

    // Individual markers
    points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 6,
        fillColor: "#ef4444",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);
    });

    // Fit bounds to show all points
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [points, center]);

  if (!center?.lat || !center?.lng) {
    return (
      <div className="flex items-center justify-center h-[350px] bg-muted/30 rounded-lg">
        <div className="text-center text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Harita merkezi bulunamadı</p>
          <p className="text-xs">Firma ayarlarından il bilgisi ekleyin</p>
        </div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px] bg-muted/30 rounded-lg">
        <div className="text-center text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Konum verisi bulunamadı</p>
          <p className="text-xs">Siparişlerde teslimat koordinatı bulunmuyor</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div ref={mapRef} className="w-full h-[350px] rounded-lg" />
      {totalOrders > points.length && (
        <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
          <Info className="w-3 h-3" />
          {totalOrders - points.length} siparişin teslimat koordinatı bulunmuyor (Adisyo siparişlerinde koordinat eksik)
        </p>
      )}
    </div>
  );
}

export default function RestaurantPerformansRaporu({ restaurantId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  const getDefaultDates = useCallback((settings) => {
    const s = settings || { opening_time: "09:00", closing_time: "23:00" };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const openingTime = s.opening_time || "09:00";
    const closingTime = s.closing_time || "23:00";
    return {
      startDateTime: `${today.toISOString().split("T")[0]}T${openingTime}`,
      endDateTime: `${tomorrow.toISOString().split("T")[0]}T${closingTime}`,
    };
  }, []);

  const formatDateTurkey = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    return `${dateTimeStr}:00+03:00`;
  };

  const fetchData = useCallback(
    async (params = {}) => {
      const start = params.startDateTime || startDateTime;
      const end = params.endDateTime || endDateTime;
      if (!start || !end || !restaurantId) return;

      setLoading(true);
      try {
        const res = await axios.get(
          `${API}/reports/restaurant/${restaurantId}/performance`,
          {
            params: {
              start_datetime: formatDateTurkey(start),
              end_datetime: formatDateTurkey(end),
            },
          }
        );
        setData(res.data);
      } catch (err) {
        console.error("Performans verisi alınamadı:", err);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [restaurantId, startDateTime, endDateTime]
  );

  useEffect(() => {
    const initData = async () => {
      if (!companyId || !restaurantId) return;
      try {
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        const company = companyRes.data;
        const settings = {
          opening_time: company?.opening_time || "09:00",
          closing_time: company?.closing_time || "23:00",
        };
        const defaults = getDefaultDates(settings);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);

        setLoading(true);
        try {
          const res = await axios.get(
            `${API}/reports/restaurant/${restaurantId}/performance`,
            {
              params: {
                start_datetime: formatDateTurkey(defaults.startDateTime),
                end_datetime: formatDateTurkey(defaults.endDateTime),
              },
            }
          );
          setData(res.data);
        } catch (err) {
          console.error("Performans verisi alınamadı:", err);
          setData(null);
        } finally {
          setLoading(false);
        }
        setInitialized(true);
      } catch (err) {
        console.error("Şirket ayarları alınamadı:", err);
      }
    };
    if (!initialized) {
      initData();
    }
  }, [companyId, restaurantId, initialized, getDefaultDates]);

  const handleFilter = () => {
    fetchData();
  };

  const statCards = data
    ? [
        {
          label: "Toplam Sipariş",
          value: data.total_orders,
          icon: Package,
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          label: "Ort. Hazırlık Süresi",
          value: formatMinutes(data.avg_prep_minutes),
          sub: "Sipariş oluşturma → Yola çıkış",
          icon: Clock,
          color: "text-amber-600",
          bg: "bg-amber-50",
        },
        {
          label: "Ort. Teslimat Süresi",
          value: formatMinutes(data.avg_delivery_minutes),
          sub: "Yola çıkış → Teslim",
          icon: Truck,
          color: "text-emerald-600",
          bg: "bg-emerald-50",
        },
      ]
    : [];

  const timeCards = data
    ? [
        {
          label: "15 dk altı",
          value: data.under_15,
          icon: Zap,
          color: "text-emerald-600",
          bg: "bg-emerald-50",
          border: "border-emerald-200",
        },
        {
          label: "15 - 30 dk",
          value: data.between_15_30,
          icon: Timer,
          color: "text-blue-600",
          bg: "bg-blue-50",
          border: "border-blue-200",
        },
        {
          label: "30 - 45 dk",
          value: data.between_30_45,
          icon: Clock,
          color: "text-amber-600",
          bg: "bg-amber-50",
          border: "border-amber-200",
        },
        {
          label: "45 dk üzeri",
          value: data.over_45,
          showInfo: !data.show_over_45,
          icon: AlertTriangle,
          color: "text-red-600",
          bg: "bg-red-50",
          border: "border-red-200",
        },
      ]
    : [];

  return (
    <div className="space-y-4" data-testid="restaurant-performans-raporu">
      {/* Filter Card - same as Mütabakat */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Başlangıç
              </Label>
              <Input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-8 text-xs"
                data-testid="perf-start-date"
              />
            </div>
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Bitiş
              </Label>
              <Input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-8 text-xs"
                data-testid="perf-end-date"
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                onClick={handleFilter}
                disabled={loading}
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                data-testid="perf-filter-btn"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Filtrele
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="space-y-4">
          {/* Main Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${card.bg} shrink-0`}
                      >
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {card.label}
                        </p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {card.value}
                        </p>
                        {card.sub && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {card.sub}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Time Distribution */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Teslimat Süre Dağılımı
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  (Oluşturma → Teslim)
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {timeCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.label}
                      className={`rounded-lg border ${card.border} p-3 ${card.bg} bg-opacity-30`}
                      data-testid={`time-card-${card.label.replace(/\s+/g, "-")}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${card.color}`} />
                        <span className="text-xs font-medium text-slate-700">
                          {card.label}
                        </span>
                        {card.showInfo && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  Hesaplanamadı - Günlük ortalama 5'in altında
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className={`text-2xl font-bold ${card.color}`}>
                        {card.value !== null ? card.value : "-"}
                      </p>
                      {card.value !== null && data.calculable_orders > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          %
                          {Math.round(
                            (card.value / data.calculable_orders) * 100
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {data.calculable_orders < data.total_orders && (
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {data.total_orders - data.calculable_orders} siparişin süre
                  bilgisi eksik
                </p>
              )}
            </CardContent>
          </Card>

          {/* Heat Map */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Sipariş Yoğunluk Haritası
                </h3>
                {data.heatmap_points?.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {data.heatmap_points.length} konum
                  </span>
                )}
              </div>
              <HeatMap
                points={data.heatmap_points || []}
                center={data.map_center}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Initial state */}
      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Tarih aralığı seçip "Filtrele" butonuna tıklayın
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
