/**
 * Shared PDF export utility for all report tabs.
 * Follows the same design as the accounting transaction history PDF.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RobotoRegular } from "@/utils/robotoFont";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function formatDateTR(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

async function addCompanyLogo(doc, companyId, pageWidth) {
  if (!companyId) { console.error("[LOGO] companyId yok!"); return; }
  try {
    // Step 1: Get company data to find logo path
    const compUrl = `${BACKEND}/api/companies/${companyId}`;
    console.log("[LOGO] Step 1 - Fetching company:", compUrl);
    const compRes = await fetch(compUrl);
    console.log("[LOGO] Step 1 - Response status:", compRes.status);
    if (!compRes.ok) { console.error("[LOGO] Step 1 FAILED - status:", compRes.status); return; }
    const company = await compRes.json();
    const logoPath = company.logo_light || company.logo_url;
    console.log("[LOGO] Step 1 - logo_light:", company.logo_light, "logo_url:", company.logo_url, "chosen:", logoPath);
    if (!logoPath) { console.error("[LOGO] Step 1 FAILED - no logo path found"); return; }

    // Step 2: Fetch logo image
    const logoUrl = logoPath.startsWith('/')
      ? `${BACKEND}${logoPath}`
      : `${BACKEND}/api/proxy-image?url=${encodeURIComponent(logoPath)}`;
    console.log("[LOGO] Step 2 - Fetching image:", logoUrl);
    const logoRes = await fetch(logoUrl);
    console.log("[LOGO] Step 2 - Response status:", logoRes.status, "content-type:", logoRes.headers.get('content-type'));
    if (!logoRes.ok) { console.error("[LOGO] Step 2 FAILED - status:", logoRes.status); return; }

    // Step 3: Convert to dataURL
    const blob = await logoRes.blob();
    console.log("[LOGO] Step 3 - Blob size:", blob.size, "type:", blob.type);
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    console.log("[LOGO] Step 3 - DataURL length:", dataUrl.length, "starts with:", dataUrl.substring(0, 30));

    // Step 4: Get image dimensions for aspect ratio
    const img = await new Promise((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = (e) => { console.error("[LOGO] Step 4 FAILED - Image load error:", e); reject(e); };
      i.src = dataUrl;
    });
    console.log("[LOGO] Step 4 - Image dimensions:", img.naturalWidth, "x", img.naturalHeight);
    const maxH = 15, maxW = 35;
    const aspect = img.naturalWidth / img.naturalHeight;
    let w = maxH * aspect, h = maxH;
    if (w > maxW) { w = maxW; h = w / aspect; }
    console.log("[LOGO] Step 5 - Adding to PDF at:", pageWidth - w - 14, 5, "size:", w, "x", h);

    doc.addImage(dataUrl, 'PNG', pageWidth - w - 20, 8, w, h);
    console.log("[LOGO] SUCCESS - Logo added to PDF");
  } catch (e) {
    console.error("[LOGO] EXCEPTION:", e);
  }
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Sayfa ${i} / ${pageCount}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
    doc.text(
      "AgrosJet - Powered by AgrosTech",
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }
}

function initDoc() {
  const doc = new jsPDF();
  doc.addFileToVFS("Roboto-Regular.ttf", RobotoRegular);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto");
  return doc;
}

function drawHeader(doc, title, subtitle, companyName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 32, pageWidth - 14, 32);

  doc.setTextColor(51, 51, 51);
  doc.setFontSize(18);
  doc.text(title, 14, 15);
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(subtitle, 14, 26);
}

function drawSummaryBox(doc, text, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(250, 250, 250);
  doc.rect(14, startY, pageWidth - 28, 14, "F");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(text, 20, startY + 8);
  return startY + 20;
}

function drawDateRange(doc, startDate, endDate, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const dateText = `${formatDateTR(startDate)} - ${formatDateTR(endDate)}`;
  doc.text(dateText, 14, y);
  doc.text(`Oluşturulma: ${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, y, { align: "right" });
  return y + 8;
}

const fmt = (val) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);

/**
 * Export Kurye Raporu as PDF
 */
export async function exportKuryeRaporuPDF({ reportData, companyLogo, companyName, dateRange, companyId }) {
  if (!reportData?.couriers?.length) {
    toast.error("İndirilecek veri bulunamadı");
    return;
  }
  const doc = initDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const s = reportData.summary;

  drawHeader(doc, "Kurye Raporu", companyName || "");
  await addCompanyLogo(doc, companyId, pageWidth);

  let currentY = drawDateRange(doc, dateRange?.start, dateRange?.end, 38);

  const summaryText = `Kurye: ${reportData.couriers.length}  |  Toplam Paket: ${s?.totalOrders || 0}  |  Toplam Hakediş: ${fmt(s?.totalCombined || s?.totalEarnings || 0)} TL`;
  const tableY = drawSummaryBox(doc, summaryText, currentY);

  const hasMealCard = reportData.hasMealCardCollection;
  const head = [["Kurye", "Paket", "Saat", "Paket Ü.", "Saatlik Ü.", "Toplam", "Nakit", "K.Kartı"]];
  if (hasMealCard) head[0].push("Y.Kartı");

  const body = reportData.couriers.map((c) => {
    const row = [
      c.name,
      c.orderCount,
      `${c.active_hours}s`,
      `${c.earnings.toFixed(2)}`,
      `${c.hourly_earnings.toFixed(2)}`,
      `${(c.total_earnings || c.earnings).toFixed(2)}`,
      `${c.cash.toFixed(2)}`,
      `${c.card.toFixed(2)}`,
    ];
    if (hasMealCard) row.push(`${(c.meal_card || 0).toFixed(2)}`);
    return row;
  });

  autoTable(doc, {
    startY: tableY,
    head,
    body,
    theme: "striped",
    headStyles: { fillColor: [70, 130, 180], textColor: 255, font: "Roboto", fontStyle: "normal" },
    styles: { fontSize: 8, font: "Roboto", fontStyle: "normal", cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: "auto" },
      5: { textColor: [200, 0, 0], fontStyle: "bold" },
      6: { textColor: [0, 128, 0] },
      7: { textColor: [0, 128, 0] },
      ...(hasMealCard ? { 8: { textColor: [0, 128, 0] } } : {}),
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`KuryeRaporu_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "")}.pdf`);
  toast.success("PDF indirildi");
}

/**
 * Export Restoran Raporu as PDF
 */
export async function exportRestoranRaporuPDF({ reportData, companyLogo, companyName, dateRange, companyId }) {
  if (!reportData?.restaurants?.length) {
    toast.error("İndirilecek veri bulunamadı");
    return;
  }
  const doc = initDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const s = reportData.summary;

  drawHeader(doc, "Restoran Raporu", companyName || "");
  await addCompanyLogo(doc, companyId, pageWidth);

  let currentY = drawDateRange(doc, dateRange?.start, dateRange?.end, 38);

  const summaryText = `Restoran: ${reportData.restaurants.length}  |  Sipariş: ${s?.totalOrders || 0}  |  Sonuç: ${fmt(s?.result || 0)} TL`;
  const tableY = drawSummaryBox(doc, summaryText, currentY);

  const head = [["Restoran", "Sipariş", "Taşıma Ü.", "Taşıma KDV", "Top. Taşıma", "POS Kom.", "Nakit", "Kart", "Y.Kartı", "Online", "Sonuç"]];
  const body = reportData.restaurants.map((r) => {
    const toplamTasima = r.transportFee + r.transportKdv;
    const cashForCalc = r.cash_included !== false ? r.cash : 0;
    const cardForCalc = r.card_included !== false ? r.card : 0;
    const mealCardForCalc = r.meal_card_included !== false ? (r.mealCard || 0) : 0;
    const posForCalc = r.card_included !== false ? r.posCommission : 0;
    const sonuc = (toplamTasima + posForCalc) - (cashForCalc + cardForCalc + mealCardForCalc);
    return [
      r.name,
      r.orderCount,
      r.transportFee.toFixed(2),
      r.transportKdv.toFixed(2),
      toplamTasima.toFixed(2),
      r.posCommission.toFixed(2),
      `${r.cash.toFixed(2)}${r.cash_included === false ? "*" : ""}`,
      `${r.card.toFixed(2)}${r.card_included === false ? "*" : ""}`,
      `${(r.mealCard || 0).toFixed(2)}${r.meal_card_included === false ? "*" : ""}`,
      (r.online || 0).toFixed(2),
      `${sonuc >= 0 ? "+" : ""}${sonuc.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: tableY,
    head,
    body,
    theme: "striped",
    headStyles: { fillColor: [70, 130, 180], textColor: 255, font: "Roboto", fontStyle: "normal", fontSize: 7 },
    styles: { fontSize: 7, font: "Roboto", fontStyle: "normal", cellPadding: 1.5 },
    columnStyles: {
      4: { textColor: [0, 128, 0] },
      5: { textColor: [0, 128, 0] },
      6: { textColor: [200, 0, 0] },
      7: { textColor: [200, 0, 0] },
      8: { textColor: [200, 0, 0] },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 10) {
        const val = parseFloat(data.cell.raw);
        data.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [200, 0, 0];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`RestoranRaporu_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "")}.pdf`);
  toast.success("PDF indirildi");
}

/**
 * Export Ciro Raporu as PDF
 */
export async function exportCiroRaporuPDF({ data, companyLogo, companyName, dateRange, companyId }) {
  if (!data?.restaurants?.length) {
    toast.error("İndirilecek veri bulunamadı");
    return;
  }
  const doc = initDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const s = data.summary;

  drawHeader(doc, "Ciro Raporu", companyName || "");
  await addCompanyLogo(doc, companyId, pageWidth);

  let currentY = drawDateRange(doc, dateRange?.start, dateRange?.end, 38);

  const summaryText = `Sipariş: ${s.total_orders}  |  Toplam Ciro: ${fmt(s.total_revenue)} TL`;
  const tableY = drawSummaryBox(doc, summaryText, currentY);

  const head = [["Restoran", "Sipariş", "Nakit", "Kredi Kartı", "Yemek Kartı", "Online", "Toplam"]];
  const restaurants = data.restaurants.filter((r) => r.order_count > 0);
  const body = restaurants.map((r) => [
    r.name,
    r.order_count,
    fmt(r.cash),
    fmt(r.card),
    fmt(r.meal_card),
    fmt(r.online),
    fmt(r.total),
  ]);

  // Add total row
  body.push([
    "TOPLAM",
    s.total_orders,
    fmt(s.total_cash),
    fmt(s.total_card),
    fmt(s.total_meal_card),
    fmt(s.total_online),
    fmt(s.total_revenue),
  ]);

  autoTable(doc, {
    startY: tableY,
    head,
    body,
    theme: "striped",
    headStyles: { fillColor: [70, 130, 180], textColor: 255, font: "Roboto", fontStyle: "normal" },
    styles: { fontSize: 8, font: "Roboto", fontStyle: "normal", cellPadding: 2 },
    columnStyles: { 6: { fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === restaurants.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [230, 230, 230];
      }
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CiroRaporu_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "")}.pdf`);
  toast.success("PDF indirildi");
}

/**
 * Export Kar/Zarar Raporu as PDF
 */
export async function exportKarZararRaporuPDF({ data, companyLogo, companyName, dateRange, companyId }) {
  if (!data) {
    toast.error("İndirilecek veri bulunamadı");
    return;
  }
  const doc = initDoc();
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, "Kar / Zarar Raporu", companyName || "");
  await addCompanyLogo(doc, companyId, pageWidth);

  let currentY = drawDateRange(doc, dateRange?.start, dateRange?.end, 38);

  const profitLabel = data.profit >= 0 ? `+${fmt(data.profit)}` : fmt(data.profit);
  const summaryText = `Sipariş: ${data.order_count}  |  Kar/Zarar: ${profitLabel} TL`;
  const tableY = drawSummaryBox(doc, summaryText, currentY);

  const head = [["Kalem", "Adet", "Tutar (TL)"]];
  const body = [
    ["Taşıma Ücreti (Gelir)", `${data.order_count} sipariş`, fmt(data.total_revenue)],
    ["Kurye Hakediş (Gider)", `${data.courier_order_count} sipariş`, fmt(data.courier_expense)],
    ["Yönetici Hakediş (Gider)", `${data.admin_order_count} sipariş`, fmt(data.admin_expense)],
    ["KAR / ZARAR", "", profitLabel],
  ];

  autoTable(doc, {
    startY: tableY,
    head,
    body,
    theme: "striped",
    headStyles: { fillColor: [70, 130, 180], textColor: 255, font: "Roboto", fontStyle: "normal" },
    styles: { fontSize: 10, font: "Roboto", fontStyle: "normal", cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 45 },
    },
    didParseCell: (cellData) => {
      if (cellData.section === "body" && cellData.row.index === 3) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.fillColor = data.profit >= 0 ? [220, 252, 231] : [254, 226, 226];
        if (cellData.column.index === 2) {
          cellData.cell.styles.textColor = data.profit >= 0 ? [0, 128, 0] : [200, 0, 0];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Averages section
  const avgY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text("Ortalamalar", 14, avgY);

  autoTable(doc, {
    startY: avgY + 5,
    head: [["", "Tutar (TL)"]],
    body: [
      ["Ortalama Kazanç / Sipariş", fmt(data.avg_revenue_per_order)],
      ["Ortalama Maliyet / Sipariş", fmt(data.avg_cost_per_order)],
      ["Ortalama Kar / Sipariş", `${data.avg_profit_per_order >= 0 ? "+" : ""}${fmt(data.avg_profit_per_order)}`],
    ],
    theme: "grid",
    headStyles: { fillColor: [100, 100, 100], textColor: 255, font: "Roboto", fontStyle: "normal" },
    styles: { fontSize: 9, font: "Roboto", fontStyle: "normal", cellPadding: 3 },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    didParseCell: (cellData) => {
      if (cellData.section === "body" && cellData.row.index === 2 && cellData.column.index === 1) {
        cellData.cell.styles.textColor = data.avg_profit_per_order >= 0 ? [0, 128, 0] : [200, 0, 0];
        cellData.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`KarZararRaporu_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "")}.pdf`);
  toast.success("PDF indirildi");
}

/**
 * Export Performans Raporu as PDF
 */
export async function exportPerformansRaporuPDF({ data, companyLogo, companyName, dateRange, companyId }) {
  if (!data) {
    toast.error("İndirilecek veri bulunamadı");
    return;
  }
  const doc = initDoc();
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, "Performans Raporu", companyName || "");
  await addCompanyLogo(doc, companyId, pageWidth);

  let currentY = drawDateRange(doc, dateRange?.start, dateRange?.end, 38);

  const courierCount = data.couriers?.filter((r) => r.delivery_count > 0).length || 0;
  const summaryText = `Aktif Kurye: ${courierCount}`;
  currentY = drawSummaryBox(doc, summaryText, currentY);

  const perfHead = [["İsim", "Teslimat", "Ort. Süre", "Aktif Saat", "T/Saat", "İhlal", "Mola"]];
  const fmtMin = (m) => {
    if (!m) return "-";
    if (m < 60) return `${Math.round(m)} dk`;
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return r > 0 ? `${h}s ${r}dk` : `${h}s`;
  };

  const buildBody = (list, average, avgLabel) => {
    const sorted = (list || [])
      .filter((r) => r.delivery_count > 0 || r.active_hours > 0)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
    const rows = sorted.map((r) => [
      r.name,
      r.delivery_count,
      r.avg_delivery_minutes > 0 ? `${r.avg_delivery_minutes} dk` : "-",
      r.active_hours > 0 ? `${r.active_hours}s` : "-",
      r.hourly_delivery_avg > 0 ? r.hourly_delivery_avg : "-",
      r.violation_count > 0 ? r.violation_count : "-",
      r.break_minutes > 0 ? fmtMin(r.break_minutes) : "-",
    ]);
    if (average) {
      rows.push([
        avgLabel || "Ortalama",
        average.delivery_count,
        average.avg_delivery_minutes > 0 ? `${average.avg_delivery_minutes} dk` : "-",
        average.active_hours > 0 ? `${average.active_hours}s` : "-",
        average.hourly_delivery_avg > 0 ? average.hourly_delivery_avg : "-",
        average.violation_count > 0 ? average.violation_count : "-",
        average.break_minutes > 0 ? fmtMin(average.break_minutes) : "-",
      ]);
    }
    return { rows, avgIndex: average ? rows.length - 1 : -1 };
  };

  // Courier performance
  const courierData = buildBody(data.couriers, data.courier_average, "Kurye Ortalaması");
  if (courierData.rows.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text("Kurye Performansı", 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: perfHead,
      body: courierData.rows,
      theme: "striped",
      headStyles: { fillColor: [70, 130, 180], textColor: 255, font: "Roboto", fontStyle: "normal" },
      styles: { fontSize: 8, font: "Roboto", fontStyle: "normal", cellPadding: 2 },
      didParseCell: (cellData) => {
        if (cellData.section === "body" && cellData.row.index === courierData.avgIndex) {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.fillColor = [230, 230, 230];
        }
      },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Admin performance
  const adminData = buildBody(data.admins, null, null);
  if (adminData.rows.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text("Yönetici Performansı", 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: perfHead,
      body: adminData.rows,
      theme: "striped",
      headStyles: { fillColor: [100, 116, 139], textColor: 255, font: "Roboto", fontStyle: "normal" },
      styles: { fontSize: 8, font: "Roboto", fontStyle: "normal", cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`PerformansRaporu_${new Date().toLocaleDateString("tr-TR").replace(/\./g, "")}.pdf`);
  toast.success("PDF indirildi");
}
