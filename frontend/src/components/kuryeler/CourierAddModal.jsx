import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

export function CourierAddModal({ open, onOpenChange, onSearch, onAdd }) {
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

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

  const handleClose = (open) => {
    if (!open) {
      setSearchPhone("");
      setSearchResult(null);
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
      </DialogContent>
    </Dialog>
  );
}
