import { useState, useEffect } from "react";

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissedAt = dismissed ? new Date(dismissed) : null;
    const daysSinceDismissed = dismissedAt 
      ? (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Listen for beforeinstallprompt event
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      
      // Only show prompt if not dismissed in last 7 days
      if (daysSinceDismissed > 7) {
        // Small delay to let the page load
        setTimeout(() => setShowPrompt(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    
    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return false;

    const result = await installPrompt.prompt();
    
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
      setShowPrompt(false);
      setInstallPrompt(null);
      return true;
    }
    
    return false;
  };

  const dismiss = () => {
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    setShowPrompt(false);
  };

  return {
    isInstalled,
    canInstall: !!installPrompt,
    showPrompt,
    install,
    dismiss,
    setShowPrompt
  };
}
