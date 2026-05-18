/**
 * Kurye Faturaları Sekmesi (Yeniden Tasarlandı)
 *
 * Üst: Hafta şeritli seçici (son 7 hafta, kurye hakediş tarzı)
 * Orta: Seçili hafta detay paneli
 * Alt: Eksik Faturalar kartı + Ay Faturaları (birleşik) kartı
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

import { useFaturalar } from "@/hooks/useFaturalar";
import WeeksStripSelector from "@/components/faturalar/WeeksStripSelector";
import WeekDetailPanel from "@/components/faturalar/WeekDetailPanel";
import MonthlyInvoicesCard from "@/components/faturalar/MonthlyInvoicesCard";
import CourierAutoSettingsCard from "@/components/faturalar/CourierAutoSettingsCard";
import { MissingInvoicesCard } from "@/components/faturalar/MissingInvoicesCard";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function FaturalarTab({ companyId, isSuperAdmin }) {
  const [weeks, setWeeks] = useState([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(null);
  const [loadingWeeks, setLoadingWeeks] = useState(false);

  // Eski "eksik faturalar" listesini için useFaturalar hook'unu yıl/ay agnostic çekiyoruz
  const now = new Date();
  const { missingInvoices, dismissMissingInvoice } = useFaturalar(
    companyId,
    now.getFullYear(),
    now.getMonth() + 1
  );

  const fetchWeeks = useCallback(async () => {
    if (!companyId) return;
    setLoadingWeeks(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/weeks-summary/${companyId}`, {
        params: { weeks: 7 },
      });
      const w = res.data.weeks || [];
      const sorted = [...w].reverse();
      setWeeks(sorted);
      setSelectedWeekStart((prev) => {
        if (prev) return prev;
        return sorted.length > 0 ? sorted[sorted.length - 1].week_start : null;
      });
    } catch {
      toast.error("Hafta özetleri alınamadı");
      setWeeks([]);
    } finally {
      setLoadingWeeks(false);
    }
  }, [companyId]);

  useEffect(() => { fetchWeeks(); }, [fetchWeeks]);

  const selectedWeek = weeks.find((w) => w.week_start === selectedWeekStart) || null;
  const isFutureWeek = !!(selectedWeek?.is_current && selectedWeek.created === 0);

  return (
    <div className="space-y-4" data-testid="faturalar-tab">
      {/* 1. ÜST: Hafta şeritli seçici */}
      <WeeksStripSelector
        weeks={weeks}
        selectedWeekStart={selectedWeekStart}
        onSelect={(w) => setSelectedWeekStart(w.week_start)}
      />

      {/* Otomatik işleme aç/kapa */}
      <CourierAutoSettingsCard companyId={companyId} />

      {!loadingWeeks && weeks.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-white">
          Henüz hafta verisi yok.
        </div>
      )}

      {/* 2. ORTA: Seçili hafta detay paneli */}
      {selectedWeek && (
        <WeekDetailPanel
          companyId={companyId}
          week={selectedWeek}
          isFuture={isFutureWeek}
          isSuperAdmin={isSuperAdmin}
          onChanged={fetchWeeks}
        />
      )}

      {/* 3. ALT: Eksik Faturalar (eski sistem) */}
      {missingInvoices.length > 0 && (
        <MissingInvoicesCard
          missingInvoices={missingInvoices}
          isSuperAdmin={isSuperAdmin}
          onDismiss={dismissMissingInvoice}
        />
      )}

      {/* 4. ALT: Ay Faturaları (birleşik: approved obligation + eski invoices) */}
      <MonthlyInvoicesCard companyId={companyId} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
