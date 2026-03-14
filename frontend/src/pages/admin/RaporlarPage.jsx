import { useState, useEffect } from "react";
import axios from "axios";
import RaporlarTab from "@/pages/muhasebe/RaporlarTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RaporlarPage({ companyId, isSuperAdmin, companyLogo, companyName }) {
  const [logo, setLogo] = useState(companyLogo || "");
  const [name, setName] = useState(companyName || "");

  useEffect(() => {
    if (!companyId) return;
    // Always fetch fresh company data to get logo
    axios.get(`${API}/companies/${companyId}`).then(res => {
      const data = res.data || {};
      setLogo(data.logo_light || data.logo_url || "");
      setName(data.name || companyName || "");
    }).catch(() => {});
  }, [companyId, companyName]);

  return (
    <div data-testid="raporlar-page">
      <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Raporlar</h2>
      <RaporlarTab companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={logo} companyName={name} />
    </div>
  );
}
