import { useState, useEffect } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trash2, 
  Pencil, 
  Check, 
  X, 
  FolderOpen,
  Store,
  ChevronDown,
  ChevronRight,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const API = process.env.REACT_APP_BACKEND_URL;

export default function RestaurantGroupsModal({ open, onClose, companyId, restaurants = [] }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editName, setEditName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [addingToGroup, setAddingToGroup] = useState(null);

  // Grupları yükle
  const fetchGroups = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/restaurant-groups/${companyId}`);
      setGroups(res.data.groups || []);
    } catch (err) {
      console.error("Gruplar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && companyId) {
      fetchGroups();
    }
  }, [open, companyId]);

  // Yeni grup oluştur
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Grup adı boş olamaz");
      return;
    }
    try {
      await axios.post(`${API}/api/restaurant-groups`, {
        name: newGroupName.trim(),
        company_id: companyId
      });
      toast.success("Grup oluşturuldu");
      setNewGroupName("");
      fetchGroups();
    } catch (err) {
      toast.error("Grup oluşturulamadı");
    }
  };

  // Grup adını güncelle
  const handleUpdateGroup = async (groupId) => {
    if (!editName.trim()) {
      toast.error("Grup adı boş olamaz");
      return;
    }
    try {
      await axios.put(`${API}/api/restaurant-groups/${groupId}`, {
        name: editName.trim()
      });
      toast.success("Grup güncellendi");
      setEditingGroup(null);
      fetchGroups();
    } catch (err) {
      toast.error("Grup güncellenemedi");
    }
  };

  // Grup sil
  const handleDeleteGroup = async (groupId) => {
    if (!confirm("Bu grubu silmek istediğinizden emin misiniz?")) return;
    try {
      await axios.delete(`${API}/api/restaurant-groups/${groupId}`);
      toast.success("Grup silindi");
      fetchGroups();
    } catch (err) {
      toast.error("Grup silinemedi");
    }
  };

  // Gruba restoran ekle
  const handleAddRestaurant = async (groupId, restaurantId) => {
    try {
      await axios.post(`${API}/api/restaurant-groups/${groupId}/restaurants`, {
        restaurant_ids: [restaurantId]
      });
      toast.success("Restoran gruba eklendi");
      fetchGroups();
    } catch (err) {
      toast.error("Restoran eklenemedi");
    }
  };

  // Gruptan restoran çıkar
  const handleRemoveRestaurant = async (groupId, restaurantId) => {
    try {
      await axios.delete(`${API}/api/restaurant-groups/${groupId}/restaurants`, {
        data: { restaurant_ids: [restaurantId] }
      });
      toast.success("Restoran gruptan çıkarıldı");
      fetchGroups();
    } catch (err) {
      toast.error("Restoran çıkarılamadı");
    }
  };

  // Restoran adını bul
  const getRestaurantName = (restaurantId) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    return restaurant?.name || restaurantId;
  };

  // Gruptaki restoranları bul
  const getGroupRestaurants = (group) => {
    return (group.restaurant_ids || []).map(id => ({
      id,
      name: getRestaurantName(id)
    }));
  };

  // Grupta olmayan restoranlar
  const getAvailableRestaurants = (group) => {
    const groupRestaurantIds = group.restaurant_ids || [];
    return restaurants.filter(r => !groupRestaurantIds.includes(r.id));
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Restoran Grupları
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Yeni Grup Oluştur */}
          <Card className="border-dashed">
            <CardContent className="p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Yeni grup adı..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  className="flex-1"
                />
                <Button onClick={handleCreateGroup} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Grup Ekle
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Gruplar Listesi */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Henüz grup oluşturulmamış</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => {
                const groupRestaurants = getGroupRestaurants(group);
                const availableRestaurants = getAvailableRestaurants(group);
                const isExpanded = expandedGroups[group.id];
                const isEditing = editingGroup === group.id;

                return (
                  <Collapsible
                    key={group.id}
                    open={isExpanded}
                    onOpenChange={() => toggleGroup(group.id)}
                  >
                    <Card>
                      <CardContent className="p-0">
                        {/* Grup Başlık */}
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                              
                              {isEditing ? (
                                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="h-7 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleUpdateGroup(group.id);
                                      if (e.key === "Escape") setEditingGroup(null);
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-green-600"
                                    onClick={() => handleUpdateGroup(group.id)}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => setEditingGroup(null)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <span className="font-medium truncate">{group.name}</span>
                                  <Badge variant="secondary" className="text-xs ml-2">
                                    {groupRestaurants.length} restoran
                                  </Badge>
                                </>
                              )}
                            </div>
                            
                            {!isEditing && (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    setEditingGroup(group.id);
                                    setEditName(group.name);
                                  }}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteGroup(group.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CollapsibleTrigger>

                        {/* Grup İçeriği */}
                        <CollapsibleContent>
                          <div className="border-t p-3 space-y-3">
                            {/* Gruptaki Restoranlar */}
                            {groupRestaurants.length > 0 ? (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Gruptaki Restoranlar</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {groupRestaurants.map((restaurant) => (
                                    <Badge
                                      key={restaurant.id}
                                      variant="outline"
                                      className="pl-2 pr-1 py-1 flex items-center gap-1"
                                    >
                                      <Store className="w-3 h-3" />
                                      <span className="text-xs">{restaurant.name}</span>
                                      <button
                                        onClick={() => handleRemoveRestaurant(group.id, restaurant.id)}
                                        className="ml-1 p-0.5 hover:bg-red-100 rounded text-red-500"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                Bu grupta henüz restoran yok
                              </p>
                            )}

                            {/* Restoran Ekle */}
                            {availableRestaurants.length > 0 && (
                              <div className="pt-2 border-t">
                                {addingToGroup === group.id ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-medium text-muted-foreground">Eklenebilir Restoranlar</p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-xs"
                                        onClick={() => setAddingToGroup(null)}
                                      >
                                        Kapat
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                      {availableRestaurants.map((restaurant) => (
                                        <Badge
                                          key={restaurant.id}
                                          variant="secondary"
                                          className="cursor-pointer hover:bg-primary hover:text-white transition-colors"
                                          onClick={() => handleAddRestaurant(group.id, restaurant.id)}
                                        >
                                          <Plus className="w-3 h-3 mr-1" />
                                          {restaurant.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full text-xs"
                                    onClick={() => setAddingToGroup(group.id)}
                                  >
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                    Restoran Ekle
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </CardContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
