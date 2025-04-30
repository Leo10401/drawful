// GameArea.jsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Clock, Edit3, User, Award, X, Check, ChevronRight } from "lucide-react";

// Game states
const STATES = {
  WAITING: "waiting",
  PROMPT_SELECTION: "prompt_selection",
  DRAWING: "drawing",
  SUBMITTING_LIES: "submitting_lies",
  VOTING: "voting",
  RESULTS: "results",
};

const GameArea = ({ roomId, userName, socket }) => {
  // Game state
  const [gameState, setGameState] = useState(STATES.WAITING);
  const [players, setPlayers] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [activePlayer, setActivePlayer] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [drawing, setDrawing] = useState(null);
  const [drawingPrompts, setDrawingPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [lies, setLies] = useState([]);
  const [submission, setSubmission] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [roundResults, setRoundResults] = useState(null);
  const [isLeader, setIsLeader] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [hasSubmittedLie, setHasSubmittedLie] = useState(false);
  const [gameSettings, setGameSettings] = useState({
    drawingTime: 60,
    submittingTime: 45,
    votingTime: 30,
  });

  // Canvas refs
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const lastPositionRef = useRef(null);
  const socketRef = useRef(socket);

  // Effect for setting up socket listeners
  useEffect(() => {
    // Update ref when socket prop changes
    socketRef.current = socket;
    
    if (!socket) return;
    
    console.log("GameArea: Using socket with ID:", socket.id);

    // Update players list when room members change
    socket.on("room-members", (memberList) => {
      console.log("GameArea: Room members received:", memberList);
      
      // Convert members to players for the game
      const playersList = memberList.map(member => ({
        id: member.id,
        name: member.name,
        isLeader: member.isLeader
      }));
      setPlayers(playersList);
      
      // Check if current user is the leader
      const currentUser = memberList.find(m => m.id === socket.id);
      setIsLeader(currentUser?.isLeader || false);
    });

    // Game state events
    socket.on("game-state-update", (state) => {
      setGameState(state.gameState);
      
      if (state.activePlayer) {
        setActivePlayer(state.activePlayer);
      }
      
      if (state.currentRound) {
        setCurrentRound(state.currentRound);
      }
      
      if (state.totalRounds) {
        setTotalRounds(state.totalRounds);
      }
      
      if (state.countdown !== undefined) {
        setCountdown(state.countdown);
      }
      
      if (state.prompt) {
        setPrompt(state.prompt);
      }
      
      if (state.drawingPrompts) {
        setDrawingPrompts(state.drawingPrompts);
      }
    });

    // Drawing update events
    socket.on("drawing-update", (dataUrl) => {
      if (gameState === STATES.DRAWING || gameState === STATES.SUBMITTING_LIES || gameState === STATES.VOTING) {
        setDrawing(dataUrl);
      }
    });

    // Receive lies
    socket.on("lies-update", (liesData) => {
      setLies(liesData);
    });

    // Results update
    socket.on("round-results", (results) => {
      setRoundResults(results);
      setGameState(STATES.RESULTS);
    });

    // Clear game state when needed
    socket.on("game-reset", () => {
      resetGame();
    });

    // Timer updates
    socket.on("timer-update", (time) => {
      setCountdown(time);
    });

    return () => {
      // Clean up event listeners but don't disconnect (parent component handles that)
      if (socket) {
        socket.off("room-members");
        socket.off("game-state-update");
        socket.off("drawing-update");
        socket.off("lies-update");
        socket.off("round-results");
        socket.off("game-reset");
        socket.off("timer-update");
      }
    };
  }, [socket, gameState]);

  // Canvas setup effect
  useEffect(() => {
    if (gameState === STATES.DRAWING && socket?.id === activePlayer?.id) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      const context = canvas.getContext("2d");
      context.lineCap = "round";
      context.strokeStyle = "black";
      context.lineWidth = 5;
      contextRef.current = context;
      
      // Clear canvas
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [gameState, activePlayer, socket?.id]);

  // Timer hook
  useEffect(() => {
    if (countdown <= 0) return;

    // Let the server handle timer countdown - we'll just display it
  }, [countdown]);

  // Reset game state
  const resetGame = () => {
    setGameState(STATES.WAITING);
    setCurrentRound(1);
    setActivePlayer(null);
    setCountdown(0);
    setPrompt("");
    setDrawing(null);
    setDrawingPrompts([]);
    setSelectedPrompt("");
    setLies([]);
    setSubmission("");
    setIsDrawing(false);
    setRoundResults(null);
    setHasVoted(false);
    setHasSubmittedLie(false);
  };

  // Start game function (leader only)
  const startGame = () => {
    if (!isLeader || !socketRef.current) return;
    socketRef.current.emit("start-game", {
      roomId,
      settings: gameSettings
    });
  };

  // Drawing functions
  const startDrawing = (e) => {
    if (gameState !== STATES.DRAWING || socketRef.current?.id !== activePlayer?.id) return;
    
    setIsDrawing(true);
    const pos = getCanvasCoordinates(e);
    lastPositionRef.current = pos;
    
    // Draw a dot at the start position
    const context = contextRef.current;
    context.beginPath();
    context.arc(pos.x, pos.y, 2, 0, 2 * Math.PI);
    context.fillStyle = "#000000";
    context.fill();
    
    // Send initial point to other players
    sendDrawingUpdate();
  };

  const draw = (e) => {
    if (!isDrawing || gameState !== STATES.DRAWING || socketRef.current?.id !== activePlayer?.id) return;
    
    const pos = getCanvasCoordinates(e);
    const context = contextRef.current;
    
    context.beginPath();
    context.moveTo(lastPositionRef.current.x, lastPositionRef.current.y);
    context.lineTo(pos.x, pos.y);
    context.stroke();
    
    lastPositionRef.current = pos;
    
    // Send drawing update at regular intervals for efficiency
    sendDrawingUpdate();
  };

  const stopDrawing = () => {
    if (gameState !== STATES.DRAWING || socketRef.current?.id !== activePlayer?.id) return;
    setIsDrawing(false);
    sendDrawingUpdate();
  };

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    // Handle both mouse and touch events
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const sendDrawingUpdate = () => {
    if (!socketRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataUrl = canvas.toDataURL();
    socketRef.current.emit("drawing-update", {
      roomId,
      dataUrl
    });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    sendDrawingUpdate();
  };

  // Game flow functions
  const selectPrompt = (prompt) => {
    if (!socketRef.current) return;
    setSelectedPrompt(prompt);
    socketRef.current.emit("select-prompt", { roomId, prompt });
  };

  const submitLie = () => {
    if (!submission.trim() || !socketRef.current) return;
    
    socketRef.current.emit("submit-lie", {
      roomId,
      lie: submission.trim(),
      submitterId: socketRef.current.id,
      submitterName: userName
    });
    
    setSubmission("");
    setHasSubmittedLie(true);
  };

  const vote = (lieId) => {
    if (hasVoted || !socketRef.current) return;
    
    socketRef.current.emit("vote", {
      roomId,
      lieId,
      voterId: socketRef.current.id,
      voterName: userName
    });
    
    setHasVoted(true);
  };

  const nextRound = () => {
    if (!isLeader || !socketRef.current) return;
    socketRef.current.emit("next-round", { roomId });
  };

  const endGame = () => {
    if (!isLeader || !socketRef.current) return;
    socketRef.current.emit("end-game", { roomId });
  };

  const updateGameSettings = (setting, value) => {
    setGameSettings({
      ...gameSettings,
      [setting]: value
    });
  };

  // Render different game states
  const renderGameContent = () => {
    switch (gameState) {
      case STATES.WAITING:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <h2 className="text-2xl font-bold text-indigo-600">Waiting for players</h2>
            
            <div className="w-full max-w-md">
              <h3 className="text-lg font-medium mb-2">Players ({players.length}):</h3>
              <ul className="bg-gray-50 rounded-md p-4">
                {players.map(player => (
                    <li key={player.id} className="flex items-center mb-2">
                        
                    <User size={18} className="mr-2 text-gray-500" />
                    <span>
                      {player.id === socket?.id ? `${player.name} (You)` : player.name}
                      {player.isLeader && ' (Leader)'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            
            {isLeader && players.length >= 2 && (
              <div className="w-full max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Drawing Time (seconds):
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="120"
                    value={gameSettings.drawingTime}
                    onChange={(e) => updateGameSettings('drawingTime', parseInt(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Submitting Lies Time (seconds):
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="90"
                    value={gameSettings.submittingTime}
                    onChange={(e) => updateGameSettings('submittingTime', parseInt(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Voting Time (seconds):
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="60"
                    value={gameSettings.votingTime}
                    onChange={(e) => updateGameSettings('votingTime', parseInt(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <button 
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  onClick={startGame}
                >
                  Start Game
                </button>
              </div>
            )}
            
            {!isLeader && (
              <div className="text-gray-500">
                Waiting for the leader to start the game...
              </div>
            )}
          </div>
        );

      case STATES.PROMPT_SELECTION:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center">
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                <Clock size={18} className="inline mr-2" />
                <span>{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold">
                {activePlayer?.id === socket?.id ? "Choose Your Prompt" : `${activePlayer?.name} is choosing a prompt...`}
              </h2>
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                Round {currentRound}/{totalRounds}
              </div>
            </div>
            
            {activePlayer?.id === socket?.id ? (
              <div className="w-full max-w-md">
                <div className="space-y-2">
                  {drawingPrompts.map((promptOption, index) => (
                    <button
                      key={index}
                      className={`w-full p-3 text-left border rounded-md ${
                        selectedPrompt === promptOption
                          ? "bg-indigo-100 border-indigo-500"
                          : "bg-white border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() => selectPrompt(promptOption)}
                    >
                      {promptOption}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="animate-pulse flex flex-col items-center space-y-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            )}
          </div>
        );

      case STATES.DRAWING:
        return (
          <div className="flex flex-col items-center space-y-6 p-4">
            <div className="w-full flex justify-between items-center">
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                <Clock size={18} className="inline mr-2" />
                <span>{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold">
                {activePlayer?.id === socket?.id 
                  ? `Draw: ${prompt}` 
                  : `${activePlayer?.name} is drawing...`}
              </h2>
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                Round {currentRound}/{totalRounds}
              </div>
            </div>
            
            <div className="relative border-2 border-gray-300 rounded-md w-full max-w-lg aspect-[4/3] bg-white">
              {activePlayer?.id === socket?.id ? (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              ) : (
                drawing ? (
                  <img 
                    src={drawing} 
                    alt="Player's drawing" 
                    className="w-full h-full object-contain" 
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Waiting for {activePlayer?.name} to draw...</p>
                  </div>
                )
              )}
            </div>
            
            {activePlayer?.id === socket?.id && (
              <div className="flex space-x-4">
                <button 
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  onClick={clearCanvas}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        );

      case STATES.SUBMITTING_LIES:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center">
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                <Clock size={18} className="inline mr-2" />
                <span>{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold">What is this?</h2>
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                Round {currentRound}/{totalRounds}
              </div>
            </div>
            
            {drawing && (
              <div className="border-2 border-gray-300 rounded-md overflow-hidden max-w-lg w-full">
                <img 
                  src={drawing} 
                  alt="Player drawing" 
                  className="w-full object-contain"
                />
              </div>
            )}
            
            {/* Don't show input to the active player (who knows the real answer) */}
            {activePlayer?.id !== socket?.id ? (
              hasSubmittedLie ? (
                <div className="text-green-600 flex items-center">
                  <Check className="mr-2" />
                  Your answer has been submitted!
                </div>
              ) : (
                <div className="w-full max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What do you think this is? (Make it believable!)
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      className="flex-1 p-2 border border-gray-300 rounded-l-md focus:ring-indigo-500 focus:border-indigo-500"
                      value={submission}
                      onChange={(e) => setSubmission(e.target.value)}
                      placeholder="Enter your answer..."
                      maxLength={60}
                    />
                    <button 
                      className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700"
                      onClick={submitLie}
                      disabled={!submission}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="text-indigo-600">
                This is your drawing! Wait for others to submit their answers.
              </div>
            )}

            <div className="w-full max-w-md">
              <div className="text-sm text-gray-600 mb-2">
                {lies.length} answer{lies.length !== 1 ? 's' : ''} submitted so far
              </div>
              <div className="flex flex-wrap gap-2">
                {lies.map((lie, idx) => (
                  <div key={idx} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                    {lie.playerName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case STATES.VOTING:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center">
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                <Clock size={18} className="inline mr-2" />
                <span>{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold">Vote for the truth!</h2>
              <div className="bg-indigo-100 px-4 py-2 rounded-md">
                Round {currentRound}/{totalRounds}
              </div>
            </div>
            
            {drawing && (
              <div className="border-2 border-gray-300 rounded-md overflow-hidden max-w-lg w-full">
                <img 
                  src={drawing} 
                  alt="Player drawing" 
                  className="w-full object-contain"
                />
              </div>
            )}
            
            {hasVoted ? (
              <div className="text-green-600 flex items-center">
                <Check className="mr-2" />
                Your vote has been submitted! Waiting for others...
              </div>
            ) : (
              <div className="w-full max-w-md grid gap-3">
                {lies.map(lie => (
                  <button
                    key={lie.id}
                    className="p-3 bg-white border border-gray-300 rounded-md hover:bg-indigo-50 text-left"
                    onClick={() => vote(lie.id)}
                    disabled={lie.playerId === socket?.id || hasVoted}
                  >
                    {lie.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case STATES.RESULTS:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <h2 className="text-2xl font-bold text-indigo-600">Round Results</h2>
            
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium">
                {activePlayer?.name}'s drawing of: <span className="font-bold">{roundResults?.prompt}</span>
              </h3>
            </div>
            
            {drawing && (
              <div className="border-2 border-gray-300 rounded-md overflow-hidden mb-6 max-w-lg w-full">
                <img src={drawing} alt="Player drawing" className="w-full object-contain" />
              </div>
            )}
            
            <div className="w-full max-w-md">
              <h3 className="text-lg font-medium mb-2">Answers & Votes:</h3>
              <ul className="bg-gray-50 rounded-md divide-y divide-gray-200">
                {roundResults?.lies.map(lie => (
                  <li key={lie.id} className="p-3">
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium">{lie.text}</div>
                      <div className="text-sm bg-gray-200 px-2 py-1 rounded">
                        {lie.votes?.length || 0} vote{lie.votes?.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 flex justify-between">
                      <div>
                        by {lie.isCorrect ? (
                          <span className="text-green-600 font-medium">TRUTH</span>
                        ) : lie.playerName}
                      </div>
                      <div>
                        {lie.isCorrect ? (
                          <span className="text-green-600">+500 pts per vote</span>
                        ) : (
                          <span className="text-indigo-600">+100 pts per vote</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Voted by: </span>
                      {lie.votes?.length ? lie.votes.map(v => v.voterName).join(", ") : "No one"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="w-full max-w-md mt-4">
              <h3 className="text-lg font-medium mb-2">Scoreboard:</h3>
              <ul className="bg-gray-50 rounded-md divide-y divide-gray-200">
                {roundResults?.scores && Object.entries(roundResults.scores)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([playerId, scoreData]) => (
                    <li key={playerId} className="p-3 flex justify-between items-center">
                      <div className="flex items-center">
                        <User size={18} className="mr-2 text-gray-500" />
                        <span>{scoreData.name}</span>
                        {playerId === socket?.id && <span className="ml-1 text-gray-500">(You)</span>}
                      </div>
                      <div className="flex items-center">
                        <span className="font-bold">{scoreData.total} pts</span>
                        {scoreData.roundScore > 0 && (
                          <span className="ml-2 text-green-600">+{scoreData.roundScore}</span>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
            
            {isLeader && (
              <div className="flex space-x-4 mt-4">
                <button 
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  onClick={endGame}
                >
                  End Game
                </button>
                {currentRound < totalRounds && (
                  <button 
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    onClick={nextRound}
                  >
                    Next Round
                  </button>
                )}
                {currentRound >= totalRounds && (
                  <button 
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    onClick={endGame}
                  >
                    Finish Game
                  </button>
                )}
              </div>
            )}
            
            {!isLeader && (
              <div className="text-gray-500">
                Waiting for the leader to {currentRound < totalRounds ? "start next round" : "end the game"}...
              </div>
            )}
          </div>
        );

      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center">
            <Edit3 className="mr-2" /> Drawful
          </h2>
          {gameState !== STATES.WAITING && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Award size={20} className="mr-2" /> 
                <span>Round {currentRound}/{totalRounds}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4">
        {renderGameContent()}
      </div>
    </div>
  );
};

export default GameArea;