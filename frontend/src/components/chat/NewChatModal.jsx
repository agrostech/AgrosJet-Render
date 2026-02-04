import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Search, User, Users, Loader2, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function NewChatModal({ 
  open, 
  onOpenChange, 
  userId, 
  userName, 
  userRole, 
  companyId,
  onConversationCreated 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Search users
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await axios.get(`${API}/chat/users/search`, {
        params: { company_id: companyId, query, current_user_id: userId }
      });
      setSearchResults(res.data);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  }, [companyId, userId]);

  // Toggle user selection for group
  const toggleUserSelection = (user) => {
    if (isGroupMode) {
      setSelectedUsers(prev => {
        const exists = prev.find(u => u.id === user.id);
        if (exists) {
          return prev.filter(u => u.id !== user.id);
        }
        return [...prev, user];
      });
    } else {
      // Direct chat - create immediately
      createConversation([user]);
    }
  };

  // Create conversation
  const createConversation = async (users) => {
    if (users.length === 0) return;

    setCreating(true);
    try {
      const participantIds = [userId, ...users.map(u => u.id)];
      const participantNames = [userName, ...users.map(u => u.name)];
      const participantRoles = [userRole, ...users.map(u => u.role)];

      const payload = {
        participant_ids: participantIds,
        participant_names: participantNames,
        participant_roles: participantRoles,
        is_group: users.length > 1,
        group_name: users.length > 1 ? groupName || null : null,
        company_id: companyId
      };

      const res = await axios.post(`${API}/chat/conversations`, payload);
      
      toast.success("Sohbet oluşturuldu");
      onConversationCreated(res.data);
      
      // Reset state
      setSearchQuery("");
      setSearchResults([]);
      setSelectedUsers([]);
      setIsGroupMode(false);
      setGroupName("");
      
    } catch (err) {
      console.error("Create conversation error:", err);
      toast.error("Sohbet oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  // Handle group creation
  const handleCreateGroup = () => {
    if (selectedUsers.length < 2) {
      toast.error("Grup için en az 2 kişi seçmelisiniz");
      return;
    }
    createConversation(selectedUsers);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Yeni Sohbet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={!isGroupMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsGroupMode(false);
                setSelectedUsers([]);
              }}
              className="flex-1"
            >
              <User className="w-4 h-4 mr-2" />
              Bireysel
            </Button>
            <Button
              variant={isGroupMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsGroupMode(true)}
              className="flex-1"
            >
              <Users className="w-4 h-4 mr-2" />
              Grup
            </Button>
          </div>

          {/* Group Name (only in group mode) */}
          {isGroupMode && (
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Grup adı (opsiyonel)"
              className="text-sm"
            />
          )}

          {/* Selected users for group */}
          {isGroupMode && selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedUsers.map(user => (
                <Badge 
                  key={user.id} 
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => toggleUserSelection(user)}
                >
                  {user.name} ×
                </Badge>
              ))}
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="İsim ile ara..."
              className="pl-9"
              data-testid="new-chat-search"
            />
          </div>

          {/* Search Results */}
          <div className="max-h-60 overflow-y-auto border rounded-md">
            {searching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {searchQuery.length < 2 
                  ? "Aramak için en az 2 karakter yazın"
                  : "Sonuç bulunamadı"
                }
              </div>
            ) : (
              searchResults.map(user => {
                const isSelected = selectedUsers.find(u => u.id === user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user)}
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b last:border-b-0 hover:bg-slate-50 ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                    data-testid={`user-result-${user.id}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      user.role === 'admin' ? 'bg-primary' : 'bg-orange-500'
                    }`}>
                      {user.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{user.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {user.role === 'admin' ? 'Yönetici' : 'Kurye'}
                      </p>
                    </div>
                    {isGroupMode && isSelected && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Create Group Button */}
          {isGroupMode && selectedUsers.length >= 2 && (
            <Button 
              onClick={handleCreateGroup} 
              disabled={creating}
              className="w-full"
              data-testid="create-group-btn"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Users className="w-4 h-4 mr-2" />
              )}
              Grup Oluştur ({selectedUsers.length} kişi)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
