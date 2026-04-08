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
  company_contract: "Kullanici Sozlesmesi (E-Imzali)",
  id_front: "Kimlik On Yuz",
  id_back: "Kimlik Arka Yuz",
  license_front: "Ehliyet On Yuz",
  license_back: "Ehliyet Arka Yuz",
  vehicle_registration: "Arac Ruhsati",
  criminal_record: "Adli Sicil Kaydi",
  residence_certificate: "Ikametgah Belgesi"
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
  const [resetting, setResetting] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingReset, setPendingReset] = useState(null);

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
        toast.error(err.response?.data?.detail || "Silme basarisiz");
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
      toast.success("Indirme basladi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Indirme basarisiz");
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
      toast.success("PDF indirme basladi");
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "PDF olusturulamadi");
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
    setResetting(pendingReset);
    try {
      let endpoint;
      if (pendingReset === "contract") {
        endpoint = `${API}/contracts/reset-contract/${courierId}`;
      } else if (pendingReset === "fesih") {
        endpoint = `${API}/contracts/reset-fesih/${courierId}`;
      } else {
        endpoint = `${API}/contracts/reset-documents/${courierId}`;
      }
      await axios.post(endpoint);
      toast.success(
        pendingReset === "contract" ? "Sozlesme sifirlandi" :
        pendingReset === "fesih" ? "Fesih onayi sifirlandi" :
        "Evraklar sifirlandi"
      );
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sifirlama basarisiz");
    } finally {
      setResetting(null);
      setResetConfirmOpen(false);
      setPendingReset(null);
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
      toast.error("Sozlesme PDF'i acilamadi");
    }
  };

  const getDocumentsOfType = (docType) => {
    return documents.filter(d => d.document_type === docType);
  };

  const resetLabels = {
    contract: "Sozlesme sureci sifirlanacak. Kurye sozlesmeyi tekrar imzalamak zorunda kalacak.",
    fesih: "Fesih onayi sifirlanacak. Kurye fesih sartlarini tekrar kabul etmek zorunda kalacak.",
    documents: "Tum yuklenmis evraklar silinecek (sozlesme haric). Kurye evraklari tekrar yuklemek zorunda kalacak."
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
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sozlesme Durumu</h4>
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
                  Sozlesme: <strong className={contractStatus.accepted ? "text-green-600" : "text-amber-600"}>
                    {contractStatus.accepted ? "Onayli" : "Bekliyor"}
                  </strong>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleResetRequest("contract")}
                disabled={resetting === "contract"}
                data-testid="reset-contract-btn"
              >
                {resetting === "contract" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                Sifirla
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
                  Fesih Sartlari: <strong className={contractStatus.fesih_accepted ? "text-green-600" : "text-amber-600"}>
                    {contractStatus.fesih_accepted ? "Kabul Edildi" : "Bekliyor"}
                  </strong>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleResetRequest("fesih")}
                disabled={resetting === "fesih"}
                data-testid="reset-fesih-btn"
              >
                {resetting === "fesih" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                Sifirla
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
              E-Imzali Sozlesme PDF Goruntule
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
                {status.total_uploaded}/{status.total_required} evrak yuklendi
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
              %{status.progress_percent} tamamlandi
            </span>
            {status.all_complete ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Tamamlandi
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
            disabled={resetting === "documents"}
            data-testid="reset-documents-btn"
          >
            {resetting === "documents" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
            Evraklari Sifirla
          </Button>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Henuz evrak yuklenmemis</p>
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
                          title="Goruntule"
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
        description="Bu evraki silmek istediginize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <ConfirmModal
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={
          pendingReset === "contract" ? "Sozlesme Sifirlama" :
          pendingReset === "fesih" ? "Fesih Onayi Sifirlama" :
          "Evraklari Sifirlama"
        }
        description={resetLabels[pendingReset] || ""}
        onConfirm={confirmReset}
        variant="danger"
      />
    </div>
  );
}
