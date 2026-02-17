import { Card, CardContent } from "@/components/ui/card";
import { Store } from "lucide-react";

export default function RestoranMutabakatTab({ companyId }) {
  return (
    <div data-testid="restoran-mutabakat-tab">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Store className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Restoran Mütabakat</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Bu sekme yakında aktif olacaktır.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
