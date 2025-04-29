// index.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const cors = require("cors");

const allowedOrigins = ["http://localhost:3000", "*"]; // Your frontend URL

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true); // Allow all origins
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));


const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io/'
});

// Add connection logging
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", {
    req: err.req,      // the request object
    code: err.code,    // the error code, for example 1
    message: err.message, // the error message
    context: err.context  // some additional error context
  });
});

// In-memory room tracking
const roomUsers = {}; // roomId -> Set of socketIds
const userNames = {}; // socketId -> userName
const roomLeaders = {}; // roomId -> leaderSocketId

function emitRoomMembers(roomId) {
  const members = Array.from(roomUsers[roomId] || []).map(socketId => ({
    id: socketId,
    name: userNames[socketId],
    isLeader: socketId === roomLeaders[roomId]
  })).filter(member => member.name);
  io.to(roomId).emit('room-members', members);
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  console.log("Client transport:", socket.conn.transport.name);

  // Handle transport upgrade
  socket.conn.on("upgrade", (transport) => {
    console.log("Client transport upgraded to:", transport.name);
  });

  // Handle transport errors
  socket.conn.on("error", (error) => {
    console.error("Transport error:", error);
  });

  // Join a room for signaling/chat
  function joinRoom(roomId, userName, isLeader = false) {
    socket.join(roomId);
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Set();
      // If this is the first user, make them the leader
      if (isLeader) {
        roomLeaders[roomId] = socket.id;
      }
    }
    roomUsers[roomId].add(socket.id);
    userNames[socket.id] = userName;
    emitRoomMembers(roomId);
  }

  socket.on("join-room", ({ roomId, userName, isLeader = false }) => {
    joinRoom(roomId, userName, isLeader);
    socket.to(roomId).emit("user-connected", { userId: socket.id, userName });
    console.log(`User ${socket.id} (${userName}) joined room ${roomId}`);
  });

  socket.on('join-chat', ({ roomId, userName, isLeader = false }) => {
    joinRoom(roomId, userName, isLeader);
    io.to(roomId).emit('chat-message', {
      userName: 'System',
      text: `${userName} has joined the chat`,
      timestamp: new Date().toISOString(),
      socketId: null
    });
  });

  socket.on('kick-user', ({ roomId, userToKickId }) => {
    // Check if the requester is the leader
    if (roomLeaders[roomId] === socket.id) {
      const userName = userNames[userToKickId];
      if (userName && roomUsers[roomId]?.has(userToKickId)) {
        // Remove the user from the room
        roomUsers[roomId].delete(userToKickId);
        
        // Notify the kicked user
        io.to(userToKickId).emit('kicked-from-room', {
          roomId,
          reason: 'You have been kicked by the room leader.'
        });
        
        // Notify the room that user was kicked
        io.to(roomId).emit('chat-message', {
          userName: 'System',
          text: `${userName} has been kicked from the room`,
          timestamp: new Date().toISOString(),
          socketId: null
        });
        
        // Force leave the room for the kicked socket
        io.sockets.sockets.get(userToKickId)?.leave(roomId);
        
        // Update member list for remaining users
        emitRoomMembers(roomId);
      }
    }
  });

  // Get a random room with at least one user
  socket.on('get-random-room', (callback) => {
    const roomsWithUsers = Object.entries(roomUsers)
      .filter(([roomId, users]) => users.size > 0)
      .map(([roomId]) => roomId);
    if (roomsWithUsers.length === 0) {
      callback(null); // No rooms available
    } else {
      const randomRoom = roomsWithUsers[Math.floor(Math.random() * roomsWithUsers.length)];
      callback(randomRoom);
    }
  });

  // Relay signaling data (offer, answer, ICE candidates)
  socket.on("signal", (data) => {
    // data: { to, from, signal }
    console.log(`Signal from ${data.from} to ${data.to}`);
    io.to(data.to).emit("signal", {
      signal: data.signal,
      from: data.from,
      userName: data.userName
    });
  });

  socket.on('send-message', (messageData) => {
    io.to(messageData.roomId).emit('chat-message', messageData);
  });

  socket.on("leave-room", ({ roomId, userName }) => {
    socket.leave(roomId);
    if (roomUsers[roomId]) roomUsers[roomId].delete(socket.id);
    
    // If leader is leaving, assign a new leader if there are other users
    if (roomLeaders[roomId] === socket.id) {
      const remainingUsers = Array.from(roomUsers[roomId] || []);
      if (remainingUsers.length > 0) {
        // Assign the first remaining user as the new leader
        roomLeaders[roomId] = remainingUsers[0];
        const newLeaderName = userNames[remainingUsers[0]];
        io.to(roomId).emit('chat-message', {
          userName: 'System',
          text: `${newLeaderName} is now the room leader`,
          timestamp: new Date().toISOString(),
          socketId: null
        });
      } else {
        // No users left, delete room leader
        delete roomLeaders[roomId];
      }
    }
    
    // Only delete userName if not in any other room
    const stillInRooms = Object.values(roomUsers).some(set => set.has(socket.id));
    if (!stillInRooms) {
      delete userNames[socket.id];
    }
    
    emitRoomMembers(roomId);
    io.to(roomId).emit('chat-message', {
      userName: 'System',
      text: `${userName} has left the room`,
      timestamp: new Date().toISOString(),
      socketId: null
    });
    io.to(roomId).emit("user-disconnected", socket.id);
    console.log(`User ${userName} left room ${roomId}`);
  });

  socket.on("disconnect", () => {
    // Save the username before we remove it from our tracking
    const disconnectedUserName = userNames[socket.id];
    
    // Find all rooms this user was in
    const userRooms = [];
    for (const [roomId, users] of Object.entries(roomUsers)) {
      if (users.has(socket.id)) {
        userRooms.push(roomId);
      }
    }
    
    // Check if the disconnected user was a leader of any room
    const leadingRooms = Object.entries(roomLeaders)
      .filter(([_, leaderId]) => leaderId === socket.id)
      .map(([roomId]) => roomId);
                              
    // Assign new leaders for each room the disconnected user was leading
    leadingRooms.forEach(roomId => {
      const remainingUsers = Array.from(roomUsers[roomId] || [])
        .filter(id => id !== socket.id);
      if (remainingUsers.length > 0) {
        // Assign the first remaining user as the new leader
        roomLeaders[roomId] = remainingUsers[0];
        const newLeaderName = userNames[remainingUsers[0]];
        io.to(roomId).emit('chat-message', {
          userName: 'System',
          text: `${newLeaderName} is now the room leader`,
          timestamp: new Date().toISOString(),
          socketId: null
        });
      } else {
        // No users left, delete room leader
        delete roomLeaders[roomId];
      }
    });
    
    // Remove user from all rooms, update member lists, and notify remaining users
    userRooms.forEach(roomId => {
      if (roomUsers[roomId]) {
        roomUsers[roomId].delete(socket.id);
        
        // Notify room about user disconnection if we have their username
        if (disconnectedUserName) {
          io.to(roomId).emit('chat-message', {
            userName: 'System',
            text: `${disconnectedUserName} has disconnected`,
            timestamp: new Date().toISOString(),
            socketId: null
          });
        }
        
        emitRoomMembers(roomId);
        io.to(roomId).emit("user-disconnected", socket.id);
      }
    });
    
    // Finally delete the username
    delete userNames[socket.id];
    console.log("Client disconnected:", socket.id, disconnectedUserName ? `(${disconnectedUserName})` : '');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Signaling server listening on port ${PORT}`)
);