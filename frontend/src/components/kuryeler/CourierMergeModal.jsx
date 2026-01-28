import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Merge, Ghost, User } from "lucide-react";
import { toast } from "sonner";

export function CourierMergeModal({ open, onOpenChange, ghostCourier, onSearch, onMerge }) {
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);

  const handleSearch = async () => {
    if (!searchPhone.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const result = await onSearch(searchPhone);
      if (result.is_ghost) {
        toast.error("Hayalet kurye ile birleştirilemez. Gerçek bir kurye seçin.");
        return;
      }
      setSearchResult(result);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kurye bulunamadı");
      }
    } finally {
      setSearching(false);
    }
  };

  const handleMerge = async () => {
    if (!searchResult) return;
    setMerging(true);
    try {
      await onMerge(ghostCourier.id, searchResult.id);
      setSearchPhone("");
      setSearchResult(null);
      onOpenChange(false);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Birleştirme başarısız");
      }
    } finally {
      setMerging(false);
    }
  };

  const handleClose = (open) => {
    if (!open) {
      setSearchPhone("");
      setSearchResult(null);
    }
    onOpenChange(open);
  };

  if (!ghostCourier) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Merge className="w-5 h-5" />
            Kurye Birleştir
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Ghost courier info */}
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Ghost className="w-5 h-5 text-purple-500" />
              <span className="font-semibold text-purple-700">Hayalet Kurye</span>
            </div>
            <p className="text-lg font-bold">{ghostCourier.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bu kuryeye ait tüm işlemler, faturalar ve kayıtlar seçeceğiniz gerçek kuryeye aktarılacak.
            </p>
          </div>

          {/* Search for real courier */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Hedef Kurye Ara
            </label>
            <div className="flex gap-2">
              <Input 
                placeholder="Telefon numarası" 
                value={searchPhone} 
                onChange={(e) => setSearchPhone(e.target.value)} 
                className="h-12 border-2 font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching} className="h-12 px-6">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Search result */}
          {searchResult && (
            <div className="border-2 border-green-200 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-700">Hedef Kurye</span>
              </div>
              <p className="font-bold">{searchResult.name}</p>
              <p className="font-mono text-sm text-muted-foreground">{searchResult.phone}</p>
              <p className="text-sm mt-1">
                Plaka: <span className="font-mono">{searchResult.plate}</span>
              </p>
              
              <div className="mt-4 pt-4 border-t border-green-200">
                <p className="text-sm text-amber-700 mb-3">
                  <strong>Uyarı:</strong> Bu işlem geri alınamaz. Hayalet kuryeye ait tüm kayıtlar bu kuryeye aktarılacak ve hayalet kurye silinecektir.
                </p>
                <Button 
                  onClick={handleMerge} 
                  disabled={merging}
                  className="w-full font-semibold bg-purple-600 hover:bg-purple-700"
                >
                  <Merge className="w-4 h-4 mr-2" />
                  Birleştir
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
