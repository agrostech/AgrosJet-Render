import { useState, useEffect } from "react";
import axios from "axios";
import RaporlarTab from "@/pages/muhasebe/RaporlarTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RaporlarPage({ companyId, isSuperAdmin, companyLogo, companyName }) {
  const [logo, setLogo] = useState(companyLogo || "");
  const [name, setName] = useState(companyName || "");

  // Always fetch company to get logo_light - props from AdminDashboard may be empty
  useEffect(() => {
    if (!companyId) return;
    axios.get(`${API}/companies/${companyId}`).then(res => {
      const data = res.data || {};
      const l = data.logo_light || data.logo_url || "";
      const n = data.name || "";
      if (l) setLogo(l);
      if (n) setName(n);
    }).catch(() => {});
  }, [companyId]);

  // Also update if props change (e.g. after login refresh)
  useEffect(() => {
    if (companyLogo) setLogo(companyLogo);
    if (companyName) setName(companyName);
  }, [companyLogo, companyName]);

  return (
    <div data-testid="raporlar-page">
      <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Raporlar</h2>
      <RaporlarTab companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={logo} companyName={name} />
    </div>
  );
}
