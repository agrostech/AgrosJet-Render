import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Download, Smartphone } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function PWAInstallPrompt() {
  const { showPrompt, install, dismiss, canInstall, isInstalled } = usePWAInstall();
  const [neverShowAgain, setNeverShowAgain] = useState(false);

  if (isInstalled || !canInstall || !showPrompt) {
    return null;
  }

  const handleDismiss = () => {
    dismiss(neverShowAgain);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/80 to-transparent animate-in slide-in-from-bottom duration-300">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base text-slate-900">
                ShiftJet'i Ana Ekrana Ekle
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Daha hızlı erişim için uygulamayı telefonunuza yükleyin
              </p>
            </div>
            <button 
              onClick={handleDismiss}
              className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="Kapat"
              data-testid="pwa-prompt-close-btn"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          
          <div className="flex items-center gap-2 mt-4">
            <Checkbox 
              id="never-show-pwa"
              checked={neverShowAgain}
              onCheckedChange={setNeverShowAgain}
              data-testid="pwa-never-show-checkbox"
            />
            <label 
              htmlFor="never-show-pwa" 
              className="text-sm text-slate-500 cursor-pointer select-none"
            >
              Bunu tekrar gösterme
            </label>
          </div>
          
          <div className="flex gap-2 mt-3">
            <Button
              onClick={handleDismiss}
              variant="ghost"
              className="flex-1 h-11 text-slate-600"
              data-testid="pwa-later-btn"
            >
              Daha Sonra
            </Button>
            <Button
              onClick={install}
              className="flex-1 h-11 bg-primary hover:bg-primary/90"
              data-testid="pwa-install-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              Yükle
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
