import { Settings, Wrench } from "lucide-react";

export default function SistemPage() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100">
            <Settings className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Sistem</h2>
            <p className="text-sm text-muted-foreground">Sistem ayarları ve yönetimi</p>
          </div>
        </div>
      </div>

      {/* Placeholder */}
      <div className="border-2 border-dashed border-slate-300 bg-white p-12 text-center">
        <Wrench className="w-16 h-16 mx-auto mb-4 text-slate-300" />
        <h3 className="font-semibold text-lg text-slate-500">Yakında</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Bu bölüme yeni özellikler eklenecek
        </p>
      </div>
    </div>
  );
}
