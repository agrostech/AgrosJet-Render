import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatSidebar from "@/components/chat/ChatSidebar";
import MessagePane from "@/components/chat/MessagePane";
import NewChatModal from "@/components/chat/NewChatModal";
import useChatData from "@/hooks/useChatData";

export default function ChatPage({ userId, userName, userRole, companyId, onBack }) {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  
  const { 
    conversations, 
    loading, 
    refresh, 
    wsConnected,
    sendMessage,
    markAsRead
  } = useChatData(userId, companyId);

  // Handle window resize for mobile view
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle new conversation created
  const handleNewConversation = useCallback((conv) => {
    setShowNewChat(false);
    setSelectedConversation(conv);
    refresh();
  }, [refresh]);

  // Handle message sent
  const handleMessageSent = useCallback(() => {
    refresh();
  }, [refresh]);

  // Handle conversation select
  const handleSelectConversation = useCallback((conv) => {
    setSelectedConversation(conv);
    if (conv.unread_count > 0) {
      markAsRead(conv.id);
    }
  }, [markAsRead]);

  // Mobile: show message pane or sidebar
  const showMessagePane = selectedConversation && isMobileView;
  const showSidebar = !isMobileView || !selectedConversation;

  return (
    <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] flex flex-col" data-testid="chat-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-lg">Mesajlar</h1>
        </div>
        {wsConnected && (
          <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full">
            Canlı
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Sidebar - Conversation List */}
        {showSidebar && (
          <ChatSidebar
            conversations={conversations}
            selectedId={selectedConversation?.id}
            onSelect={handleSelectConversation}
            onNewChat={() => setShowNewChat(true)}
            currentUserId={userId}
            loading={loading}
          />
        )}

        {/* Message Pane */}
        {!isMobileView && (
          <MessagePane
            conversation={selectedConversation}
            userId={userId}
            userName={userName}
            userRole={userRole}
            companyId={companyId}
            onMessageSent={handleMessageSent}
            sendMessage={sendMessage}
          />
        )}

        {/* Mobile Message Pane (full screen) */}
        {showMessagePane && (
          <div className="absolute inset-0 z-50 bg-white">
            <MessagePane
              conversation={selectedConversation}
              userId={userId}
              userName={userName}
              userRole={userRole}
              companyId={companyId}
              onMessageSent={handleMessageSent}
              onBack={() => setSelectedConversation(null)}
              isMobile
              sendMessage={sendMessage}
            />
          </div>
        )}

        {/* Empty State for Desktop */}
        {!isMobileView && !selectedConversation && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Bir sohbet seçin veya yeni sohbet başlatın</p>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        open={showNewChat}
        onOpenChange={setShowNewChat}
        userId={userId}
        userName={userName}
        userRole={userRole}
        companyId={companyId}
        onConversationCreated={handleNewConversation}
      />
    </div>
  );
}
