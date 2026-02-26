import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Image as ImageIcon,
  FileUp,
  Loader2,
  X
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

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
  company_contract: "Sözleşme", // Will be prefixed with company name
  id_front: "Kimlik Ön Yüz",
  id_back: "Kimlik Arka Yüz",
  license_front: "Ehliyet Ön Yüz",
  license_back: "Ehliyet Arka Yüz",
  vehicle_registration: "Araç Ruhsatı",
  criminal_record: "Adli Sicil Kaydı",
  residence_certificate: "İkametgah Belgesi"
};

// Max counts per type
const MAX_COUNTS = {
  company_contract: 14,
  id_front: 1,
  id_back: 1,
  license_front: 1,
  license_back: 1,
  vehicle_registration: 1,
  criminal_record: 1,
  residence_certificate: 1
};

// PDF types
const PDF_TYPES = ["criminal_record", "residence_certificate"];

export default function CourierEvraklarPage({ courierId, companyId, companyName }) {
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [docsRes, statusRes] = await Promise.all([
        axios.get(`${API}/documents/courier/${courierId}`),
        axios.get(`${API}/documents/courier/${courierId}/status`)
      ]);
      setDocuments(docsRes.data);
      setStatus(statusRes.data);
    } catch (err) {
      console.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) fetchData();
  }, [courierId, fetchData]);

  const handleFileSelect = async (documentType, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isPdf = PDF_TYPES.includes(documentType);
    const validImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const validPdfTypes = ["application/pdf"];
    
    if (isPdf && !validPdfTypes.includes(file.type)) {
      return;
    }
    
    if (!isPdf && !validImageTypes.includes(file.type)) {
      return;
    }

    setUploading(prev => ({ ...prev, [documentType]: true }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_name", companyName);

      await axios.post(
        `${API}/documents/upload/${courierId}/${documentType}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      fetchData();
    } catch (err) {
      console.error("Yükleme başarısız");
    } finally {
      setUploading(prev => ({ ...prev, [documentType]: false }));
      // Reset file input
      event.target.value = "";
    }
  };

  const getDocumentLabel = (docType) => {
    if (docType === "company_contract") {
      return `${companyName} Sözleşme`;
    }
    return DOCUMENT_LABELS[docType];
  };

  const getUploadedCount = (docType) => {
    return documents.filter(d => d.document_type === docType).length;
  };

  const getDocumentsOfType = (docType) => {
    return documents.filter(d => d.document_type === docType);
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="courier-evraklar-page">
      {/* Progress Card */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading font-bold text-xl">Evraklarım</h2>
              <p className="text-sm text-muted-foreground">Gerekli evrakları yükleyin</p>
            </div>
            {status && (
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">%{status.progress_percent}</p>
                <p className="text-xs text-muted-foreground">{status.total_uploaded}/{status.total_required}</p>
              </div>
            )}
          </div>
        </div>
        
        {status && (
          <div className="p-4">
            <Progress value={status.progress_percent} className="h-3" />
            {status.all_complete ? (
              <div className="mt-3 flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Tüm evraklar yüklendi!</span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Tüm evrakları yükledikten sonra bu sekme kapanacaktır.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Document Upload Cards */}
      <div className="grid gap-4">
        {DOCUMENT_ORDER.map((docType) => {
          const maxCount = MAX_COUNTS[docType];
          const uploadedCount = getUploadedCount(docType);
          const isComplete = uploadedCount >= maxCount;
          const isPdf = PDF_TYPES.includes(docType);
          const docsOfType = getDocumentsOfType(docType);
          const isUploading = uploading[docType];

          return (
            <div 
              key={docType} 
              className={`border-2 bg-white transition-colors ${
                isComplete ? 'border-green-300 bg-green-50/50' : 'border-border'
              }`}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isComplete ? 'bg-green-100' : 'bg-slate-100'
                    }`}>
                      {isComplete ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : isPdf ? (
                        <FileText className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{getDocumentLabel(docType)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {isPdf ? "PDF" : "Fotoğraf"} • {uploadedCount}/{maxCount} yüklendi
                      </p>
                    </div>
                  </div>
                  
                  {!isComplete && (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="*/*"
                        onChange={(e) => handleFileSelect(docType, e)}
                        className="hidden"
                        disabled={isUploading}
                        data-testid={`upload-${docType}`}
                      />
                      <Button 
                        asChild 
                        variant="outline" 
                        size="sm" 
                        className="border-2 hover:bg-primary hover:text-white"
                        disabled={isUploading}
                      >
                        <span>
                          {isUploading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {isUploading ? "Yükleniyor..." : "Yükle"}
                        </span>
                      </Button>
                    </label>
                  )}
                </div>

                {/* Uploaded Files Preview */}
                {docsOfType.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex flex-wrap gap-2">
                      {docsOfType.map((doc) => (
                        <div 
                          key={doc.id}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded text-xs"
                        >
                          {isPdf ? (
                            <FileText className="w-3 h-3 text-red-500" />
                          ) : (
                            <ImageIcon className="w-3 h-3 text-blue-500" />
                          )}
                          <span className="max-w-[150px] truncate">{doc.file_name}</span>
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Remaining slots indicator for contract */}
                {docType === "company_contract" && !isComplete && uploadedCount > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    {maxCount - uploadedCount} sayfa daha yüklemeniz gerekiyor
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="border-2 border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Önemli Bilgiler</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Sözleşme için tüm sayfaları ayrı ayrı fotoğraflayarak yükleyin (14 sayfa)</li>
              <li>Kimlik ve ehliyet için ön ve arka yüzleri ayrı yükleyin</li>
              <li>Adli sicil ve ikametgah belgeleri PDF formatında olmalıdır</li>
              <li>Belgeler net ve okunabilir olmalıdır</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
