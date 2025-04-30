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

// Game state tracking
const gameStates = {}; // roomId -> game state
const roomTimers = {}; // roomId -> timer interval

// Sample prompts for the game
const PROMPTS = [
  "A dancing penguin",
  "A space alien eating pizza",
  "A flying elephant",
  "A cat riding a skateboard",
  "A monkey taking a selfie",
  "A robot playing basketball",
  "A submarine in the sky",
  "A dragon drinking coffee",
  "A zombie at the beach",
  "A pineapple wearing sunglasses",
  "A giraffe on a unicycle",
  "A dog driving a car",
  "A banana with arms and legs",
  "A frog playing a guitar",
  "A cow jumping over the moon",
  "A snowman at the beach",
  "A teddy bear lifting weights",
  "A pig flying a kite",
  "A turtle wearing roller skates",
  "A chicken crossing the road"
];

function emitRoomMembers(roomId) {
  const members = Array.from(roomUsers[roomId] || []).map(socketId => ({
    id: socketId,
    name: userNames[socketId],
    isLeader: socketId === roomLeaders[roomId]
  })).filter(member => member.name);
  io.to(roomId).emit('room-members', members);
}

// Generate random drawing prompts
function getRandomPrompts(count = 3) {
  const shuffled = [...PROMPTS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Start game timer
function startTimer(roomId, duration, onTimerTick, onTimerEnd) {
  let timeLeft = duration;
  
  // Clear any existing timer for this room
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
  }
  
  // Emit initial time
  io.to(roomId).emit('timer-update', timeLeft);
  
  // Set up the interval
  roomTimers[roomId] = setInterval(() => {
    timeLeft -= 1;
    
    // Call the tick callback
    if (onTimerTick) {
      onTimerTick(timeLeft);
    }
    
    // Emit time update to clients
    io.to(roomId).emit('timer-update', timeLeft);
    
    // Check if timer is done
    if (timeLeft <= 0) {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
      
      // Call the end callback
      if (onTimerEnd) {
        onTimerEnd();
      }
    }
  }, 1000);
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

  // Start a new game
  socket.on('start-game', ({ roomId, settings }) => {
    console.log('Starting game in room:', roomId, 'with settings:', settings);
    
    // Check if user is leader
    if (roomLeaders[roomId] !== socket.id) {
      console.log('Non-leader tried to start game:', socket.id);
      return;
    }
    
    // Get players in the room
    const players = Array.from(roomUsers[roomId] || [])
      .map(id => ({ 
        id, 
        name: userNames[id],
        isLeader: id === roomLeaders[roomId]
      }))
      .filter(p => p.name);
      
    if (players.length < 2) {
      console.log('Not enough players to start the game');
      return;
    }
    
    // Initialize game state
    gameStates[roomId] = {
      gameState: 'prompt_selection',
      players,
      currentRound: 1,
      totalRounds: Math.min(players.length * 2, 10), // Set reasonable max rounds
      activePlayerIndex: 0,
      activePlayer: players[0],
      countdown: 30, // Time to select a prompt
      settings,
      scores: {}
    };
    
    // Initialize scores
    players.forEach(player => {
      gameStates[roomId].scores[player.id] = {
        name: player.name,
        total: 0,
        roundScore: 0
      };
    });
    
    // Generate prompts for the active player
    const drawingPrompts = getRandomPrompts(3);
    
    // Notify all clients about game state
    io.to(roomId).emit('game-state-update', {
      gameState: gameStates[roomId].gameState,
      activePlayer: gameStates[roomId].activePlayer,
      currentRound: gameStates[roomId].currentRound,
      totalRounds: gameStates[roomId].totalRounds,
      countdown: gameStates[roomId].countdown,
      drawingPrompts
    });
    
    // Start a timer for prompt selection
    startTimer(
      roomId, 
      30, 
      (timeLeft) => {
        gameStates[roomId].countdown = timeLeft;
      },
      () => {
        // If time runs out and no prompt selected, pick a random one
        if (gameStates[roomId].gameState === 'prompt_selection') {
          const randomPrompt = drawingPrompts[Math.floor(Math.random() * drawingPrompts.length)];
          
          // Move to drawing phase
          gameStates[roomId].gameState = 'drawing';
          gameStates[roomId].prompt = randomPrompt;
          gameStates[roomId].countdown = settings.drawingTime;
          
          // Notify all clients
          io.to(roomId).emit('game-state-update', {
            gameState: gameStates[roomId].gameState,
            activePlayer: gameStates[roomId].activePlayer,
            prompt: randomPrompt,
            countdown: gameStates[roomId].countdown
          });
          
          // Start drawing timer
          startTimer(
            roomId,
            settings.drawingTime,
            (timeLeft) => {
              gameStates[roomId].countdown = timeLeft;
            },
            () => {
              // Time's up for drawing, move to submitting lies
              if (gameStates[roomId].gameState === 'drawing') {
                moveToSubmittingLies(roomId);
              }
            }
          );
        }
      }
    );
    
    console.log('Game started in room:', roomId);
  });
  
  // Handle prompt selection
  socket.on('select-prompt', ({ roomId, prompt }) => {
    const gameState = gameStates[roomId];
    
    // Verify this is the active player
    if (!gameState || gameState.activePlayer.id !== socket.id || gameState.gameState !== 'prompt_selection') {
      return;
    }
    
    // Set the prompt and move to drawing phase
    gameState.prompt = prompt;
    gameState.gameState = 'drawing';
    gameState.countdown = gameState.settings.drawingTime;
    
    // Notify all clients
    io.to(roomId).emit('game-state-update', {
      gameState: gameState.gameState,
      activePlayer: gameState.activePlayer,
      prompt,
      countdown: gameState.countdown
    });
    
    // Clear the prompt selection timer and start drawing timer
    if (roomTimers[roomId]) {
      clearInterval(roomTimers[roomId]);
    }
    
    startTimer(
      roomId,
      gameState.settings.drawingTime,
      (timeLeft) => {
        gameState.countdown = timeLeft;
      },
      () => {
        // Time's up for drawing, move to submitting lies
        if (gameState.gameState === 'drawing') {
          moveToSubmittingLies(roomId);
        }
      }
    );
  });
  
  // Handle drawing updates
  socket.on('drawing-update', ({ roomId, dataUrl }) => {
    const gameState = gameStates[roomId];
    
    // Verify this is the active player
    if (!gameState || gameState.activePlayer.id !== socket.id || gameState.gameState !== 'drawing') {
      return;
    }
    
    // Store the drawing and broadcast to all clients
    gameState.drawing = dataUrl;
    io.to(roomId).emit('drawing-update', dataUrl);
  });
  
  // Function to move to submitting lies phase
  function moveToSubmittingLies(roomId) {
    const gameState = gameStates[roomId];
    
    gameState.gameState = 'submitting_lies';
    gameState.countdown = gameState.settings.submittingTime;
    gameState.lies = [{
      id: 'truth',
      text: gameState.prompt,
      playerId: gameState.activePlayer.id,
      playerName: gameState.activePlayer.name,
      isCorrect: true,
      votes: []
    }];
    
    // Notify all clients
    io.to(roomId).emit('game-state-update', {
      gameState: gameState.gameState,
      countdown: gameState.countdown
    });
    
    startTimer(
      roomId,
      gameState.settings.submittingTime,
      (timeLeft) => {
        gameState.countdown = timeLeft;
      },
      () => {
        // Time's up for submitting lies, move to voting
        if (gameState.gameState === 'submitting_lies') {
          moveToVoting(roomId);
        }
      }
    );
  }
  
  // Handle lie submissions
  socket.on('submit-lie', ({ roomId, lie, submitterId, submitterName }) => {
    const gameState = gameStates[roomId];
    
    // Verify we're in the right phase and this isn't the active player
    if (!gameState || gameState.gameState !== 'submitting_lies' || submitterId === gameState.activePlayer.id) {
      return;
    }
    
    // Check if player already submitted a lie
    const existingLie = gameState.lies.find(l => l.playerId === submitterId);
    if (existingLie) {
      // Update existing lie
      existingLie.text = lie;
    } else {
      // Add new lie
      gameState.lies.push({
        id: `lie-${submitterId}`,
        text: lie,
        playerId: submitterId,
        playerName: submitterName,
        isCorrect: false,
        votes: []
      });
    }
    
    // Notify clients about submission progress (not the actual lies yet)
    io.to(roomId).emit('lies-update', gameState.lies.map(l => ({
      playerName: l.playerName,
      playerId: l.playerId
    })));
    
    // If all players have submitted, move to voting phase
    const nonActivePlayerCount = gameState.players.length - 1;
    const submissionCount = gameState.lies.length - 1; // Subtract 1 for the truth
    
    if (submissionCount >= nonActivePlayerCount) {
      // Everyone has submitted, move to voting
      if (roomTimers[roomId]) {
        clearInterval(roomTimers[roomId]);
      }
      moveToVoting(roomId);
    }
  });
  
  // Function to move to voting phase
  function moveToVoting(roomId) {
    const gameState = gameStates[roomId];
    
    gameState.gameState = 'voting';
    gameState.countdown = gameState.settings.votingTime;
    
    // Shuffle the lies so the truth isn't always in the same position
    gameState.lies = gameState.lies.sort(() => 0.5 - Math.random());
    
    // Notify all clients
    io.to(roomId).emit('game-state-update', {
      gameState: gameState.gameState,
      countdown: gameState.countdown
    });
    
    // Send the lies to all clients
    io.to(roomId).emit('lies-update', gameState.lies.map(l => ({
      id: l.id,
      text: l.text,
      playerId: l.playerId,
      playerName: l.playerName
    })));
    
    startTimer(
      roomId,
      gameState.settings.votingTime,
      (timeLeft) => {
        gameState.countdown = timeLeft;
      },
      () => {
        // Time's up for voting, move to results
        if (gameState.gameState === 'voting') {
          showResults(roomId);
        }
      }
    );
  }
  
  // Handle votes
  socket.on('vote', ({ roomId, lieId, voterId, voterName }) => {
    const gameState = gameStates[roomId];
    
    // Verify we're in the right phase and this isn't the active player
    if (!gameState || gameState.gameState !== 'voting') {
      return;
    }
    
    // Find the lie being voted for
    const votedLie = gameState.lies.find(l => l.id === lieId);
    if (!votedLie) return;
    
    // Check if player already voted
    const existingVote = gameState.lies.some(l => l.votes.some(v => v.voterId === voterId));
    if (existingVote) return;
    
    // Add the vote
    votedLie.votes.push({ voterId, voterName });
    
    // If all players have voted, move to results
    const nonActivePlayerCount = gameState.players.length - 1;
    const totalVotes = gameState.lies.reduce((sum, lie) => sum + lie.votes.length, 0);
    
    if (totalVotes >= nonActivePlayerCount) {
      // Everyone has voted, move to results
      if (roomTimers[roomId]) {
        clearInterval(roomTimers[roomId]);
      }
      showResults(roomId);
    }
  });
  
  // Function to show results
  function showResults(roomId) {
    const gameState = gameStates[roomId];
    
    gameState.gameState = 'results';
    
    // Calculate scores
    const truthLie = gameState.lies.find(l => l.isCorrect);
    
    // Award points for votes on the truth and for having your lie voted on
    gameState.lies.forEach(lie => {
      // If this is the truth, the drawer gets points for every vote
      if (lie.isCorrect && lie.votes.length > 0) {
        const score = lie.votes.length * 500;
        gameState.scores[lie.playerId].roundScore += score;
        gameState.scores[lie.playerId].total += score;
      } 
      // If this is a lie, the liar gets points for every vote
      else if (!lie.isCorrect && lie.votes.length > 0) {
        const score = lie.votes.length * 100;
        gameState.scores[lie.playerId].roundScore += score;
        gameState.scores[lie.playerId].total += score;
      }
      
      // Players who correctly voted for the truth get points
      if (lie.isCorrect) {
        lie.votes.forEach(vote => {
          const score = 200;
          if (gameState.scores[vote.voterId]) {
            gameState.scores[vote.voterId].roundScore += score;
            gameState.scores[vote.voterId].total += score;
          }
        });
      }
    });
    
    // Prepare results object
    const results = {
      prompt: gameState.prompt,
      drawing: gameState.drawing,
      lies: gameState.lies,
      scores: gameState.scores
    };
    
    // Send results to clients
    io.to(roomId).emit('round-results', results);
  }
  
  // Handle next round
  socket.on('next-round', ({ roomId }) => {
    const gameState = gameStates[roomId];
    
    // Verify this is the leader
    if (!gameState || roomLeaders[roomId] !== socket.id) {
      return;
    }
    
    // Reset round-specific state
    gameState.currentRound++;
    gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
    gameState.activePlayer = gameState.players[gameState.activePlayerIndex];
    gameState.gameState = 'prompt_selection';
    gameState.countdown = 30;
    gameState.lies = [];
    gameState.drawing = null;
    gameState.prompt = null;
    
    // Reset round scores
    Object.values(gameState.scores).forEach(score => {
      score.roundScore = 0;
    });
    
    // Generate prompts for the next player
    const drawingPrompts = getRandomPrompts(3);
    
    // Notify all clients
    io.to(roomId).emit('game-state-update', {
      gameState: gameState.gameState,
      activePlayer: gameState.activePlayer,
      currentRound: gameState.currentRound,
      totalRounds: gameState.totalRounds,
      countdown: gameState.countdown,
      drawingPrompts
    });
    
    // Start timer for prompt selection
    startTimer(
      roomId, 
      30, 
      (timeLeft) => {
        gameState.countdown = timeLeft;
      },
      () => {
        // If time runs out and no prompt selected, pick a random one
        if (gameState.gameState === 'prompt_selection') {
          const randomPrompt = drawingPrompts[Math.floor(Math.random() * drawingPrompts.length)];
          
          // Move to drawing phase
          gameState.gameState = 'drawing';
          gameState.prompt = randomPrompt;
          gameState.countdown = gameState.settings.drawingTime;
          
          // Notify all clients
          io.to(roomId).emit('game-state-update', {
            gameState: gameState.gameState,
            activePlayer: gameState.activePlayer,
            prompt: randomPrompt,
            countdown: gameState.countdown
          });
          
          // Start drawing timer
          startTimer(
            roomId,
            gameState.settings.drawingTime,
            (timeLeft) => {
              gameState.countdown = timeLeft;
            },
            () => {
              // Time's up for drawing, move to submitting lies
              if (gameState.gameState === 'drawing') {
                moveToSubmittingLies(roomId);
              }
            }
          );
        }
      }
    );
  });
  
  // Handle end game
  socket.on('end-game', ({ roomId }) => {
    // Verify this is the leader
    if (roomLeaders[roomId] !== socket.id) {
      return;
    }
    
    // Clear any active timers
    if (roomTimers[roomId]) {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
    }
    
    // Clean up game state
    delete gameStates[roomId];
    
    // Notify all clients
    io.to(roomId).emit('game-reset');
    io.to(roomId).emit('chat-message', {
      userName: 'System',
      text: 'The game has ended',
      timestamp: new Date().toISOString(),
      socketId: null
    });
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