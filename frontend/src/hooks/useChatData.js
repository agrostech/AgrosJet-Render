import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function useChatData(userId, companyId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchConversations = useCallback(async () => {
    if (!userId || !companyId) return;
    try {
      const res = await axios.get(`${API}/chat/conversations/${userId}?company_id=${companyId}`);
      setConversations(res.data);
    } catch (err) {
      console.error("Chat fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, companyId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId || !companyId) return;
    try {
      const res = await axios.get(`${API}/chat/unread-count/${userId}?company_id=${companyId}`);
      setUnreadCount(res.data.count);
    } catch (err) {
      console.error("Unread count error:", err);
    }
  }, [userId, companyId]);

  useEffect(() => {
    fetchConversations();
    fetchUnreadCount();
    
    // Poll every 10 seconds for new messages
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnreadCount();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchConversations, fetchUnreadCount]);

  return {
    conversations,
    loading,
    unreadCount,
    refresh: fetchConversations,
    refreshUnread: fetchUnreadCount
  };
}
