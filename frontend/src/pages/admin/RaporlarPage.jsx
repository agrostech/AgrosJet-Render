import RaporlarTab from "@/pages/muhasebe/RaporlarTab";

export default function RaporlarPage({ companyId, isSuperAdmin }) {
  return (
    <div data-testid="raporlar-page">
      <h2 className="font-heading text-xl font-bold tracking-tight mb-4">Raporlar</h2>
      <RaporlarTab companyId={companyId} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
