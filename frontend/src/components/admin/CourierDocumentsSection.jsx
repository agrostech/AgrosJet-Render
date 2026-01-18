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
  X
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Document type order for display
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

// Turkish labels
const DOCUMENT_LABELS = {
  company_contract: "Sözleşme",
  id_front: "Kimlik Ön Yüz",
  id_back: "Kimlik Arka Yüz",
  license_front: "Ehliyet Ön Yüz",
  license_back: "Ehliyet Arka Yüz",
  vehicle_registration: "Araç Ruhsatı",
  criminal_record: "Adli Sicil Kaydı",
  residence_certificate: "İkametgah Belgesi"
};

// PDF types
const PDF_TYPES = ["criminal_record", "residence_certificate"];

export default function CourierDocumentsSection({ courierId, courierName, companyName }) {
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const fetchData = useCallback(async () => {
    if (!courierId) return;
    try {
      const [docsRes, statusRes] = await Promise.all([
        axios.get(`${API}/documents/courier/${courierId}`),
        axios.get(`${API}/documents/courier/${courierId}/status`)
      ]);
      setDocuments(docsRes.data);
      setStatus(statusRes.data);
    } catch (err) {
      console.error("Evraklar yüklenemedi", err);
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (documentId) => {
    if (!window.confirm("Bu evrakı silmek istediğinize emin misiniz?")) return;
    
    setDeleting(documentId);
    try {
      await axios.delete(`${API}/documents/${documentId}`);
      toast.success("Evrak silindi");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(
        `${API}/documents/courier/${courierId}/download-all`,
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from header or generate one
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
      toast.error("İndirme başarısız");
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = (doc) => {
    setPreviewDoc(doc);
  };

  const getDocumentsOfType = (docType) => {
    return documents.filter(d => d.document_type === docType);
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
        
        {documents.length > 0 && (
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
            Toplu İndir (ZIP)
          </Button>
        )}
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
            const label = docType === "company_contract" 
              ? `${companyName} Sözleşme` 
              : DOCUMENT_LABELS[docType];

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
    </div>
  );
}
