import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Package, CheckCircle, AlertCircle } from "lucide-react";

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
        // Get all zimmet assignments for this courier
        const res = await axios.get(`${API}/zimmet/courier/${courierId}/assignments`);
        setAssignments(res.data);
      } catch (err) {
        // API might not exist yet, try alternative
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

  // Group by status
  const activeAssignments = assignments.filter(a => a.status === 'active');
  const returnedAssignments = assignments.filter(a => a.status === 'returned');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-zimmet-page">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Zimmetlerim</h2>
            <p className="text-sm text-muted-foreground">Size zimmetli ürünler</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border-2 border-border bg-white p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Aktif Zimmet</span>
          </div>
          <p className="text-2xl font-bold">{activeAssignments.length}</p>
          <p className="text-xs text-muted-foreground">Üzerinizde kayıtlı</p>
        </div>
        <div className="border-2 border-border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">İade Edilen</span>
          </div>
          <p className="text-2xl font-bold">{returnedAssignments.length}</p>
          <p className="text-xs text-muted-foreground">Toplam</p>
        </div>
      </div>

      {/* Active Assignments */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold">Aktif Zimmetler</h3>
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
            {activeAssignments.length}
          </span>
        </div>
        
        {activeAssignments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Aktif zimmetiniz bulunmuyor</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeAssignments.map((assignment) => (
              <div key={assignment.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{assignment.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Zimmet Tarihi: {formatDate(assignment.assigned_at)}
                    </p>
                    {assignment.notes && (
                      <p className="text-sm text-slate-500 mt-1">{assignment.notes}</p>
                    )}
                  </div>
                  <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                    Aktif
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Returned Assignments */}
      {returnedAssignments.length > 0 && (
        <div className="border-2 border-border bg-white">
          <div className="p-4 border-b-2 border-border flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold">İade Edilenler</h3>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
              {returnedAssignments.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {returnedAssignments.map((assignment) => (
              <div key={assignment.id} className="p-4 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-600">{assignment.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      İade Tarihi: {formatDate(assignment.returned_at)}
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                    İade Edildi
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
