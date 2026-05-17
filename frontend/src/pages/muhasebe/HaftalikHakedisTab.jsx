/**
 * Kurye Hakediş Sekmesi (eski "Haftalık Hakediş")
 *
 * Artık sadece günlük hakediş görünümünü içerir.
 * Eski haftalık görünüm UI'dan kaldırıldı (DailyHakedisView içine entegre edildi).
 */
import DailyHakedisView from "./DailyHakedisView";

export default function HaftalikHakedisTab({ companyId, adminId, adminName, isSuperAdmin }) {
  return (
    <div className="space-y-4" data-testid="haftalik-hakedis-tab">
      <DailyHakedisView
        companyId={companyId}
        adminId={adminId}
        adminName={adminName}
        isSuperAdmin={!!isSuperAdmin}
      />
    </div>
  );
}
