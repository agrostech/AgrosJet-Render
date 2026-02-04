import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  File, 
  X, 
  Download,
  Loader2,
  Check,
  CheckCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MessagePane({ 
  conversation, 
  userId, 
  userName, 
  userRole, 
  companyId,
  onMessageSent, 
  onBack, 
  isMobile,
  sendMessage: wsSendMessage
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch messages when conversation changes
  const fetchMessages = useCallback(async () => {
    if (!conversation?.id) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/chat/conversations/${conversation.id}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error("Messages fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [conversation?.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get display name for conversation
  const getConversationName = () => {
    if (!conversation) return "";
    if (conversation.is_group) return conversation.group_name || "Grup";
    const idx = conversation.participant_ids?.findIndex(id => id !== userId);
    return conversation.participant_names?.[idx] || "Sohbet";
  };

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Dosya boyutu 10MB'dan küçük olmalıdır");
      return;
    }

    setAttachedFile(file);
  };

  // Upload file
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversation_id", conversation.id);
    formData.append("sender_id", userId);

    const res = await axios.post(`${API}/chat/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  };

  // Send message
  const handleSend = async () => {
    if ((!text.trim() && !attachedFile) || !conversation?.id) return;

    setSending(true);
    try {
      let fileData = null;
      
      // Upload file first if attached
      if (attachedFile) {
        setUploading(true);
        fileData = await uploadFile(attachedFile);
        setUploading(false);
      }

      // Determine message type
      let messageType = "text";
      if (fileData) {
        const ext = attachedFile.name.toLowerCase();
        if (ext.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          messageType = "image";
        } else {
          messageType = "file";
        }
      }

      // Send message via API
      const payload = {
        conversation_id: conversation.id,
        sender_id: userId,
        sender_name: userName,
        sender_role: userRole,
        content: text.trim() || (fileData ? fileData.file_name : ""),
        message_type: messageType,
        file_url: fileData?.file_url || null,
        file_name: fileData?.file_name || null
      };

      const res = await axios.post(`${API}/chat/messages`, payload);
      
      // Add to local messages
      setMessages(prev => [...prev, res.data]);
      
      // Clear input
      setText("");
      setAttachedFile(null);
      
      // Notify parent
      onMessageSent?.();

    } catch (err) {
      console.error("Send message error:", err);
      toast.error("Mesaj gönderilemedi");
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Handle enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format time
  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  // Format date separator
  const formatDateSeparator = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return "Bugün";
    if (date.toDateString() === yesterday.toDateString()) return "Dün";
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg, idx) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const prevDateKey = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
    
    if (dateKey !== prevDateKey) {
      groups.push({ type: 'separator', date: msg.created_at });
    }
    groups.push({ type: 'message', data: msg });
    return groups;
  }, []);

  if (!conversation) return null;

  return (
    <div className={`flex flex-col h-full ${isMobile ? '' : 'flex-1'}`} data-testid="message-pane">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-slate-50">
        {isMobile && onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="p-1">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{getConversationName()}</h3>
          {conversation.is_group && (
            <p className="text-[10px] text-muted-foreground">
              {conversation.participant_names?.join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groupedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Henüz mesaj yok. İlk mesajı gönderin!
          </div>
        ) : (
          groupedMessages.map((item, idx) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${idx}`} className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] text-muted-foreground px-2">
                    {formatDateSeparator(item.date)}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              );
            }

            const msg = item.data;
            const isOwn = msg.sender_id === userId;
            
            return (
              <div 
                key={msg.id} 
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] md:max-w-[70%] rounded-lg px-3 py-2 ${
                    isOwn 
                      ? 'bg-primary text-white rounded-br-none' 
                      : 'bg-white border shadow-sm rounded-bl-none'
                  }`}
                >
                  {/* Sender name for group chats */}
                  {!isOwn && conversation.is_group && (
                    <p className={`text-[10px] font-medium mb-1 ${isOwn ? 'text-white/70' : 'text-primary'}`}>
                      {msg.sender_name}
                    </p>
                  )}

                  {/* Image message */}
                  {msg.message_type === "image" && msg.file_url && (
                    <a 
                      href={`${process.env.REACT_APP_BACKEND_URL}${msg.file_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block mb-1"
                    >
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL}${msg.file_url}`} 
                        alt={msg.file_name || "Resim"}
                        className="max-w-full rounded max-h-60 object-cover"
                      />
                    </a>
                  )}

                  {/* File message */}
                  {msg.message_type === "file" && msg.file_url && (
                    <a 
                      href={`${process.env.REACT_APP_BACKEND_URL}${msg.file_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 p-2 rounded mb-1 ${
                        isOwn ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <File className="w-5 h-5 flex-shrink-0" />
                      <span className="text-xs truncate flex-1">{msg.file_name}</span>
                      <Download className="w-4 h-4 flex-shrink-0" />
                    </a>
                  )}

                  {/* Text content */}
                  {msg.content && msg.message_type === "text" && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}

                  {/* Time and read status */}
                  <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                    <span className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-muted-foreground'}`}>
                      {formatTime(msg.created_at)}
                    </span>
                    {isOwn && (
                      msg.read_by?.length > 1 
                        ? <CheckCheck className="w-3 h-3 text-white/60" />
                        : <Check className="w-3 h-3 text-white/60" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached file preview */}
      {attachedFile && (
        <div className="px-3 py-2 border-t bg-slate-50">
          <div className="flex items-center gap-2 p-2 bg-white rounded border">
            {attachedFile.type.startsWith("image/") ? (
              <ImageIcon className="w-4 h-4 text-primary" />
            ) : (
              <File className="w-4 h-4 text-primary" />
            )}
            <span className="text-xs truncate flex-1">{attachedFile.name}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setAttachedFile(null)}
              className="p-1 h-auto"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t bg-white">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="*/*"
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="p-2"
            data-testid="chat-attach-btn"
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </Button>
          
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mesajınızı yazın..."
            disabled={sending}
            className="flex-1"
            data-testid="chat-input"
          />
          
          <Button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !attachedFile)}
            size="sm"
            className="px-3"
            data-testid="chat-send-btn"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
