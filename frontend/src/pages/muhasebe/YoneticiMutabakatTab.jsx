import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  RefreshCw, 
  Users, 
  Banknote, 
  CreditCard, 
  Wallet,
  RotateCcw,
  ChevronRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  History,
  UtensilsCrossed
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0) + '₺';
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('tr-TR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

export default function YoneticiMutabakatTab({ companyId, currentUser }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Detail modal
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  
  // Reset modal
  const [resetAdmin, setResetAdmin] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNote, setResetNote] = useState("");
  
  // History modal
  const [historyAdmin, setHistoryAdmin] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const hasMealCard = data?.hasMealCardCollection;

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin-mutabakat/${companyId}`);
      setData(res.data);
    } catch (err) {
      console.error("Yönetici mütabakat verisi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchAdminDetails = async (admin) => {
    setSelectedAdmin(admin);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/admin-mutabakat/${companyId}/admin/${admin.admin_id}/details`);
      setDetailData(res.data);
    } catch (err) {
      console.error("Detay alınamadı:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchHistory = async (admin) => {
    setHistoryAdmin(admin);
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/admin-mutabakat/${companyId}/admin/${admin.admin_id}/history`);
      setHistoryData(res.data);
    } catch (err) {
      console.error("Geçmiş alınamadı:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReset = async () => {
    if (!resetAdmin) return;
    
    setResetLoading(true);
    try {
      await axios.post(`${API}/admin-mutabakat/${companyId}/reset/${resetAdmin.admin_id}`, {
        reset_by_id: currentUser.id,
        reset_by_name: currentUser.name,
        note: resetNote || null
      });
      
      setResetAdmin(null);
      setResetNote("");
      fetchData();
    } catch (err) {
      console.error("Sıfırlama hatası:", err);
      alert("Sıfırlama işlemi başarısız");
    } finally {
      setResetLoading(false);
    }
  };

  const filteredAdmins = data?.admins?.filter(a => 
    a.admin_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="yonetici-mutabakat-tab">
      {/* Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-2 text-slate-500" />
            <p className="text-2xl font-bold text-slate-800">{data?.summary?.admin_count || 0}</p>
            <p className="text-xs text-slate-500">Bakiyeli Yönetici</p>
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <Banknote className="w-5 h-5 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.summary?.total_cash)}</p>
            <p className="text-xs text-slate-500">Toplam Nakit</p>
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <CreditCard className="w-5 h-5 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.summary?.total_card)}</p>
            <p className="text-xs text-slate-500">Toplam Kart</p>
            {(data?.summary?.total_card_1 > 0 || data?.summary?.total_card_10 > 0 || data?.summary?.total_card_20 > 0) && (
              <div className="text-[10px] text-muted-foreground mt-1">
                %1: {formatCurrency(data?.summary?.total_card_1)} | %10: {formatCurrency(data?.summary?.total_card_10)} | %20: {formatCurrency(data?.summary?.total_card_20)}
              </div>
            )}
          </CardContent>
        </Card>
        {hasMealCard && (
          <Card className="border bg-white shadow-sm">
            <CardContent className="p-4 text-center">
              <UtensilsCrossed className="w-5 h-5 mx-auto mb-2 text-orange-500" />
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.summary?.total_meal_card)}</p>
              <p className="text-xs text-slate-500">Yemek Kartı</p>
            </CardContent>
          </Card>
        )}
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <Wallet className="w-5 h-5 mx-auto mb-2 text-slate-500" />
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.summary?.total_balance)}</p>
            <p className="text-xs text-slate-500">Genel Toplam</p>
          </CardContent>
        </Card>
      </div>

      {/* Arama ve Yenile */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Yönetici ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="h-9">
              <RefreshCw className="w-4 h-4 mr-1" />
              Yenile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Yönetici Listesi */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="p-0">
          {filteredAdmins.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Henüz tahsilat kaydı yok</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Yönetici</TableHead>
                  <TableHead className="text-right">Tahsilat</TableHead>
                  <TableHead className="text-right">Nakit</TableHead>
                  <TableHead className="text-right">Kart</TableHead>
                  {hasMealCard && <TableHead className="text-right">Y.Kartı</TableHead>}
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead className="text-center">Son Sıfırlama</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdmins.map((admin) => (
                  <TableRow key={admin.admin_id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{admin.admin_name}</span>
                        {admin.role === 'superadmin' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Süper Admin
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {admin.courier_count} kuryeden tahsilat
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {admin.collection_count}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(admin.total_cash)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">{formatCurrency(admin.total_card)}</div>
                      {(admin.total_card_1 > 0 || admin.total_card_10 > 0 || admin.total_card_20 > 0) && (
                        <div className="text-[10px] text-muted-foreground">
                          %1: {formatCurrency(admin.total_card_1)} | %10: {formatCurrency(admin.total_card_10)} | %20: {formatCurrency(admin.total_card_20)}
                        </div>
                      )}
                    </TableCell>
                    {hasMealCard && (
                      <TableCell className="text-right font-medium">
                        {formatCurrency(admin.total_meal_card)}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-bold">
                      {formatCurrency(admin.total_balance)}
                    </TableCell>
                    <TableCell className="text-center">
                      {admin.last_reset ? (
                        <div className="text-xs">
                          <div>{formatDate(admin.last_reset)}</div>
                          <div className="text-muted-foreground">{admin.last_reset_info?.reset_by_name}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchAdminDetails(admin)}
                          className="h-7 px-2"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        {admin.last_reset && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchHistory(admin)}
                            className="h-7 px-2"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        )}
                        {isSuperAdmin && admin.total_balance > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResetAdmin(admin)}
                            className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detay Modal */}
      <Dialog open={!!selectedAdmin} onOpenChange={() => setSelectedAdmin(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {selectedAdmin?.admin_name} - Tahsilat Detayları
            </DialogTitle>
            {detailData?.last_reset && (
              <DialogDescription>
                Son sıfırlama: {formatDateTime(detailData.last_reset)}
              </DialogDescription>
            )}
          </DialogHeader>
          
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : detailData ? (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Kurye Özeti */}
              {detailData.courier_summary?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Kurye Bazlı Özet</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Kurye</TableHead>
                          <TableHead className="text-xs text-right">Tahsilat</TableHead>
                          <TableHead className="text-xs text-right">Nakit</TableHead>
                          <TableHead className="text-xs text-right">Kart</TableHead>
                          {hasMealCard && <TableHead className="text-xs text-right">Y.Kartı</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.courier_summary.map((c) => (
                          <TableRow key={c._id}>
                            <TableCell className="text-sm">{c.courier_name}</TableCell>
                            <TableCell className="text-sm text-right">{c.count}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(c.total_cash)}</TableCell>
                            <TableCell className="text-sm text-right">
                              <div>{formatCurrency(c.total_card)}</div>
                              {(c.total_card_1 > 0 || c.total_card_10 > 0 || c.total_card_20 > 0) && (
                                <div className="text-[9px] text-muted-foreground">
                                  %1: {formatCurrency(c.total_card_1)} | %10: {formatCurrency(c.total_card_10)} | %20: {formatCurrency(c.total_card_20)}
                                </div>
                              )}
                            </TableCell>
                            {hasMealCard && (
                              <TableCell className="text-sm text-right">{formatCurrency(c.total_meal_card)}</TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Detaylı Liste */}
              {detailData.collections?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Tahsilat Kayıtları ({detailData.pagination?.total || 0})</h4>
                  <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Tarih</TableHead>
                          <TableHead className="text-xs">Kurye</TableHead>
                          <TableHead className="text-xs text-right">Nakit</TableHead>
                          <TableHead className="text-xs text-right">Kart</TableHead>
                          {hasMealCard && <TableHead className="text-xs text-right">Y.Kartı</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.collections.map((col, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{formatDate(col.date)}</TableCell>
                            <TableCell className="text-sm">{col.courier_name}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(col.cash_amount)}</TableCell>
                            <TableCell className="text-sm text-right">
                              <div>{formatCurrency(col.card_total)}</div>
                              {(col.card_percent_1 > 0 || col.card_percent_10 > 0 || col.card_percent_20 > 0) && (
                                <div className="text-[9px] text-muted-foreground">
                                  %1: {formatCurrency(col.card_percent_1)} | %10: {formatCurrency(col.card_percent_10)} | %20: {formatCurrency(col.card_percent_20)}
                                </div>
                              )}
                            </TableCell>
                            {hasMealCard && (
                              <TableCell className="text-sm text-right">{formatCurrency(col.meal_card_amount)}</TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {detailData.collections?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Henüz tahsilat kaydı yok</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Sıfırlama Modal */}
      <Dialog open={!!resetAdmin} onOpenChange={() => { setResetAdmin(null); setResetNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Bakiye Sıfırlama
            </DialogTitle>
            <DialogDescription>
              {resetAdmin?.admin_name} için bakiye sıfırlanacak
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-amber-700">Nakit</div>
                  <div className="text-lg font-bold text-green-600">{formatCurrency(resetAdmin?.total_cash)}</div>
                </div>
                <div>
                  <div className="text-xs text-amber-700">Kart</div>
                  <div className="text-lg font-bold text-blue-600">{formatCurrency(resetAdmin?.total_card)}</div>
                </div>
                <div>
                  <div className="text-xs text-amber-700">Toplam</div>
                  <div className="text-lg font-bold">{formatCurrency(resetAdmin?.total_balance)}</div>
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Not (opsiyonel)</label>
              <Input
                placeholder="Sıfırlama sebebi..."
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <p className="text-xs text-muted-foreground">
              Bu işlem geri alınamaz. Mevcut bakiye sıfırlama geçmişine kaydedilecek.
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetAdmin(null); setResetNote(""); }}>
              İptal
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReset}
              disabled={resetLoading}
            >
              {resetLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sıfırla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Geçmiş Modal */}
      <Dialog open={!!historyAdmin} onOpenChange={() => setHistoryAdmin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {historyAdmin?.admin_name} - Sıfırlama Geçmişi
            </DialogTitle>
          </DialogHeader>
          
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : historyData?.resets?.length > 0 ? (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tarih</TableHead>
                    <TableHead className="text-xs">Sıfırlayan</TableHead>
                    <TableHead className="text-xs text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.resets.map((reset, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{formatDateTime(reset.reset_at)}</TableCell>
                      <TableCell className="text-sm">
                        {reset.reset_by_name}
                        {reset.note && (
                          <div className="text-xs text-muted-foreground">{reset.note}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs text-green-600">N: {formatCurrency(reset.cash_at_reset)}</div>
                        <div className="text-xs text-blue-600">K: {formatCurrency(reset.card_at_reset)}</div>
                        <div className="text-sm font-medium">{formatCurrency(reset.total_at_reset)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Sıfırlama geçmişi yok</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
