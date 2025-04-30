"use client"
import { useState, useEffect, useRef } from "react"
import io from "socket.io-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const SIGNALING_SERVER = process.env.NEXT_PUBLIC_SIGNALING_SERVER || "http://localhost:5000"

// Function to generate random avatar URL
const getRandomAvatar = (name) => {
  // Using DiceBear avatars API
  const seed = name || Math.random().toString(36).substring(2, 8)
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

// Function to get initials from name
const getInitials = (name) => {
  if (!name) return "?"
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)
}

const Chat = ({ roomId, userName, socket, isMobile }) => {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [socketId, setSocketId] = useState(null)
  const [members, setMembers] = useState([])
  const [isLeader, setIsLeader] = useState(false)
  const [players, setPlayers] = useState([])
  const socketRef = useRef(socket)
  const messagesEndRef = useRef()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    // Update ref when socket prop changes
    socketRef.current = socket;
    
    if (!socket) return;
    
    console.log("Using socket from parent with ID:", socket.id);
    setSocketId(socket.id);
    
    // No need to join-chat here as the parent component handles joining

    // Set up event listeners
    socket.on("chat-message", (message) => {
      console.log("Received message:", message);
      setMessages((prev) => [...prev, message]);
    });

    // Listen for room-members event
    socket.on("room-members", (memberList) => {
      console.log("Room members received:", memberList);
      setMembers(memberList);
      
      // Convert members to players
      const playersList = memberList.map(member => ({
        id: member.id,
        name: member.name,
        isLeader: member.isLeader
      }));
      setPlayers(playersList);
      console.log("Players updated:", playersList);
      
      // Check if current user is the leader
      const currentUser = memberList.find(m => m.id === socket.id);
      setIsLeader(currentUser?.isLeader || false);
    });

    socket.on("kicked-from-room", ({ roomId, reason }) => {
      alert(reason);
      // Store the kicked status in sessionStorage for the homepage to display
      sessionStorage.setItem('wasKicked', 'true');
      // Redirect to home page
      window.location.href = '/';
    });

    return () => {
      // Cleanup event listeners but don't disconnect (parent component handles that)
      if (socket) {
        socket.off("chat-message");
        socket.off("room-members");
        socket.off("kicked-from-room");
      }
    };
  }, [socket, roomId, userName]);

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = (e) => {
    e.preventDefault()
    if (newMessage.trim() && socketRef.current) {
      const messageData = {
        roomId,
        userName,
        text: newMessage,
        timestamp: new Date().toISOString(),
        socketId: socketRef.current.id,
      }
      socketRef.current.emit("send-message", messageData)
      setNewMessage("")
    }
  }

  const handleKickUser = (userId) => {
    if (isLeader && userId !== socketId && socketRef.current) {
      if (confirm('Are you sure you want to kick this user?')) {
        socketRef.current.emit("kick-user", {
          roomId,
          userToKickId: userId
        });
      }
    }
  };

  return (
    <div className={`flex w-full ${isMobile ? "flex-col" : "md:flex-row-reverse"}`}>
      {/* Chat area - now positioned at the right */}
      <div
        className={`flex flex-col ${isMobile ? "h-[70vh]" : "h-[400px] md:h-[600px]"} w-full md:w-80 bg-white ${!isMobile && "rounded-lg shadow-md"}`}
      >
        {!isMobile && (
          <div className="p-3 border-b">
            <h2 className="text-lg font-semibold">Chat Room</h2>
          </div>
        )}
        <div className="flex-1 p-3 overflow-y-auto">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-3 ${msg.socketId === socketId ? "ml-auto" : ""}`}>
              <div className="font-semibold text-xs sm:text-sm text-gray-600">
                {msg.socketId === socketId ? "You" : msg.userName}
              </div>
              <div
                className={`rounded-lg p-2 mt-1 text-sm max-w-[80%] ${
                  msg.socketId === socketId ? "bg-blue-500 text-white ml-auto" : "bg-gray-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="p-3 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Member list sidebar - now positioned at the left with avatars */}
      {!isMobile && (
        <div className="hidden md:flex flex-col h-[400px] md:h-[600px] w-64 bg-white rounded-lg shadow-md mr-4 p-3">
          <h3 className="text-md font-semibold mb-2">Members</h3>
          <ul className="flex-1 overflow-y-auto">
            {members.length === 0 ? (
              <li className="text-gray-500 text-sm">No members</li>
            ) : (
              members.map((member) => (
                <li key={member.id} className="flex justify-between items-center text-sm py-1 px-2 mb-1 rounded hover:bg-gray-100">
                  <div className="flex items-center">
                    <span className={`mr-1 ${member.id === socketId ? 'font-bold' : ''}`}>
                      {member.id === socketId ? 'You' : member.name}
                    </span>
                    {member.isLeader && (
                      <span className="text-xs bg-yellow-500 text-white px-1 rounded-sm ml-1">Leader</span>
                    )}
                  </div>
                  {isLeader && member.id !== socketId && (
                    <button 
                      onClick={() => handleKickUser(member.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                      title="Kick user"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default Chat
