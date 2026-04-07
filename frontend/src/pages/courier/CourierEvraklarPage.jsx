import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Image as ImageIcon,
  Loader2,
  PenTool,
  ScrollText,
  ChevronDown,
  RotateCcw,
  Check,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Belge türleri (sözleşme hariç - o artık otomatik)
const DOCUMENT_ORDER = [
  "id_front",
  "id_back",
  "license_front",
  "license_back",
  "vehicle_registration",
  "criminal_record",
  "residence_certificate"
];

const DOCUMENT_LABELS = {
  id_front: "Kimlik On Yuz",
  id_back: "Kimlik Arka Yuz",
  license_front: "Ehliyet On Yuz",
  license_back: "Ehliyet Arka Yuz",
  vehicle_registration: "Arac Ruhsati",
  criminal_record: "Adli Sicil Kaydi",
  residence_certificate: "Ikametgah Belgesi"
};

const MAX_COUNTS = {
  id_front: 1,
  id_back: 1,
  license_front: 1,
  license_back: 1,
  vehicle_registration: 1,
  criminal_record: 1,
  residence_certificate: 1
};

const PDF_TYPES = ["criminal_record", "residence_certificate"];

// ==================== STEP 1: Sozlesme ====================
function ContractStep({ courierId, onComplete }) {
  const [contractText, setContractText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [signatureProvided, setSignatureProvided] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noContract, setNoContract] = useState(false);
  const contractRef = useRef(null);
  const sigCanvasRef = useRef(null);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        const res = await axios.get(`${API}/contracts/preview/${courierId}`);
        setContractText(res.data.text);
        setCompanyName(res.data.company_name);
      } catch (err) {
        if (err.response?.status === 400) {
          setNoContract(true);
        } else {
          toast.error("Sozlesme yuklenemedi");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchContract();
  }, [courierId]);

  const handleScroll = () => {
    const el = contractRef.current;
    if (!el) return;
    const threshold = 30;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    if (atBottom && !scrolledToBottom) {
      setScrolledToBottom(true);
    }
  };

  const handleClearSignature = () => {
    sigCanvasRef.current?.clear();
    setSignatureProvided(false);
  };

  const handleSignatureEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      setSignatureProvided(true);
    }
  };

  const handleAccept = async () => {
    if (!scrolledToBottom || !signatureProvided) return;
    
    const signatureBase64 = sigCanvasRef.current.toDataURL("image/png");
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/contracts/accept/${courierId}`, {
        signature_base64: signatureBase64,
        tc_kimlik: "" // TC zaten kayit sirasinda alindi
      });
      toast.success("Sozlesme onaylandi!");
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sozlesme onaylanamadi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading />;

  if (noContract) {
    return (
      <div className="max-w-2xl mx-auto" data-testid="contract-not-configured">
        <div className="border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h3 className="font-bold text-lg mb-2">Sozlesme Ayarlari Yapilandirilmamis</h3>
          <p className="text-sm text-muted-foreground">
            Sirket yoneticiniz henuz sozlesme ayarlarini tamamlamamis. Lutfen yoneticinizle iletisime gecin.
          </p>
        </div>
      </div>
    );
  }

  const canAccept = scrolledToBottom && signatureProvided;

  return (
    <div className="max-w-2xl mx-auto space-y-4" data-testid="contract-step">
      {/* Baslik */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50">
            <ScrollText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Kullanici Sozlesmesi</h2>
            <p className="text-sm text-muted-foreground">{companyName}</p>
          </div>
        </div>
      </div>

      {/* Sozlesme Metni - Scrollable */}
      <div className="border-2 border-border bg-white">
        <div 
          ref={contractRef}
          onScroll={handleScroll}
          className="p-4 md:p-6 max-h-[400px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-serif"
          data-testid="contract-scroll-area"
        >
          {contractText}
        </div>
        
        {/* Scroll indicator */}
        {!scrolledToBottom && (
          <div className="flex items-center justify-center gap-2 py-3 bg-slate-50 border-t border-border text-sm text-muted-foreground animate-pulse">
            <ChevronDown className="w-4 h-4" />
            <span>Sozlesmeyi sonuna kadar okuyun</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        )}
        {scrolledToBottom && (
          <div className="flex items-center justify-center gap-2 py-3 bg-green-50 border-t border-green-200 text-sm text-green-700">
            <Check className="w-4 h-4" />
            <span>Sozlesme okundu</span>
          </div>
        )}
      </div>

      {/* E-Imza Alani */}
      <div className={`border-2 bg-white transition-opacity ${scrolledToBottom ? 'opacity-100 border-border' : 'opacity-40 pointer-events-none border-slate-200'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50">
                <PenTool className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">E-Imza</h3>
                <p className="text-xs text-muted-foreground">Asagidaki alana imzanizi atin</p>
              </div>
            </div>
            {signatureProvided && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearSignature}
                data-testid="clear-signature-btn"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Temizle
              </Button>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50" data-testid="signature-canvas-wrapper">
            <SignatureCanvas
              ref={sigCanvasRef}
              canvasProps={{
                className: "w-full",
                style: { width: "100%", height: "180px" },
                "data-testid": "signature-canvas"
              }}
              onEnd={handleSignatureEnd}
              penColor="#1e293b"
              minWidth={1.5}
              maxWidth={3}
            />
          </div>
          {!signatureProvided && scrolledToBottom && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Imzanizi yukaridaki beyaz alana cizin
            </p>
          )}
        </div>
      </div>

      {/* Onayla Butonu */}
      <Button
        onClick={handleAccept}
        disabled={!canAccept || submitting}
        className="w-full h-14 text-base font-bold"
        data-testid="accept-contract-btn"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Sozlesme Onaylaniyor...
          </>
        ) : (
          <>
            <Check className="w-5 h-5 mr-2" />
            Sozlesmeyi Okudum ve Kabul Ediyorum
          </>
        )}
      </Button>
    </div>
  );
}

// ==================== STEP 2: Belge Yukleme ====================
function DocumentUploadStep({ courierId, companyId, companyName }) {
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
      console.error("Veriler yuklenemedi");
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

    const isPdf = PDF_TYPES.includes(documentType);
    const validImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const validPdfTypes = ["application/pdf"];
    
    if (isPdf && !validPdfTypes.includes(file.type)) {
      toast.error("Bu belge icin PDF formati gereklidir");
      return;
    }
    
    if (!isPdf && !validImageTypes.includes(file.type)) {
      toast.error("Lutfen bir fotograf yukleyin (JPEG, PNG)");
      return;
    }

    setUploading(prev => ({ ...prev, [documentType]: true }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_name", companyName || "Genel");

      await axios.post(
        `${API}/documents/upload/${courierId}/${documentType}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      toast.success("Belge yuklendi");
      fetchData();
    } catch (err) {
      toast.error("Yukleme basarisiz");
    } finally {
      setUploading(prev => ({ ...prev, [documentType]: false }));
      event.target.value = "";
    }
  };

  const getUploadedCount = (docType) => {
    return documents.filter(d => d.document_type === docType).length;
  };

  const getDocumentsOfType = (docType) => {
    return documents.filter(d => d.document_type === docType);
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4 max-w-2xl mx-auto" data-testid="document-upload-step">
      {/* Progress */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading font-bold text-xl">Evrak Yukleme</h2>
              <p className="text-sm text-muted-foreground">Gerekli evraklari yukleyin</p>
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
            {status.all_complete && (
              <div className="mt-3 flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Tum evraklar yuklendi!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sozlesme tamamlandi bildirimi */}
      <div className="border-2 border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Kullanici Sozlesmesi Onaylandi</p>
            <p className="text-xs text-green-600">E-imzali sozlesmeniz kaydedildi</p>
          </div>
        </div>
      </div>

      {/* Belge Kartlari */}
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
                      <h3 className="font-semibold">{DOCUMENT_LABELS[docType]}</h3>
                      <p className="text-xs text-muted-foreground">
                        {isPdf ? "PDF" : "Fotograf"} - {uploadedCount}/{maxCount} yuklendi
                      </p>
                    </div>
                  </div>
                  
                  {!isComplete && (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept={isPdf ? ".pdf" : "image/*"}
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
                          {isUploading ? "Yukleniyor..." : "Yukle"}
                        </span>
                      </Button>
                    </label>
                  )}
                </div>

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
              </div>
            </div>
          );
        })}
      </div>

      {/* Bilgi Kutusu */}
      <div className="border-2 border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Onemli Bilgiler</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Kimlik ve ehliyet icin on ve arka yuzleri ayri yukleyin</li>
              <li>Adli sicil ve ikametgah belgeleri PDF formatinda olmalidir</li>
              <li>Belgeler net ve okunabilir olmalidir</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== ANA SAYFA ====================
export default function CourierEvraklarPage({ courierId, companyId, companyName }) {
  const [contractAccepted, setContractAccepted] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkContractStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/contracts/status/${courierId}`);
      setContractAccepted(res.data.accepted);
    } catch (err) {
      // Hata durumunda false kabul et
      setContractAccepted(false);
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) checkContractStatus();
  }, [courierId, checkContractStatus]);

  if (loading) return <PageLoading />;

  // Sozlesme henuz kabul edilmediyse Step 1 goster
  if (!contractAccepted) {
    return (
      <ContractStep 
        courierId={courierId} 
        onComplete={() => setContractAccepted(true)} 
      />
    );
  }

  // Sozlesme kabul edildiyse belge yukleme goster
  return (
    <DocumentUploadStep 
      courierId={courierId} 
      companyId={companyId}
      companyName={companyName}
    />
  );
}
