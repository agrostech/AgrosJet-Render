# AgrosJet Delivery Management System - PRD

## Original Problem Statement
Full-stack delivery management application with mobile responsiveness, admin panel features, and various integrations (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, etc.).

## Core Architecture
- **Frontend:** React (Vite) + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI + MongoDB
- **Integrations:** Firebase FCM, Leaflet Maps, Recharts, jsPDF

## What's Been Implemented

### Session - March 14, 2026 (continued)
- **Bulk Invoice Download: ZIP to Merged PDF:** Changed both courier and restaurant invoice bulk download from ZIP to single multi-page PDF.
  - Backend: `invoices.py` `/download-bulk` and `restaurant_invoices.py` `/download-zip` now use `pypdf` + `Pillow` to merge PDFs and convert images to PDF pages.
  - Frontend: `useFaturalar.js` `downloadBulk()` and `IsletmeFaturalariTab.jsx` `handleDownloadBulk()` updated to handle PDF responses.
- **PDF Cover Page & Page Numbers:** Added professional cover page (company logo, title, month, invoice count, date) and page numbers ("Sayfa X / Y" at bottom-right) to merged PDFs using `reportlab`. New utility: `backend/utils/pdf_utils.py`. Fixed Turkish character issue with Liberation Sans TTF fonts.
- **Loading Toast:** Both download flows now show "PDF birleştiriliyor..." spinner toast during processing.
- **Superadmin Mütabakat Reset:** Superadmin can now reset admin balances even without a linked courier account. Backend skips the linked courier check when `is_super_admin=True`.
- **Report PDF Export (All 5 Tabs):** Added PDF download button to all report sub-tabs:
  - Kurye Raporu, Restoran Raporu, Ciro Raporu, Kar/Zarar Raporu, Performans Raporu
  - Shared utility: `frontend/src/utils/reportPdfExport.js` using jsPDF + autoTable + Roboto font
  - Same design as accounting transaction PDF: logo, header, summary box, styled table, page numbers, footer
- **Receipt/Ticket Redesign:** Complete 58mm/80mm receipt overhaul with Turkish encoding fix.
- **Logo Image Cropping:** Pillow-based whitespace cropping for logo files.
- **Map Theme Bug Fix:** Leaflet tile layer now updates on dark/light theme switch.
- **Shift Tabs Redesign:** Modern card-based UI for VardiyaPage.
- **Print Preview:** Restaurant order cards now open preview instead of printing directly.
- **PDF Logo Fix:** Changed `companyLogo` prop to use `logo_light` for PDF exports.

### Previous Sessions (Completed)
- Mobile responsiveness: Reports, Restaurants, Couriers, System pages
- Shift Management: Redesigned from modals to tab-based UI
- Company Impersonation: Super-admin can log into company panels via iframe
- Firebase Logs: Fixed missing notification logs
- Order Cards: Compact redesign
- System Dashboard: Collapsible sidebar, impersonation feature
- Courier/Credit UI improvements

## Known Issues
- **Migros Webhook Logic (P0 - User deferred):** `is_test` parameter incorrectly parsed, `migros_status` not updated to "Approved", corrupt data in DB
- **Push Notification System:** User verification pending (orders_v6 channel)

## Backlog (Prioritized)
### P1
- Stop Count based capacity logic
- Restaurant-based revenue report
- Cancellation analysis report
- `restaurant_fee` calculation on order creation
- Refactor scheduled jobs (Haftalik Hakedis, Restoran Mutabakat)

### P2
- Caller ID integration
- Additional courier permissions
- `dispatch_decision` function review
- API request monitor in admin panel
- Native Courier App

### P0 (Large Feature - Future)
- Restaurant Courier System

## Credentials
- System Admin: `AgrosJetSystem` / `Delivery32..`
- Company Admin: `admin` / `123456`
