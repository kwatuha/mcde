import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { axiosInstance } from '../api';

const ChatContext = createContext();

/** Stable when chat is off — avoids a new context value every render. */
const CHAT_DISABLED_PROVIDER_VALUE = Object.freeze({
  socket: null,
  isConnected: false,
  rooms: [],
  activeRoom: null,
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  onlineUsers: new Set(),
  fetchRooms: () => Promise.resolve(),
  fetchMessages: () => Promise.resolve(),
  sendMessage: () => {},
  joinRoom: () => {},
  leaveRoom: () => {},
  createRoom: () => Promise.resolve(null),
  createRoleRoom: () => Promise.resolve(null),
  fetchRoles: () => Promise.resolve([]),
  fetchParticipants: () => Promise.resolve([]),
  uploadFile: () => Promise.resolve(null),
  getTotalUnreadCount: () => 0,
  setActiveRoom: () => {},
});

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  // Check if chat is enabled via environment variable (default to disabled)
  const chatEnabled = import.meta.env.VITE_ENABLE_CHAT === 'true';
  
  // If chat is disabled, return a no-op provider
  if (!chatEnabled) {
    return (
      <ChatContext.Provider value={CHAT_DISABLED_PROVIDER_VALUE}>
        {children}
      </ChatContext.Provider>
    );
  }
  
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Initialize Socket.IO connection
  useEffect(() => {
    
    if (user && token) {
      // Connect through nginx proxy for socket.io
      // Use environment variable or auto-detect from current location
      // If VITE_API_URL is set and is a full URL, use it for socket connection
      let socketUrl = import.meta.env.VITE_SOCKET_URL;
      
      if (!socketUrl) {
        // Try to derive from API URL if available
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl && apiUrl.startsWith('http')) {
          // Extract base URL from API URL (remove /api suffix if present)
          socketUrl = apiUrl.replace(/\/api\/?$/, '');
        } else {
          // In production, only connect if explicitly configured
          // In development, allow localhost connections
          if (import.meta.env.PROD && window.location.hostname !== 'localhost') {
            // Production mode and not localhost - don't attempt connection without explicit config
            return;
          }
          // Fall back to current location (development or localhost)
          socketUrl = window.location.protocol + '//' + window.location.host;
        }
      }
      
      const newSocket = io(socketUrl, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling'],
        timeout: 5000, // 5 second connection timeout
        reconnection: false, // Disable automatic reconnection to prevent error spam
        autoConnect: true,
        forceNew: false
      });
      
      // Suppress all socket.io internal error logging
      if (newSocket.io) {
        newSocket.io.on('error', () => {
          // Silently ignore transport errors
        });
      }

      newSocket.on('connect', () => {
        setIsConnected(true);
        newSocket.emit('join_rooms');
        // Fetch rooms when connected
        fetchRooms();
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        // Silently handle connection errors - chat is optional
        setIsConnected(false);
        // Suppress all error logging - chat feature is optional
        // Connection will be retried automatically but won't spam console
      });
      
      // Suppress timeout errors
      newSocket.on('error', () => {
        // Silently ignore all socket errors
        setIsConnected(false);
      });

      // Handle new messages
      newSocket.on('new_message', (messageData) => {
        const { roomId } = messageData;
        setMessages(prev => ({
          ...prev,
          [roomId]: [...(prev[roomId] || []), messageData]
        }));

        // Update unread count if not in active room
        if (activeRoom !== roomId) {
          setUnreadCounts(prev => ({
            ...prev,
            [roomId]: (prev[roomId] || 0) + 1
          }));
        }
      });

      // Handle typing indicators
      newSocket.on('user_typing', (data) => {
        const { userId, firstName, lastName, roomId } = data;
        setTypingUsers(prev => ({
          ...prev,
          [roomId]: {
            ...prev[roomId],
            [userId]: `${firstName} ${lastName}`
          }
        }));
      });

      newSocket.on('user_stopped_typing', (data) => {
        const { userId, roomId } = data;
        setTypingUsers(prev => {
          const newTyping = { ...prev };
          if (newTyping[roomId]) {
            delete newTyping[roomId][userId];
            if (Object.keys(newTyping[roomId]).length === 0) {
              delete newTyping[roomId];
            }
          }
          return newTyping;
        });
      });

      // Handle user join/leave
      newSocket.on('user_joined', (data) => {
        console.log(`${data.firstName} ${data.lastName} joined the room`);
        setOnlineUsers(prev => new Set([...prev, data.userId]));
      });

      newSocket.on('user_left', (data) => {
        console.log(`${data.firstName} ${data.lastName} left the room`);
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      });

      // Handle message reactions
      newSocket.on('message_reaction', (data) => {
        const { messageId, userId, firstName, lastName, reactionType, action } = data;
        // Update message reactions in state
        // This would require more complex state management for reactions
        console.log(`${firstName} ${lastName} ${action}ed reaction ${reactionType} to message ${messageId}`);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user, token]);

  // Fetch chat rooms
  const fetchRooms = useCallback(async () => {
    try {
      console.log('ChatContext - fetchRooms called');
      console.log('ChatContext - axiosInstance baseURL:', axiosInstance.defaults.baseURL);
      const response = await axiosInstance.get('/chat/rooms');
      console.log('ChatContext - Chat rooms response:', response.data);
      if (response.data.success) {
        setRooms(response.data.rooms);
        console.log('ChatContext - Set rooms count:', response.data.rooms.length);
        console.log('ChatContext - Rooms:', response.data.rooms);
        
        // Initialize unread counts
        const counts = {};
        response.data.rooms.forEach(room => {
          counts[room.room_id] = room.unread_count || 0;
        });
        setUnreadCounts(counts);
      } else {
        console.error('ChatContext - fetchRooms failed:', response.data);
      }
    } catch (error) {
      console.error('ChatContext - Error fetching chat rooms:', error);
      console.error('ChatContext - Error details:', error.response?.data);
      console.error('ChatContext - Error status:', error.response?.status);
    }
  }, []);

  // Fetch rooms on mount if user is authenticated
  useEffect(() => {
    console.log('ChatContext - useEffect triggered. User:', !!user, 'Token:', !!token);
    if (user && token) {
      console.log('User authenticated, fetching rooms...');
      fetchRooms();
    } else {
      console.log('ChatContext - User or token not available:', { user: !!user, token: !!token });
    }
  }, [user, token, fetchRooms]);

  // Fetch messages for a room
  const fetchMessages = useCallback(async (roomId, page = 1) => {
    try {
      console.log('ChatContext - fetchMessages called for room:', roomId, 'page:', page);
      console.log('ChatContext - axiosInstance baseURL:', axiosInstance.defaults.baseURL);
      
      const response = await axiosInstance.get(`/chat/rooms/${roomId}/messages?page=${page}&limit=50`);
      console.log('ChatContext - fetchMessages response status:', response.status);
      console.log('ChatContext - fetchMessages response:', response.data);
      
      if (response.data.success) {
        console.log('ChatContext - Setting messages for room', roomId, ':', response.data.messages.length, 'messages');
        
        // Debug: Log message structure for role-based rooms
        if (response.data.messages.length > 0) {
          console.log('ChatContext - Sample message structure:', {
            roomId,
            messageCount: response.data.messages.length,
            firstMessage: response.data.messages[0],
            hasFirstName: !!response.data.messages[0]?.firstName,
            hasLastName: !!response.data.messages[0]?.lastName,
            hasEmail: !!response.data.messages[0]?.email,
            hasSenderId: !!response.data.messages[0]?.sender_id
          });
        }
        
        setMessages(prev => ({
          ...prev,
          [roomId]: response.data.messages
        }));
        
        // Clear unread count for this room
        setUnreadCounts(prev => ({
          ...prev,
          [roomId]: 0
        }));
      } else {
        console.error('ChatContext - fetchMessages failed:', response.data);
      }
    } catch (error) {
      console.error('ChatContext - Error fetching messages:', error);
      console.error('ChatContext - Error status:', error.response?.status);
      console.error('ChatContext - Error details:', error.response?.data);
    }
  }, []);

  // Send message
  const sendMessage = useCallback((roomId, messageText, replyToMessageId = null) => {
    console.log('ChatContext - sendMessage called');
    console.log('ChatContext - roomId:', roomId);
    console.log('ChatContext - messageText:', messageText);
    console.log('ChatContext - socket:', !!socket);
    console.log('ChatContext - isConnected:', isConnected);
    
    if (socket && isConnected) {
      console.log('ChatContext - Emitting send_message event');
      socket.emit('send_message', {
        roomId,
        message_text: messageText,
        message_type: 'text',
        reply_to_message_id: replyToMessageId
      });
    } else {
      console.log('ChatContext - Cannot send message. socket:', !!socket, 'isConnected:', isConnected);
    }
  }, [socket, isConnected]);

  // Join room
  const joinRoom = useCallback((roomId) => {
    if (socket && isConnected) {
      socket.emit('join_room', roomId);
      setActiveRoom(roomId);
      fetchMessages(roomId);
    }
  }, [socket, isConnected, fetchMessages]);

  // Leave room
  const leaveRoom = useCallback((roomId) => {
    if (socket && isConnected) {
      socket.emit('leave_room', roomId);
      if (activeRoom === roomId) {
        setActiveRoom(null);
      }
    }
  }, [socket, isConnected, activeRoom]);

  // Create new room
  const createRoom = useCallback(async (roomData) => {
    try {
      console.log('ChatContext - Creating room with data:', roomData);
      const response = await axiosInstance.post('/chat/rooms', roomData);
      console.log('ChatContext - Create room response:', response.data);
      
      if (response.data.success) {
        console.log('ChatContext - Room created successfully, refreshing rooms...');
        await fetchRooms(); // Refresh rooms list
        return response.data.room_id;
      } else {
        console.error('ChatContext - Room creation failed:', response.data);
        throw new Error(response.data.message || 'Room creation failed');
      }
    } catch (error) {
      console.error('ChatContext - Error creating room:', error);
      console.error('ChatContext - Error response:', error.response?.data);
      throw error;
    }
  }, [fetchRooms]);

  // Create role-based room
  const createRoleRoom = useCallback(async (roleId) => {
    try {
      console.log('ChatContext - Creating role-based room for role:', roleId);
      const response = await axiosInstance.post(`/chat/rooms/role/${roleId}`);
      console.log('ChatContext - Create role room response:', response.data);
      
      if (response.data.success) {
        console.log('ChatContext - Role room created successfully, refreshing rooms...');
        await fetchRooms(); // Refresh rooms list
        return response.data.room_id;
      } else {
        console.error('ChatContext - Role room creation failed:', response.data);
        throw new Error(response.data.message || 'Role room creation failed');
      }
    } catch (error) {
      console.error('ChatContext - Error creating role room:', error);
      console.error('ChatContext - Error response:', error.response?.data);
      throw error;
    }
  }, [fetchRooms]);

  // Fetch available roles
  const fetchRoles = useCallback(async () => {
    try {
      console.log('ChatContext - Fetching roles');
      const response = await axiosInstance.get('/chat/roles');
      console.log('ChatContext - Roles response:', response.data);
      
      if (response.data.success) {
        return response.data.roles;
      } else {
        console.error('ChatContext - fetchRoles failed:', response.data);
        return [];
      }
    } catch (error) {
      console.error('ChatContext - Error fetching roles:', error);
      return [];
    }
  }, []);

  // Fetch room participants
  const fetchParticipants = useCallback(async (roomId) => {
    try {
      console.log('ChatContext - Fetching participants for room:', roomId);
      console.log('ChatContext - axiosInstance baseURL:', axiosInstance.defaults.baseURL);
      const response = await axiosInstance.get(`/chat/rooms/${roomId}/participants`);
      console.log('ChatContext - Participants response status:', response.status);
      console.log('ChatContext - Participants response:', response.data);
      if (response.data.success) {
        console.log('ChatContext - Returning participants:', response.data.participants);
        return response.data.participants;
      } else {
        console.error('ChatContext - fetchParticipants failed:', response.data);
        return [];
      }
    } catch (error) {
      console.error('ChatContext - Error fetching participants:', error);
      console.error('ChatContext - Error status:', error.response?.status);
      console.error('ChatContext - Error details:', error.response?.data);
      return [];
    }
  }, []);

  // Upload file
  const uploadFile = useCallback(async (roomId, file) => {
    try {
      console.log('ChatContext - uploadFile called');
      console.log('ChatContext - roomId:', roomId);
      console.log('ChatContext - file:', file.name, file.size, file.type);
      
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('ChatContext - Sending file upload request to:', `/chat/rooms/${roomId}/upload`);
      const response = await axiosInstance.post(`/chat/rooms/${roomId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log('ChatContext - Upload response:', response.data);
      
      if (response.data.success) {
        // File upload creates a message automatically
        // Refresh messages for the room to show the uploaded file
        console.log('ChatContext - File uploaded successfully, refreshing messages');
        fetchMessages(roomId);
        return response.data;
      } else {
        throw new Error(response.data.message || 'File upload failed');
      }
    } catch (error) {
      console.error('ChatContext - Error uploading file:', error);
      console.error('ChatContext - Error details:', error.response?.data);
      throw error;
    }
  }, [fetchMessages]);

  // Start typing indicator
  const startTyping = useCallback((roomId) => {
    if (socket && isConnected) {
      socket.emit('typing_start', { roomId });
    }
  }, [socket, isConnected]);

  // Stop typing indicator
  const stopTyping = useCallback((roomId) => {
    if (socket && isConnected) {
      socket.emit('typing_stop', { roomId });
    }
  }, [socket, isConnected]);

  // Add reaction to message
  const addReaction = useCallback((messageId, reactionType) => {
    if (socket && isConnected) {
      socket.emit('add_reaction', { messageId, reactionType });
    }
  }, [socket, isConnected]);

  // Remove reaction from message
  const removeReaction = useCallback((messageId, reactionType) => {
    if (socket && isConnected) {
      socket.emit('remove_reaction', { messageId, reactionType });
    }
  }, [socket, isConnected]);

  // Get total unread count
  const getTotalUnreadCount = useCallback(() => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0);
  }, [unreadCounts]);

  // Get typing users for a room
  const getTypingUsers = useCallback((roomId) => {
    return typingUsers[roomId] ? Object.values(typingUsers[roomId]) : [];
  }, [typingUsers]);

  const value = {
    // Connection state
    isConnected,
    socket,
    
    // Data
    rooms,
    activeRoom,
    messages,
    unreadCounts,
    onlineUsers,
    
    // Actions
    fetchRooms,
    fetchMessages,
    fetchParticipants,
    sendMessage,
    joinRoom,
    leaveRoom,
    createRoom,
    createRoleRoom,
    fetchRoles,
    uploadFile,
    setActiveRoom,
    
    // Typing indicators
    startTyping,
    stopTyping,
    getTypingUsers,
    
    // Reactions
    addReaction,
    removeReaction,
    
    // Utilities
    getTotalUnreadCount
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export { ChatContext };
export default ChatProvider;
