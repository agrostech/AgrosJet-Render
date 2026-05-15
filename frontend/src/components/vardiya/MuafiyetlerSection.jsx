import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Filter } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_LABEL = {
  pending: { label: "Bekliyor", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Onaylandı", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Reddedildi", cls: "bg-red-100 text-red-700" },
};

const formatDt = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function MuafiyetlerSection({ companyId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeImage, setActiveImage] = useState(null); // büyük görsel modal

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await axios.get(`${API}/exemption-requests`, { params });
      setItems(res.data.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items.filter(r => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (r.courier_name || "").toLowerCase().includes(q) ||
           (r.reason_label || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3" data-testid="muafiyetler-section">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" />
          Muafiyet Kayıtları
        </h3>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-32">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="pending">Bekliyor</SelectItem>
              <SelectItem value="approved">Onaylandı</SelectItem>
              <SelectItem value="rejected">Reddedildi</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kurye adı veya sebep ara..."
            className="h-8 text-xs w-44"
            data-testid="muafiyet-search"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Kayıt bulunamadı</p>
        </div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left p-2 font-semibold">Tarih</th>
                <th className="text-left p-2 font-semibold">Kurye</th>
                <th className="text-left p-2 font-semibold">Sebep</th>
                <th className="text-left p-2 font-semibold">Durum</th>
                <th className="text-left p-2 font-semibold">Karar Veren</th>
                <th className="text-left p-2 font-semibold">Görsel</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const statusInfo = STATUS_LABEL[r.status] || {};
                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid={`muafiyet-row-${r.id}`}>
                    <td className="p-2 whitespace-nowrap">{formatDt(r.submitted_at)}</td>
                    <td className="p-2 font-medium">{r.courier_name}</td>
                    <td className="p-2">
                      {r.reason_label}
                      {r.notes && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-xs">{r.notes}</p>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                      {r.status === "approved" && r.exempt_until && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          → {formatDt(r.exempt_until)}
                        </p>
                      )}
                      {r.status === "rejected" && r.rejection_reason && (
                        <p className="text-[10px] italic text-muted-foreground mt-0.5">"{r.rejection_reason}"</p>
                      )}
                    </td>
                    <td className="p-2">
                      {r.decided_by_name || "-"}
                      {r.decided_at && (
                        <p className="text-[10px] text-muted-foreground">{formatDt(r.decided_at)}</p>
                      )}
                    </td>
                    <td className="p-2">
                      {r.image_url ? (
                        <button onClick={() => setActiveImage(r.image_url)} className="block">
                          <img
                            src={r.image_url}
                            alt=""
                            className="w-12 h-12 object-cover rounded border hover:scale-110 transition-transform"
                          />
                        </button>
                      ) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Görsel büyütme overlay */}
      {activeImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setActiveImage(null)}
        >
          <img src={activeImage} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
