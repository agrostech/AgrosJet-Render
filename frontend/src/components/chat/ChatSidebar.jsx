import { Search, Plus, MessageCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function ChatSidebar({ 
  conversations, 
  selectedId, 
  onSelect, 
  onNewChat,
  currentUserId,
  loading = false
}) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter(c => {
    if (!search.trim()) return true;
    const name = c.is_group 
      ? c.group_name 
      : c.participant_names?.find((n, i) => c.participant_ids[i] !== currentUserId);
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  const getDisplayName = (conv) => {
    if (conv.is_group) return conv.group_name || "Grup";
    const idx = conv.participant_ids?.findIndex(id => id !== currentUserId);
    return conv.participant_names?.[idx] || "Sohbet";
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) { // Today
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="w-full md:w-80 border-r border-slate-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">Mesajlar</h2>
          <Button size="sm" variant="outline" onClick={onNewChat} className="h-8">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Henüz sohbet yok</p>
          </div>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                selectedId === conv.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {getDisplayName(conv)}
                    </span>
                    {conv.is_group && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-muted-foreground">
                        Grup
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.last_sender_name && `${conv.last_sender_name.split(' ')[0]}: `}
                      {conv.last_message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(conv.last_message_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary text-white rounded-full min-w-[18px] text-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
