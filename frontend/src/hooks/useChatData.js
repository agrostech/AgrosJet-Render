import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_URL = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');

export default function useChatData(userId, companyId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!userId || !companyId) return;
    try {
      const res = await axios.get(`${API}/chat/conversations/${userId}?company_id=${companyId}`);
      setConversations(res.data);
      
      // Calculate total unread
      const total = res.data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      setUnreadCount(total);
    } catch (err) {
      console.error("Chat fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, companyId]);

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId) => {
    if (!userId) return;
    try {
      await axios.post(`${API}/chat/conversations/${conversationId}/read-all?user_id=${userId}`);
      // Update local state
      setConversations(prev => prev.map(c => 
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      ));
      // Recalculate total unread
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Mark as read error:", err);
    }
  }, [userId]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!userId || !WS_URL) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(`${WS_URL}/api/chat/ws/${userId}`);
      
      ws.onopen = () => {
        console.log("Chat WebSocket connected");
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "new_message") {
            // Refresh conversations to get updated data
            fetchConversations();
          }
        } catch (err) {
          console.error("WS message parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("Chat WebSocket disconnected");
        setWsConnected(false);
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setWsConnected(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("WebSocket connection error:", err);
    }
  }, [userId, fetchConversations]);

  // Send message via WebSocket (for typing indicators etc.)
  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Initial fetch and WebSocket connection
  useEffect(() => {
    fetchConversations();
    connectWebSocket();

    // Fallback polling every 15 seconds if WS not connected
    const pollInterval = setInterval(() => {
      if (!wsConnected) {
        fetchConversations();
      }
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchConversations, connectWebSocket, wsConnected]);

  return {
    conversations,
    loading,
    unreadCount,
    wsConnected,
    refresh: fetchConversations,
    markAsRead,
    sendMessage
  };
}
