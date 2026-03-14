import { useState, useEffect } from "react";
import axios from "axios";
import RaporlarTab from "@/pages/muhasebe/RaporlarTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RaporlarPage({ companyId, isSuperAdmin, companyLogo, companyName }) {
  const [logo, setLogo] = useState(companyLogo);
  const [name, setName] = useState(companyName);

  useEffect(() => {
    if (companyId && !companyLogo) {
      axios.get(`${API}/companies/${companyId}`).then(res => {
        setLogo(res.data?.logo_light || res.data?.logo_url || "");
        setName(res.data?.name || "");
      }).catch(() => {});
    }
  }, [companyId, companyLogo]);

  return (
    <div data-testid="raporlar-page">
      <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Raporlar</h2>
      <RaporlarTab companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={logo || companyLogo} companyName={name || companyName} />
    </div>
  );
}
