import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Download, 
  Eye,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  RotateCcw,
  FileDown
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DOCUMENT_ORDER = [
  "company_contract",
  "id_front",
  "id_back",
  "license_front",
  "license_back",
  "vehicle_registration",
  "criminal_record",
  "residence_certificate"
];

const DOCUMENT_LABELS = {
  company_contract: "Kullanıcı Sözleşmesi (E-İmzalı)",
  id_front: "Kimlik Ön Yüz",
  id_back: "Kimlik Arka Yüz",
  license_front: "Ehliyet Ön Yüz",
  license_back: "Ehliyet Arka Yüz",
  vehicle_registration: "Araç Ruhsatı",
  criminal_record: "Adli Sicil Kaydı",
  residence_certificate: "İkametgah Belgesi"
};

const PDF_TYPES = ["criminal_record", "residence_certificate", "company_contract"];

export default function CourierDocumentsSection({ courierId, courierName, companyName }) {
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState(null);
  const [contractStatus, setContractStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingReset, setPendingReset] = useState(null);
  
  // Onay kodu state'leri
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [codeVerifying, setCodeVerifying] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");

  const fetchData = useCallback(async () => {
    if (!courierId) return;
    try {
      const [docsRes, statusRes, contractRes] = await Promise.all([
        axios.get(`${API}/documents/courier/${courierId}`),
        axios.get(`${API}/documents/courier/${courierId}/status`),
        axios.get(`${API}/contracts/status/${courierId}`)
      ]);
      setDocuments(docsRes.data);
      setStatus(statusRes.data);
      setContractStatus(contractRes.data);
    } catch (err) {
      console.error("Evraklar yuklenemedi", err);
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (documentId) => {
    setPendingDeleteId(documentId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(pendingDeleteId);
    try {
      await axios.delete(`${API}/documents/${pendingDeleteId}`);
      toast.success("Evrak silindi");
      fetchData();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Silme başarısız");
      }
    } finally {
      setDeleting(null);
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(
        `${API}/documents/courier/${courierId}/download-all`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${courierName.replace(/\s+/g, '_')}_Evraklar.zip`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("İndirme başladı");
    } catch (err) {
      if (!err.handled) {
        toast.error("İndirme başarısız");
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadMergedPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await axios.get(
        `${API}/documents/courier/${courierId}/download-merged-pdf`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${courierName.replace(/\s+/g, '_')}_Tum_Evraklar.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF indirme başladı");
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "PDF oluşturulamadı");
      }
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleResetRequest = (type) => {
    setPendingReset(type);
    setResetConfirmOpen(true);
  };

  const confirmReset = async () => {
    if (!pendingReset) return;
    setResetConfirmOpen(false);
    setCodeSending(true);
    try {
      const res = await axios.post(
        `${API}/contracts/reset-request/${courierId}?reset_type=${pendingReset}`
      );
      setMaskedEmail(res.data.masked_email || "");
      setResetCode("");
      setCodeModalOpen(true);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onay kodu gönderilemedi");
    } finally {
      setCodeSending(false);
    }
  };

  const handleCodeVerify = async () => {
    if (!resetCode || resetCode.length !== 6) {
      toast.error("6 haneli onay kodunu girin");
      return;
    }
    setCodeVerifying(true);
    try {
      const res = await axios.post(`${API}/contracts/reset-confirm/${courierId}`, {
        code: resetCode,
        reset_type: pendingReset
      });
      toast.success(res.data.message);
      setCodeModalOpen(false);
      setResetCode("");
      setPendingReset(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Doğrulama başarısız");
    } finally {
      setCodeVerifying(false);
    }
  };

  const handlePreview = (doc) => {
    setPreviewDoc(doc);
  };

  const handleViewContractPdf = async () => {
    try {
      const token = JSON.parse(localStorage.getItem("user") || "{}").token;
      const res = await fetch(`${API}/contracts/pdf/${courierId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("PDF alinamadi");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      toast.error("Sözleşme PDF'i açılamadı");
    }
  };

  const getDocumentsOfType = (docType) => {
    return documents.filter(d => d.document_type === docType);
  };

  const resetLabels = {
    contract: "Sözleşme süreci sıfırlanacak. Kurye sözleşmeyi tekrar imzalamak zorunda kalacak.",
    fesih: "Fesih onayı sıfırlanacak. Kurye fesih şartlarını tekrar kabul etmek zorunda kalacak.",
    documents: "Tüm yüklenmiş evraklar silinecek (sözleşme hariç). Kurye evrakları tekrar yüklemek zorunda kalacak."
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-documents-section">
      {/* Contract & Fesih Status */}
      {contractStatus && (
        <div className="border-2 border-border rounded-lg p-3 space-y-2 bg-slate-50">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sözleşme Durumu</h4>
          <div className="grid grid-cols-1 gap-2">
            {/* Contract Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {contractStatus.accepted ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm">
                  Sözleşme: <strong className={contractStatus.accepted ? "text-green-600" : "text-amber-600"}>
                    {contractStatus.accepted ? "Onaylı" : "Bekliyor"}
                  </strong>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleResetRequest("contract")}
                disabled={codeSending}
                data-testid="reset-contract-btn"
              >
                {codeSending && pendingReset === "contract" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                Sıfırla
              </Button>
            </div>

            {/* Fesih Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {contractStatus.fesih_accepted ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm">
                  Fesih Şartları: <strong className={contractStatus.fesih_accepted ? "text-green-600" : "text-amber-600"}>
                    {contractStatus.fesih_accepted ? "Kabul Edildi" : "Bekliyor"}
                  </strong>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleResetRequest("fesih")}
                disabled={codeSending}
                data-testid="reset-fesih-btn"
              >
                {codeSending && pendingReset === "fesih" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                Sıfırla
              </Button>
            </div>
          </div>

          {/* Contract PDF button */}
          {contractStatus.accepted && contractStatus.contract?.r2_key && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-2 mt-2"
              onClick={handleViewContractPdf}
              data-testid="view-contract-pdf-admin"
            >
              <FileText className="w-4 h-4 mr-2" />
              E-İmzalı Sözleşme PDF Görüntüle
            </Button>
          )}
        </div>
      )}

      {/* Header with Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">Evraklar</h3>
            {status && (
              <p className="text-xs text-muted-foreground">
                {status.total_uploaded}/{status.total_required} evrak yüklendi
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadMergedPdf}
                disabled={downloadingPdf}
                className="border-2 hover:bg-primary hover:text-white"
                data-testid="download-merged-pdf"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Tek PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadAll}
                disabled={downloading}
                className="border-2 hover:bg-primary hover:text-white"
                data-testid="download-all-documents"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                ZIP
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {status && (
        <div>
          <Progress value={status.progress_percent} className="h-2" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              %{status.progress_percent} tamamlandı
            </span>
            {status.all_complete ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Tamamlandı
              </span>
            ) : (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Eksik evrak var
              </span>
            )}
          </div>
        </div>
      )}

      {/* Reset Documents Button */}
      {documents.filter(d => d.document_type !== "company_contract").length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => handleResetRequest("documents")}
            disabled={codeSending}
            data-testid="reset-documents-btn"
          >
            {codeSending && pendingReset === "documents" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
            Evrakları Sıfırla
          </Button>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Henüz evrak yüklenmemiş</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {DOCUMENT_ORDER.map((docType) => {
            const docsOfType = getDocumentsOfType(docType);
            if (docsOfType.length === 0) return null;
            
            const isPdf = PDF_TYPES.includes(docType);
            const label = DOCUMENT_LABELS[docType] || docType;

            return (
              <div key={docType} className="border rounded-lg p-3 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  {isPdf ? (
                    <FileText className="w-4 h-4 text-red-500" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                  )}
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">({docsOfType.length})</span>
                </div>
                
                <div className="space-y-1">
                  {docsOfType.map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between py-1.5 px-2 bg-white rounded border text-xs"
                    >
                      <span className="truncate max-w-[200px]" title={doc.file_name}>
                        {doc.file_name}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => handlePreview(doc)}
                          title="Görüntüle"
                          data-testid={`view-doc-${doc.id}`}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          title="Sil"
                          data-testid={`delete-doc-${doc.id}`}
                        >
                          {deleting === doc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{previewDoc?.file_name}</span>
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="flex items-center justify-center bg-slate-100 rounded-lg overflow-hidden">
              {previewDoc.file_extension === ".pdf" ? (
                <iframe
                  src={`${API}/documents/view/${previewDoc.id}`}
                  className="w-full h-[70vh]"
                  title={previewDoc.file_name}
                />
              ) : (
                <img
                  src={`${API}/documents/view/${previewDoc.id}`}
                  alt={previewDoc.file_name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Evrak Silme"
        description="Bu evrakı silmek istediğinize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <ConfirmModal
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={
          pendingReset === "contract" ? "Sözleşme Sıfırlama" :
          pendingReset === "fesih" ? "Fesih Onayı Sıfırlama" :
          "Evrakları Sıfırlama"
        }
        description={resetLabels[pendingReset] || ""}
        onConfirm={confirmReset}
        variant="danger"
      />

      {/* Onay Kodu Modalı */}
      <Dialog open={codeModalOpen} onOpenChange={(open) => { if (!open) { setCodeModalOpen(false); setResetCode(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Onay Kodu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Superadmin e-postasına ({maskedEmail}) 6 haneli onay kodu gönderildi. Kodu girerek işlemi onaylayın.
            </p>
            <div className="flex justify-center">
              <input
                type="text"
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                className="w-48 text-center text-2xl font-bold tracking-[0.5em] border-2 border-border rounded-lg py-3 focus:outline-none focus:border-primary"
                placeholder="------"
                autoFocus
                data-testid="reset-code-input"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Kod 5 dakika geçerlidir
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setCodeModalOpen(false); setResetCode(""); }}
              >
                İptal
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCodeVerify}
                disabled={codeVerifying || resetCode.length !== 6}
                data-testid="verify-reset-code-btn"
              >
                {codeVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Onayla
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
