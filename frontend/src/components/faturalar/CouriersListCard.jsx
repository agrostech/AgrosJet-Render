import { User, FileText, Ghost } from "lucide-react";

export function CouriersListCard({ couriers, selectedCourier, onSelect }) {
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Kuryeler</h3>
          <span className="text-xs text-muted-foreground">({couriers.length})</span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {couriers.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Kurye bulunamadı
          </div>
        ) : (
          couriers.map((courier) => (
            <div
              key={courier.courier_id}
              onClick={() => onSelect(selectedCourier?.courier_id === courier.courier_id ? null : courier)}
              className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                selectedCourier?.courier_id === courier.courier_id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
              } ${courier.is_ghost ? 'bg-purple-50/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {courier.is_ghost && <Ghost className="w-4 h-4 text-purple-500" />}
                  <div>
                    <p className="font-medium text-sm">{courier.courier_name}</p>
                    {courier.is_ghost ? (
                      <p className="text-xs text-purple-600 italic">Hayalet Kurye</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{courier.phone}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={`text-sm font-semibold ${
                    courier.invoice_count > 0 ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {courier.invoice_count}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
