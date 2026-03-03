import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Trash2, CheckCircle } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CourierDeleteAccountPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const handleDelete = async (e) => {
    e.preventDefault();
    
    if (confirmText !== "HESABIMI SIL") {
      toast.error("Lütfen 'HESABIMI SIL' yazarak onaylayın");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/delete-account`, {
        phone,
        password
      });
      setDeleted(true);
      toast.success("Hesabınız başarıyla silindi");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Hesap silinemedi");
    } finally {
      setLoading(false);
    }
  };

  if (deleted) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-green-700">Hesap Silindi</h2>
              <p className="text-slate-600">
                Hesabınız ve tüm verileriniz başarıyla silindi.
              </p>
              <p className="text-sm text-slate-500">
                AgrosJet'i kullandığınız için teşekkür ederiz.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl text-red-700">Hesap Silme</CardTitle>
          <CardDescription>
            Kurye hesabınızı kalıcı olarak silin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="flex gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Dikkat!</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Bu işlem geri alınamaz</li>
                  <li>Tüm kişisel verileriniz silinecek</li>
                  <li>Sipariş geçmişiniz kaldırılacak</li>
                  <li>Şirket bağlantılarınız sonlandırılacak</li>
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={handleDelete} className="space-y-4">
            <div>
              <Label htmlFor="phone">Telefon Numarası</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="05XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confirm">
                Onaylamak için <span className="font-bold text-red-600">HESABIMI SIL</span> yazın
              </Label>
              <Input
                id="confirm"
                type="text"
                placeholder="HESABIMI SIL"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <Button
              type="submit"
              variant="destructive"
              className="w-full"
              disabled={loading || confirmText !== "HESABIMI SIL"}
            >
              {loading ? "Siliniyor..." : "Hesabımı Kalıcı Olarak Sil"}
            </Button>
          </form>

          <p className="text-xs text-center text-slate-500 mt-4">
            Sorularınız için: destek@agrosjet.app
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
