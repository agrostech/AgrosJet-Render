import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  GraduationCap, 
  Video, 
  FileText, 
  Play,
  Calendar,
  ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CourierAkademiPage({ companyId }) {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraining, setSelectedTraining] = useState(null);

  const fetchTrainings = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/academy/company/${companyId}/trainings`);
      setTrainings(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Eğitimler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (loading) return <PageLoading />;

  // Training Detail View
  if (selectedTraining) {
    return (
      <div data-testid="courier-akademi-detail" className="space-y-4">
        <Button 
          variant="ghost" 
          onClick={() => setSelectedTraining(null)}
          className="mb-2"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Geri
        </Button>

        <div className="border-2 border-border bg-white rounded-lg overflow-hidden">
          {/* Video */}
          {selectedTraining.training_type === "video" && selectedTraining.video_path && (
            <div className="bg-black">
              <video 
                controls 
                className="w-full max-h-[60vh]"
                src={`${process.env.REACT_APP_BACKEND_URL}${selectedTraining.video_path}`}
              >
                Tarayıcınız video oynatmayı desteklemiyor.
              </video>
            </div>
          )}

          {/* Content */}
          <div className="p-4">
            <h2 className="text-lg font-bold">{selectedTraining.title}</h2>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {formatDate(selectedTraining.created_at)}
            </div>
            
            {selectedTraining.content && (
              <div className="mt-4 pt-4 border-t">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {selectedTraining.content}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Trainings List View
  return (
    <div data-testid="courier-akademi-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold">Akademi</h2>
          <p className="text-sm text-muted-foreground">Eğitim içerikleri</p>
        </div>
      </div>

      {/* Trainings List */}
      {trainings.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 sm:p-12 text-center">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Henüz eğitim içeriği eklenmemiş</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trainings.map((training) => (
            <div 
              key={training.id} 
              onClick={() => setSelectedTraining(training)}
              className="border-2 border-border bg-white rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-primary/50 transition-colors active:bg-slate-50"
            >
              {/* Type Icon */}
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                training.training_type === "video" 
                  ? "bg-slate-900" 
                  : "bg-slate-100"
              }`}>
                {training.training_type === "video" ? (
                  <Play className="w-5 h-5 text-white" />
                ) : (
                  <FileText className="w-5 h-5 text-slate-500" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{training.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    training.training_type === "video" 
                      ? "bg-slate-100 text-slate-600" 
                      : "bg-blue-50 text-blue-600"
                  }`}>
                    {training.training_type === "video" ? "Video" : "Yazılı"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(training.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
