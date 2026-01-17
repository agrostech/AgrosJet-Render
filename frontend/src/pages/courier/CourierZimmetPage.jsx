import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR');
};

export default function CourierZimmetPage({ courierId }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API}/zimmet/courier/${courierId}/assignments`);
        setAssignments(res.data);
      } catch (err) {
        try {
          const allRes = await axios.get(`${API}/zimmet/assignments`);
          const myAssignments = allRes.data.filter(a => a.courier_id === courierId);
          setAssignments(myAssignments);
        } catch (err2) {
          toast.error("Zimmet bilgileri yüklenemedi");
        }
      } finally {
        setLoading(false);
      }
    };

    if (courierId) fetchData();
  }, [courierId]);

  // Only show active assignments
  const activeAssignments = assignments.filter(a => a.status === 'active');

  // Check if product is POS device
  const isPosDevice = (assignment) => {
    const name = (assignment.product_name || '').toLowerCase();
    const type = (assignment.product_type || '').toLowerCase();
    return name.includes('pos') || type.includes('pos');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-zimmet-page">
      {/* Main Card */}
      <div className="border-2 border-border bg-white">
        {/* Header */}
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl">Zimmetlerim</h2>
                <p className="text-sm text-muted-foreground">Size zimmetli ürünler</p>
              </div>
            </div>
            {activeAssignments.length > 0 && (
              <div className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg">
                <span className="text-sm font-semibold">{activeAssignments.length} ürün</span>
              </div>
            )}
          </div>
        </div>

        {/* Assignments List */}
        {activeAssignments.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Zimmetli ürününüz bulunmuyor</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeAssignments.map((assignment) => (
              <div key={assignment.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{assignment.product_name}</p>
                    {assignment.product_type && (
                      <p className="text-xs text-muted-foreground">{assignment.product_type}</p>
                    )}
                    {isPosDevice(assignment) ? (
                      <>
                        {assignment.pos_serial && (
                          <p className="text-xs font-mono text-slate-500 mt-1">
                            Pos SN: {assignment.pos_serial}
                          </p>
                        )}
                        {assignment.pos_terminal && (
                          <p className="text-xs font-mono text-slate-500">
                            Pos TRM: {assignment.pos_terminal}
                          </p>
                        )}
                      </>
                    ) : (
                      assignment.serial_number && (
                        <p className="text-xs font-mono text-slate-500 mt-1">
                          SN: {assignment.serial_number}
                        </p>
                      )
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Zimmet Tarihi: {formatDate(assignment.assigned_at)}
                    </p>
                    {assignment.notes && (
                      <p className="text-sm text-slate-600 mt-2 italic">"{assignment.notes}"</p>
                    )}
                  </div>
                  <div className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                    Aktif
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
