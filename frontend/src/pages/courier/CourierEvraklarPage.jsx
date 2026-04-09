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
  id_front: "Kimlik Ön Yüz",
  id_back: "Kimlik Arka Yüz",
  license_front: "Ehliyet Ön Yüz",
  license_back: "Ehliyet Arka Yüz",
  vehicle_registration: "Araç Ruhsatı",
  criminal_record: "Adli Sicil Kaydı",
  residence_certificate: "İkametgah Belgesi"
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

// ==================== STEP 1: Sözleşme ====================
function ContractStep({ courierId, onComplete }) {
  const [contractText, setContractText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fesihData, setFesihData] = useState(null);
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
        if (res.data.fesih) setFesihData(res.data.fesih);
      } catch (err) {
        if (err.response?.status === 400) {
          setNoContract(true);
        } else {
          toast.error("Sözleşme yüklenemedi");
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
    
    // getTrimmedCanvas ile boşlukları kırp - imza daha net gözükür
    const trimmedCanvas = sigCanvasRef.current.getTrimmedCanvas();
    const signatureBase64 = trimmedCanvas.toDataURL("image/png");
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/contracts/accept/${courierId}`, {
        signature_base64: signatureBase64,
        tc_kimlik: ""
      });
      toast.success("Sözleşme onaylandı!");
      onComplete(fesihData);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sözleşme onaylanamadı");
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
          <h3 className="font-bold text-lg mb-2">Sözleşme Ayarları Yapılandırılmamış</h3>
          <p className="text-sm text-muted-foreground">
            Şirket yöneticiniz henüz sözleşme ayarlarını tamamlamamış. Lütfen yöneticinizle iletişime geçin.
          </p>
        </div>
      </div>
    );
  }

  const canAccept = scrolledToBottom && signatureProvided;

  return (
    <div className="max-w-2xl mx-auto space-y-4" data-testid="contract-step">
      {/* Başlık */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50">
            <ScrollText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Kullanıcı Sözleşmesi</h2>
            <p className="text-sm text-muted-foreground">{companyName}</p>
          </div>
        </div>
      </div>

      {/* Sözleşme Metni - Scrollable */}
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
            <span>Sözleşmeyi sonuna kadar okuyun</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        )}
        {scrolledToBottom && (
          <div className="flex items-center justify-center gap-2 py-3 bg-green-50 border-t border-green-200 text-sm text-green-700">
            <Check className="w-4 h-4" />
            <span>Sözleşme okundu</span>
          </div>
        )}
      </div>

      {/* E-İmza Alanı */}
      <div className={`border-2 bg-white transition-opacity ${scrolledToBottom ? 'opacity-100 border-border' : 'opacity-40 pointer-events-none border-slate-200'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50">
                <PenTool className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">E-İmza</h3>
                <p className="text-xs text-muted-foreground">Aşağıdaki alana imzanızı atın</p>
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
              İmzanızı yukarıdaki beyaz alana çizin
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
            Sözleşme Onaylanıyor...
          </>
        ) : (
          <>
            <Check className="w-5 h-5 mr-2" />
            Sözleşmeyi Okudum ve Kabul Ediyorum
          </>
        )}
      </Button>
    </div>
  );
}

// ==================== STEP 2: Fesih Şartları ====================
function FesihStep({ courierId, fesihData, onComplete }) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const bildirimSuresi = fesihData?.bildirim_suresi || "15";
  const bildirimTelefon = fesihData?.bildirim_telefon || "";
  const tazminat = fesihData?.tazminat || "";
  const sirketAdi = fesihData?.sirket_adi || "";
  const yetkiliMahkeme = fesihData?.yetkili_mahkeme || "";

  const handleAccept = async () => {
    if (!checked) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/contracts/fesih-accept/${courierId}`);
      toast.success("Fesih şartları kabul edildi");
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4" data-testid="fesih-step">
      {/* Başlık */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Sözleşme Fesih Bildirimi ve Şartları</h2>
            <p className="text-sm text-muted-foreground">Lütfen aşağıdaki şartları dikkatlice okuyun</p>
          </div>
        </div>
      </div>

      {/* Fesih Maddeleri */}
      <div className="border-2 border-border bg-white">
        <div className="p-5 space-y-5">
          {/* Madde 1 */}
          <div className="flex gap-3" data-testid="fesih-madde-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-bold text-sm flex-shrink-0 mt-0.5">1</div>
            <div>
              <h4 className="font-semibold text-base mb-1">Fesih Bildirimi Zorunluluğu</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                İşbu sözleşmenin feshedilmek istenmesi halinde, fesih talebinizi en az <strong className="text-red-700">{bildirimSuresi} ({bildirimSuresi === "15" ? "on beş" : bildirimSuresi}) gün</strong> öncesinden bildirmeniz gerekmektedir.
              </p>
            </div>
          </div>

          {/* Madde 2 */}
          <div className="flex gap-3" data-testid="fesih-madde-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-bold text-sm flex-shrink-0 mt-0.5">2</div>
            <div>
              <h4 className="font-semibold text-base mb-1">Bildirim Usulü</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                Fesih bildirimi, <strong className="text-red-700">{bildirimTelefon}</strong> numaralı telefona <strong>yazılı SMS</strong> gönderilmek suretiyle yapılmalıdır. Telefon araması, e-posta veya sözlü bildirim geçerli fesih usulü olarak kabul edilmez.
              </p>
            </div>
          </div>

          {/* Madde 3 */}
          <div className="flex gap-3" data-testid="fesih-madde-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-bold text-sm flex-shrink-0 mt-0.5">3</div>
            <div>
              <h4 className="font-semibold text-base mb-1">Erken Fesih Bedeli</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                Belirtilen süre ve usule uygun şekilde fesih bildirimi yapılmaması halinde, <strong className="text-red-700">{tazminat}</strong> tutarında erken fesih bedelini ödemeyi peşinen kabul, beyan ve taahhüt etmiş sayılırsınız.
              </p>
            </div>
          </div>

          {/* Madde 4 */}
          <div className="flex gap-3" data-testid="fesih-madde-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-bold text-sm flex-shrink-0 mt-0.5">4</div>
            <div>
              <h4 className="font-semibold text-base mb-1">İş Sahibinin Fesih Hakkı</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                {sirketAdi}, sözleşme şartlarına uyulmaması, platform kurallarının ihlali veya hizmet kalitesinin düşük bulunması halinde sözleşmeyi <strong>tek taraflı ve derhal</strong> feshetme hakkına sahiptir. Bu durumda erken fesih bedeli talep edilmez.
              </p>
            </div>
          </div>

          {/* Madde 5 */}
          <div className="flex gap-3" data-testid="fesih-madde-5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-bold text-sm flex-shrink-0 mt-0.5">5</div>
            <div>
              <h4 className="font-semibold text-base mb-1">Uyuşmazlık Çözümü</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                İşbu fesih şartlarından doğan her türlü uyuşmazlıkta <strong className="text-red-700">{yetkiliMahkeme} Mahkemeleri ve İcra Daireleri</strong> yetkilidir.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Onay Checkbox */}
      <div className={`border-2 bg-white p-4 transition-all ${checked ? 'border-green-300 bg-green-50/50' : 'border-border'}`}>
        <label className="flex items-start gap-3 cursor-pointer" data-testid="fesih-checkbox-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-2 border-slate-300 accent-red-600"
            data-testid="fesih-checkbox"
          />
          <span className="text-sm leading-relaxed">
            Yukarıdaki fesih şartlarını okudum, anlıyorum ve kabul ediyorum. Sözleşmenin feshinde <strong>{bildirimSuresi} gün önceden {bildirimTelefon} numarasına yazılı SMS ile bildirim yapmam gerektiğini</strong> ve bunu yapmamam halinde <strong>{tazminat} erken fesih bedeli ödemem gerekeceğini</strong> biliyorum.
          </span>
        </label>
      </div>

      {/* Kabul Butonu */}
      <Button
        onClick={handleAccept}
        disabled={!checked || submitting}
        className="w-full h-14 text-base font-bold bg-red-600 hover:bg-red-700"
        data-testid="accept-fesih-btn"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Kaydediliyor...
          </>
        ) : (
          <>
            <Check className="w-5 h-5 mr-2" />
            Fesih Şartlarını Kabul Ediyorum
          </>
        )}
      </Button>
    </div>
  );
}

// ==================== STEP 3: Belge Yükleme ====================
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

    const isPdf = PDF_TYPES.includes(documentType);
    const validImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const validPdfTypes = ["application/pdf"];
    
    if (isPdf && !validPdfTypes.includes(file.type)) {
      toast.error("Bu belge için PDF formatı gereklidir");
      return;
    }
    
    if (!isPdf && !validImageTypes.includes(file.type)) {
      toast.error("Lütfen bir fotoğraf yükleyin (JPEG, PNG)");
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

      toast.success("Belge yüklendi");
      fetchData();
    } catch (err) {
      toast.error("Yükleme başarısız");
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

  // Tüm süreç tamamlandıysa başarı mesajı göster
  if (status?.all_complete) {
    return (
      <div className="max-w-2xl mx-auto space-y-4" data-testid="documents-complete">
        <div className="border-2 border-green-300 bg-green-50 p-6 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="font-heading font-bold text-2xl text-green-800 mb-2">Evrak Süreciniz Tamamlandı</h2>
          <p className="text-sm text-green-700 mb-1">Kullanıcı sözleşmeniz onaylandı ve tüm evraklarınız yüklendi.</p>
          <p className="text-xs text-green-600">Evraklarınız incelendikten sonra hesabınız aktif edilecektir.</p>
        </div>

        <div className="border-2 border-border bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-sm">Tamamlanan Adımlar</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check className="w-4 h-4" />
              <span>Kullanıcı Sözleşmesi onaylandı</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check className="w-4 h-4" />
              <span>Fesih şartları kabul edildi</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Check className="w-4 h-4" />
              <span>Tüm evraklar yüklendi ({status.total_uploaded}/{status.total_required})</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              <h2 className="font-heading font-bold text-xl">Evrak Yükleme</h2>
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
            {status.all_complete && (
              <div className="mt-3 flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Tüm evraklar yüklendi!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sözleşme tamamlandı bildirimi */}
      <div className="border-2 border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Kullanıcı Sözleşmesi Onaylandı</p>
            <p className="text-xs text-green-600">E-imzalı sözleşmeniz kaydedildi</p>
          </div>
        </div>
      </div>

      {/* Belge Kartları */}
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
                        {isPdf ? "PDF" : "Fotoğraf"} - {uploadedCount}/{maxCount} yüklendi
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
                          {isUploading ? "Yükleniyor..." : "Yükle"}
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
            <p className="font-semibold mb-1">Önemli Bilgiler</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
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

// ==================== ANA SAYFA ====================
export default function CourierEvraklarPage({ courierId, companyId, companyName }) {
  const [contractAccepted, setContractAccepted] = useState(null);
  const [fesihAccepted, setFesihAccepted] = useState(null);
  const [fesihData, setFesihData] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const [statusRes, previewRes] = await Promise.all([
        axios.get(`${API}/contracts/status/${courierId}`),
        axios.get(`${API}/contracts/preview/${courierId}`).catch(() => null)
      ]);
      setContractAccepted(statusRes.data.accepted);
      setFesihAccepted(statusRes.data.fesih_accepted);
      if (previewRes?.data?.fesih) {
        setFesihData(previewRes.data.fesih);
      }
    } catch (err) {
      setContractAccepted(false);
      setFesihAccepted(false);
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) checkStatus();
  }, [courierId, checkStatus]);

  if (loading) return <PageLoading />;

  // Adım 1: Sözleşme henüz kabul edilmediyse
  if (!contractAccepted) {
    return (
      <ContractStep 
        courierId={courierId} 
        onComplete={(fesih) => {
          setContractAccepted(true);
          if (fesih) setFesihData(fesih);
        }} 
      />
    );
  }

  // Adım 2: Fesih şartları henüz kabul edilmediyse
  if (!fesihAccepted && fesihData) {
    return (
      <FesihStep
        courierId={courierId}
        fesihData={fesihData}
        onComplete={() => setFesihAccepted(true)}
      />
    );
  }

  // Adım 3: Belge yükleme
  return (
    <DocumentUploadStep 
      courierId={courierId} 
      companyId={companyId}
      companyName={companyName}
    />
  );
}
