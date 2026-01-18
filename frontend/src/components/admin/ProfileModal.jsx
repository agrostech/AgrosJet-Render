import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ProfileModal({ user, open, onOpenChange }) {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({ 
    username: user?.username || "", 
    email: user?.email || "",
    password: "", 
    confirmPassword: "", 
    currentPassword: "" 
  });
  const [profileLoading, setProfileLoading] = useState(false);
  
  const isSuperAdmin = user?.role === "superadmin";

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    
    if (profileData.password && profileData.password !== profileData.confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor");
      return;
    }
    
    if (!profileData.currentPassword) {
      toast.error("Mevcut şifrenizi girin");
      return;
    }

    setProfileLoading(true);
    try {
      const payload = {
        current_password: profileData.currentPassword
      };
      
      if (profileData.username !== user.username) {
        payload.username = profileData.username;
      }
      if (profileData.password) {
        payload.password = profileData.password;
      }
      if (isSuperAdmin && profileData.email !== (user.email || "")) {
        payload.email = profileData.email;
      }
      
      const res = await axios.put(`${API}/profile/${user.id}`, payload);
      
      toast.success("Profil güncellendi");
      
      // Update local storage if email changed
      if (isSuperAdmin && profileData.email) {
        const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
        storedUser.email = profileData.email;
        localStorage.setItem("user", JSON.stringify(storedUser));
      }
      
      onOpenChange(false);
      
      if (res.data.requires_relogin) {
        toast.info("Bilgileriniz değişti. Yeniden giriş yapmanız gerekiyor.");
        setTimeout(() => {
          localStorage.removeItem("user");
          navigate("/login");
        }, 1500);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setProfileLoading(false);
    }
  };

  // Reset form when modal opens
  const handleOpenChange = (isOpen) => {
    if (isOpen) {
      setProfileData({ 
        username: user?.username || "", 
        email: user?.email || "",
        password: "", 
        confirmPassword: "", 
        currentPassword: "" 
      });
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Profil Ayarları
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded border">
            <p className="text-xs text-muted-foreground">Giriş yapmış kullanıcı</p>
            <p className="font-semibold">{user?.name}</p>
            <p className="text-sm text-muted-foreground font-mono">{user?.username}</p>
          </div>
          
          <div>
            <Label className="text-sm font-semibold">Yeni Kullanıcı Adı</Label>
            <Input 
              data-testid="profile-username"
              value={profileData.username} 
              onChange={(e) => setProfileData({ ...profileData, username: e.target.value })} 
              className="mt-1 h-11 border-2" 
              placeholder="Değiştirmek istemiyorsanız boş bırakın"
            />
          </div>
          
          <div>
            <Label className="text-sm font-semibold">Yeni Şifre</Label>
            <Input 
              data-testid="profile-new-password"
              type="password" 
              value={profileData.password} 
              onChange={(e) => setProfileData({ ...profileData, password: e.target.value })} 
              className="mt-1 h-11 border-2" 
              placeholder="Değiştirmek istemiyorsanız boş bırakın"
            />
          </div>
          
          {profileData.password && (
            <div>
              <Label className="text-sm font-semibold">Yeni Şifre (Tekrar)</Label>
              <Input 
                data-testid="profile-confirm-password"
                type="password" 
                value={profileData.confirmPassword} 
                onChange={(e) => setProfileData({ ...profileData, confirmPassword: e.target.value })} 
                className="mt-1 h-11 border-2" 
                placeholder="Yeni şifreyi tekrar girin"
              />
            </div>
          )}
          
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold text-orange-600">Mevcut Şifre (Zorunlu)</Label>
            <Input 
              data-testid="profile-current-password"
              type="password" 
              value={profileData.currentPassword} 
              onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })} 
              className="mt-1 h-11 border-2 border-orange-200" 
              placeholder="Değişiklikleri onaylamak için mevcut şifrenizi girin"
              required
            />
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
            <strong>Not:</strong> Kullanıcı adı veya şifre değiştirildiğinde güvenlik nedeniyle yeniden giriş yapmanız istenecektir.
          </div>
          
          <Button 
            type="submit" 
            className="w-full h-11 font-semibold" 
            disabled={profileLoading}
            data-testid="profile-submit-btn"
          >
            {profileLoading ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
