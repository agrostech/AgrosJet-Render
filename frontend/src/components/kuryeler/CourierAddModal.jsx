import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, UserPlus, Ghost } from "lucide-react";
import { toast } from "sonner";

export function CourierAddModal({ open, onOpenChange, onSearch, onAdd, onAddGhost }) {
  const [mode, setMode] = useState("search"); // "search" or "ghost"
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [ghostName, setGhostName] = useState("");
  const [creatingGhost, setCreatingGhost] = useState(false);

  const handleSearch = async () => {
    if (!searchPhone.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const result = await onSearch(searchPhone);
      setSearchResult(result);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kurye bulunamadı");
      }
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    try {
      await onAdd(searchPhone);
      setSearchPhone("");
      setSearchResult(null);
      onOpenChange(false);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Ekleme başarısız");
      }
    }
  };

  const handleAddGhost = async () => {
    if (!ghostName.trim()) {
      toast.error("Kurye adı gerekli");
      return;
    }
    setCreatingGhost(true);
    try {
      await onAddGhost(ghostName.trim());
      setGhostName("");
      onOpenChange(false);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Hayalet kurye oluşturulamadı");
      }
    } finally {
      setCreatingGhost(false);
    }
  };

  const handleClose = (open) => {
    if (!open) {
      setSearchPhone("");
      setSearchResult(null);
      setGhostName("");
      setMode("search");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Kurye Ekle
          </DialogTitle>
        </DialogHeader>
        
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              mode === "search"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Search className="w-4 h-4" />
            Kayıtlı Kurye
          </button>
          <button
            onClick={() => setMode("ghost")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              mode === "ghost"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Ghost className="w-4 h-4" />
            Hayalet Kurye
          </button>
        </div>

        {mode === "search" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Telefon numarası ile kurye arayın ve şirketinize ekleyin
            </p>
            <div className="flex gap-2">
              <Input 
                placeholder="05XXXXXXXXX" 
                value={searchPhone} 
                onChange={(e) => setSearchPhone(e.target.value)} 
                className="h-12 border-2 font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching} className="h-12 px-6">
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {searchResult && (
              <div className="border-2 border-border p-4 bg-slate-50">
                <p className="font-bold">{searchResult.name}</p>
                <p className="font-mono text-sm text-muted-foreground">{searchResult.phone}</p>
                <p className="text-sm mt-1">
                  Plaka: <span className="font-mono">{searchResult.plate}</span>
                </p>
                <Button onClick={handleAdd} className="w-full mt-4 font-semibold">
                  Şirkete Ekle
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Hayalet Kurye:</strong> Sisteme kayıt olmamış kuryeler için muhasebe kaydı tutabilirsiniz. 
                Kurye daha sonra sisteme kayıt olursa kayıtları birleştirebilirsiniz.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Kurye Adı</label>
              <Input 
                placeholder="Ad Soyad" 
                value={ghostName} 
                onChange={(e) => setGhostName(e.target.value)} 
                className="h-12 border-2"
                onKeyDown={(e) => e.key === 'Enter' && handleAddGhost()}
              />
            </div>
            <Button 
              onClick={handleAddGhost} 
              disabled={creatingGhost || !ghostName.trim()} 
              className="w-full h-12 font-semibold"
            >
              <Ghost className="w-4 h-4 mr-2" />
              Hayalet Kurye Oluştur
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
