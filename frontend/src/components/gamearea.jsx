"use client"
import { useState, useEffect, useRef } from "react"
import {
  Clock,
  Edit3,
  User,
  Award,
  X,
  Check,
  ChevronRight,
  AlertCircle,
  Palette,
  Timer,
  Trophy,
  Crown,
} from "lucide-react"
import DrawingCanvas from "@/components/sketch"
import { Button } from "@/components/ui/button"

// Game states
const STATES = {
  WAITING: "waiting",
  PROMPT_SELECTION: "prompt_selection",
  DRAWING: "drawing",
  SUBMITTING_LIES: "submitting_lies",
  VOTING: "voting",
  RESULTS: "results",
}

const GameArea = ({ roomId, userName, socket }) => {
  // Game state
  const [gameState, setGameState] = useState(STATES.WAITING)
  const [players, setPlayers] = useState([])
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(3)
  const [activePlayer, setActivePlayer] = useState(null)
  const [countdown, setCountdown] = useState(0)
  const [prompt, setPrompt] = useState("")
  const [drawing, setDrawing] = useState(null)
  const [drawingPrompts, setDrawingPrompts] = useState([])
  const [selectedPrompt, setSelectedPrompt] = useState("")
  const [lies, setLies] = useState([])
  const [submission, setSubmission] = useState("")
  const [isDrawing, setIsDrawing] = useState(false)
  const [roundResults, setRoundResults] = useState(null)
  const [isLeader, setIsLeader] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [hasSubmittedLie, setHasSubmittedLie] = useState(false)
  const [gameSettings, setGameSettings] = useState({
    drawingTime: 60,
    submittingTime: 45,
    votingTime: 30,
  })

  // Canvas ref
  const drawingCanvasRef = useRef(null)
  const socketRef = useRef(socket)

  // Effect for setting up socket listeners
  useEffect(() => {
    // Update ref when socket prop changes
    socketRef.current = socket

    if (!socket) return

    console.log("GameArea: Using socket with ID:", socket.id)

    // Update players list when room members change
    socket.on("room-members", (memberList) => {
      console.log("GameArea: Room members received:", memberList)

      // Convert members to players for the game
      const playersList = memberList.map((member) => ({
        id: member.id,
        name: member.name,
        isLeader: member.isLeader,
      }))
      setPlayers(playersList)

      // Check if current user is the leader
      const currentUser = memberList.find((m) => m.id === socket.id)
      setIsLeader(currentUser?.isLeader || false)
    })

    // Game state events
    socket.on("game-state-update", (state) => {
      setGameState(state.gameState)

      if (state.activePlayer) {
        setActivePlayer(state.activePlayer)
      }

      if (state.currentRound) {
        setCurrentRound(state.currentRound)
      }

      if (state.totalRounds) {
        setTotalRounds(state.totalRounds)
      }

      if (state.countdown !== undefined) {
        setCountdown(state.countdown)
      }

      if (state.prompt) {
        setPrompt(state.prompt)
      }

      if (state.drawingPrompts) {
        setDrawingPrompts(state.drawingPrompts)
      }
    })

    // Drawing update events
    socket.on("drawing-update", (dataUrl) => {
      if (gameState === STATES.DRAWING || gameState === STATES.SUBMITTING_LIES || gameState === STATES.VOTING) {
        setDrawing(dataUrl)
      }
    })

    // Receive lies
    socket.on("lies-update", (liesData) => {
      setLies(liesData)
    })

    // Results update
    socket.on("round-results", (results) => {
      setRoundResults(results)
      setGameState(STATES.RESULTS)
    })

    // Clear game state when needed
    socket.on("game-reset", () => {
      resetGame()
    })

    // Timer updates
    socket.on("timer-update", (time) => {
      setCountdown(time)
    })

    return () => {
      // Clean up event listeners but don't disconnect (parent component handles that)
      if (socket) {
        socket.off("room-members")
        socket.off("game-state-update")
        socket.off("drawing-update")
        socket.off("lies-update")
        socket.off("round-results")
        socket.off("game-reset")
        socket.off("timer-update")
      }
    }
  }, [socket, gameState])

  // Reset game state
  const resetGame = () => {
    setGameState(STATES.WAITING)
    setCurrentRound(1)
    setActivePlayer(null)
    setCountdown(0)
    setPrompt("")
    setDrawing(null)
    setDrawingPrompts([])
    setSelectedPrompt("")
    setLies([])
    setSubmission("")
    setIsDrawing(false)
    setRoundResults(null)
    setHasVoted(false)
    setHasSubmittedLie(false)
  }

  // Start game function (leader only)
  const startGame = () => {
    if (!isLeader || !socketRef.current) return
    socketRef.current.emit("start-game", {
      roomId,
      settings: gameSettings,
    })
  }

  // Send drawing update to other players
  const sendDrawingUpdate = async () => {
    if (!socketRef.current || !drawingCanvasRef.current) return

    try {
      const dataUrl = await drawingCanvasRef.current.getDataUrl()
      socketRef.current.emit("drawing-update", {
        roomId,
        dataUrl,
      })
    } catch (error) {
      console.error("Error sending drawing update:", error)
    }
  }

  // Game flow functions
  const selectPrompt = (prompt) => {
    if (!socketRef.current) return
    setSelectedPrompt(prompt)
    socketRef.current.emit("select-prompt", { roomId, prompt })
  }

  const submitLie = () => {
    if (!submission.trim() || !socketRef.current) return

    socketRef.current.emit("submit-lie", {
      roomId,
      lie: submission.trim(),
      submitterId: socketRef.current.id,
      submitterName: userName,
    })

    setSubmission("")
    setHasSubmittedLie(true)
  }

  const vote = (lieId) => {
    if (hasVoted || !socketRef.current) return

    socketRef.current.emit("vote", {
      roomId,
      lieId,
      voterId: socketRef.current.id,
      voterName: userName,
    })

    setHasVoted(true)
  }

  const nextRound = () => {
    if (!isLeader || !socketRef.current) return
    socketRef.current.emit("next-round", { roomId })
  }

  const endGame = () => {
    if (!isLeader || !socketRef.current) return
    socketRef.current.emit("end-game", { roomId })
  }

  const updateGameSettings = (setting, value) => {
    setGameSettings({
      ...gameSettings,
      [setting]: value,
    })
  }

  // Render different game states
  const renderGameContent = () => {
    switch (gameState) {
      case STATES.WAITING:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <h2 className="text-2xl font-bold text-indigo-600">Waiting for Players</h2>

            <div className="w-full max-w-md">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <User size={18} className="mr-2 text-indigo-500" />
                Players ({players.length})
              </h3>
              <ul className="bg-indigo-50 rounded-md p-4 divide-y divide-indigo-100">
                {players.map((player) => (
                  <li key={player.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3 text-xs font-medium">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">
                        {player.id === socket?.id ? `${player.name} (You)` : player.name}
                      </span>
                    </div>
                    {player.isLeader && (
                      <span className="ml-2 text-xs bg-yellow-500 text-white px-2 py-0.5 rounded flex items-center">
                        <Crown size={12} className="mr-1" />
                        Leader
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {isLeader && players.length >= 2 && (
              <div className="w-full max-w-md space-y-4 bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-medium text-gray-700">Game Settings</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Timer size={16} className="mr-1" />
                    Drawing Time (seconds)
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="5"
                    value={gameSettings.drawingTime}
                    onChange={(e) => updateGameSettings("drawingTime", Number.parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>30s</span>
                    <span>{gameSettings.drawingTime}s</span>
                    <span>120s</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Timer size={16} className="mr-1" />
                    Submitting Lies Time (seconds)
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    step="5"
                    value={gameSettings.submittingTime}
                    onChange={(e) => updateGameSettings("submittingTime", Number.parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>30s</span>
                    <span>{gameSettings.submittingTime}s</span>
                    <span>90s</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Timer size={16} className="mr-1" />
                    Voting Time (seconds)
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="5"
                    value={gameSettings.votingTime}
                    onChange={(e) => updateGameSettings("votingTime", Number.parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>20s</span>
                    <span>{gameSettings.votingTime}s</span>
                    <span>60s</span>
                  </div>
                </div>

                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={startGame}>
                  <Play size={18} className="mr-2" />
                  Start Game
                </Button>
              </div>
            )}

            {!isLeader && (
              <div className="text-gray-500 flex items-center bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <AlertCircle size={20} className="mr-2 text-yellow-500" />
                Waiting for the leader to start the game...
              </div>
            )}
          </div>
        )

      case STATES.PROMPT_SELECTION:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center bg-indigo-50 p-3 rounded-lg">
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Clock size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold text-indigo-700">
                {activePlayer?.id === socket?.id
                  ? "Choose Your Prompt"
                  : `${activePlayer?.name} is choosing a prompt...`}
              </h2>
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Award size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">
                  Round {currentRound}/{totalRounds}
                </span>
              </div>
            </div>

            {activePlayer?.id === socket?.id ? (
              <div className="w-full max-w-md">
                <div className="space-y-3">
                  {drawingPrompts.map((promptOption, index) => (
                    <button
                      key={index}
                      className={`w-full p-4 text-left border rounded-lg transition-all ${
                        selectedPrompt === promptOption
                          ? "bg-indigo-100 border-indigo-500 shadow-md"
                          : "bg-white border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() => selectPrompt(promptOption)}
                    >
                      <div className="flex items-center">
                        <Palette size={18} className="mr-3 text-indigo-500" />
                        <span className="font-medium">{promptOption}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <AlertCircle size={16} className="inline mr-2 text-indigo-500" />
                  Select a prompt that you'll draw for others to guess
                </div>
              </div>
            ) : (
              <div className="animate-pulse flex flex-col items-center space-y-4 w-full max-w-md">
                <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
                <div className="flex items-center justify-center text-indigo-500 mt-4">
                  <AlertCircle size={20} className="mr-2" />
                  <span className="text-gray-600">Waiting for {activePlayer?.name} to choose...</span>
                </div>
              </div>
            )}
          </div>
        )

      case STATES.DRAWING:
        return (
          <div className="flex flex-col items-center space-y-6 p-4">
            <div className="w-full flex justify-between items-center bg-indigo-50 p-3 rounded-lg">
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Clock size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold text-indigo-700">
                {activePlayer?.id === socket?.id ? `Draw: ${prompt}` : `${activePlayer?.name} is drawing...`}
              </h2>
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Award size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">
                  Round {currentRound}/{totalRounds}
                </span>
              </div>
            </div>

            <div className="relative w-full max-w-lg aspect-[4/3] bg-white shadow-md overflow-hidden rounded-lg border-2 border-indigo-200">
              {activePlayer?.id === socket?.id ? (
                <DrawingCanvas ref={drawingCanvasRef} width="100%" height="100%" onDrawingChange={sendDrawingUpdate} />
              ) : drawing ? (
                <img
                  src={drawing || "/placeholder.svg"}
                  alt="Player's drawing"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-3"></div>
                    <p className="text-gray-500">Waiting for {activePlayer?.name} to draw...</p>
                  </div>
                </div>
              )}
            </div>

            {activePlayer?.id === socket?.id && (
              <div className="flex space-x-4">
                <Button
                  variant="destructive"
                  onClick={() => drawingCanvasRef.current?.clearCanvas()}
                  className="flex items-center"
                >
                  <X size={18} className="mr-2" />
                  Clear Canvas
                </Button>
              </div>
            )}
          </div>
        )

      case STATES.SUBMITTING_LIES:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center bg-indigo-50 p-3 rounded-lg">
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Clock size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold text-indigo-700">What is this?</h2>
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Award size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">
                  Round {currentRound}/{totalRounds}
                </span>
              </div>
            </div>

            {drawing && (
              <div className="border-2 border-indigo-200 rounded-lg overflow-hidden max-w-lg w-full shadow-md">
                <img src={drawing || "/placeholder.svg"} alt="Player drawing" className="w-full object-contain" />
              </div>
            )}

            {/* Don't show input to the active player (who knows the real answer) */}
            {activePlayer?.id !== socket?.id ? (
              hasSubmittedLie ? (
                <div className="text-green-600 flex items-center bg-green-50 p-4 rounded-lg border border-green-200 w-full max-w-md">
                  <Check className="mr-2" />
                  Your answer has been submitted! Waiting for others...
                </div>
              ) : (
                <div className="w-full max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What do you think this is? (Make it believable!)
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      className="flex-1 p-3 border border-gray-300 rounded-l-md focus:ring-indigo-500 focus:border-indigo-500"
                      value={submission}
                      onChange={(e) => setSubmission(e.target.value)}
                      placeholder="Enter your answer..."
                      maxLength={60}
                    />
                    <Button
                      className="rounded-l-none bg-indigo-600 hover:bg-indigo-700"
                      onClick={submitLie}
                      disabled={!submission}
                    >
                      <Check size={18} className="mr-2" />
                      Submit
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="text-indigo-600 bg-indigo-50 p-4 rounded-lg border border-indigo-200 w-full max-w-md">
                <AlertCircle size={18} className="inline mr-2" />
                This is your drawing! Wait for others to submit their answers.
              </div>
            )}

            <div className="w-full max-w-md">
              <div className="text-sm text-gray-600 mb-2 flex items-center">
                <User size={16} className="mr-2" />
                {lies.length} answer{lies.length !== 1 ? "s" : ""} submitted so far
              </div>
              <div className="flex flex-wrap gap-2">
                {lies.map((lie, idx) => (
                  <div key={idx} className="px-3 py-1 bg-indigo-100 rounded-full text-sm text-indigo-700">
                    {lie.playerName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case STATES.VOTING:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <div className="w-full flex justify-between items-center bg-indigo-50 p-3 rounded-lg">
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Clock size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">{countdown}s</span>
              </div>
              <h2 className="text-xl font-bold text-indigo-700">Vote for the truth!</h2>
              <div className="flex items-center px-3 py-1 bg-white rounded-md shadow-sm">
                <Award size={18} className="mr-2 text-indigo-500" />
                <span className="font-medium">
                  Round {currentRound}/{totalRounds}
                </span>
              </div>
            </div>

            {drawing && (
              <div className="border-2 border-indigo-200 rounded-lg overflow-hidden max-w-lg w-full shadow-md">
                <img src={drawing || "/placeholder.svg"} alt="Player drawing" className="w-full object-contain" />
              </div>
            )}

            {hasVoted ? (
              <div className="text-green-600 flex items-center bg-green-50 p-4 rounded-lg border border-green-200 w-full max-w-md">
                <Check className="mr-2" />
                Your vote has been submitted! Waiting for others...
              </div>
            ) : (
              <div className="w-full max-w-md grid gap-3">
                {lies.map((lie) => (
                  <button
                    key={lie.id}
                    className="p-4 bg-white border border-gray-300 rounded-md hover:bg-indigo-50 text-left transition-colors flex items-center"
                    onClick={() => vote(lie.id)}
                    disabled={lie.playerId === socket?.id || hasVoted}
                  >
                    <span className="mr-2 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium">
                      {lie.playerId === socket?.id ? "You" : lie.playerName.charAt(0).toUpperCase()}
                    </span>
                    {lie.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )

      case STATES.RESULTS:
        return (
          <div className="flex flex-col items-center space-y-6 p-6">
            <h2 className="text-2xl font-bold text-indigo-600 flex items-center">
              <Trophy size={24} className="mr-2" />
              Round Results
            </h2>

            <div className="text-center mb-4 bg-indigo-50 p-3 rounded-lg w-full max-w-md">
              <h3 className="text-lg font-medium">
                {activePlayer?.name}'s drawing of:{" "}
                <span className="font-bold text-indigo-700">{roundResults?.prompt}</span>
              </h3>
            </div>

            {drawing && (
              <div className="border-2 border-indigo-200 rounded-lg overflow-hidden mb-6 max-w-lg w-full shadow-md">
                <img src={drawing || "/placeholder.svg"} alt="Player drawing" className="w-full object-contain" />
              </div>
            )}

            <div className="w-full max-w-md">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <Award size={18} className="mr-2 text-indigo-500" />
                Answers & Votes
              </h3>
              <ul className="bg-white rounded-md divide-y divide-gray-200 border border-gray-200 shadow-sm">
                {roundResults?.lies.map((lie) => (
                  <li key={lie.id} className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium text-lg">{lie.text}</div>
                      <div className="text-sm bg-indigo-100 px-3 py-1 rounded-full text-indigo-700 font-medium">
                        {lie.votes?.length || 0} vote{lie.votes?.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="mr-2">by</span>
                        {lie.isCorrect ? (
                          <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded">TRUTH</span>
                        ) : (
                          <span className="font-medium">{lie.playerName}</span>
                        )}
                      </div>
                      <div>
                        {lie.isCorrect ? (
                          <span className="text-green-600 font-medium">+500 pts per vote</span>
                        ) : (
                          <span className="text-indigo-600 font-medium">+100 pts per vote</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-sm bg-gray-50 p-2 rounded">
                      <span className="font-medium">Voted by: </span>
                      {lie.votes?.length ? lie.votes.map((v) => v.voterName).join(", ") : "No one"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="w-full max-w-md mt-4">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <Trophy size={18} className="mr-2 text-indigo-500" />
                Scoreboard
              </h3>
              <ul className="bg-white rounded-md divide-y divide-gray-200 border border-gray-200 shadow-sm">
                {roundResults?.scores &&
                  Object.entries(roundResults.scores)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([playerId, scoreData], index) => (
                      <li key={playerId} className="p-3 flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3 text-xs font-medium">
                            {index + 1}
                          </div>
                          <span className="font-medium">{scoreData.name}</span>
                          {playerId === socket?.id && <span className="ml-1 text-gray-500">(You)</span>}
                        </div>
                        <div className="flex items-center">
                          <span className="font-bold text-lg">{scoreData.total} pts</span>
                          {scoreData.roundScore > 0 && (
                            <span className="ml-2 text-green-600 bg-green-50 px-2 py-0.5 rounded">
                              +{scoreData.roundScore}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
              </ul>
            </div>

            {isLeader && (
              <div className="flex space-x-4 mt-4">
                <Button variant="outline" onClick={endGame} className="flex items-center">
                  <X size={18} className="mr-2" />
                  End Game
                </Button>
                {currentRound < totalRounds && (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={nextRound}>
                    <ChevronRight size={18} className="mr-2" />
                    Next Round
                  </Button>
                )}
                {currentRound >= totalRounds && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={endGame}>
                    <Trophy size={18} className="mr-2" />
                    Finish Game
                  </Button>
                )}
              </div>
            )}

            {!isLeader && (
              <div className="text-gray-500 flex items-center bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <AlertCircle size={20} className="mr-2 text-yellow-500" />
                Waiting for the leader to {currentRound < totalRounds ? "start next round" : "end the game"}...
              </div>
            )}
          </div>
        )

      default:
        return <div>Loading...</div>
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b bg-indigo-50">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center text-indigo-700">
            <Edit3 className="mr-2" /> Drawful
          </h2>
          {gameState !== STATES.WAITING && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center bg-white px-3 py-1 rounded-md shadow-sm">
                <Award size={20} className="mr-2 text-indigo-500" />
                <span className="font-medium">
                  Round {currentRound}/{totalRounds}
                </span>
              </div>
              {activePlayer && (
                <div className="flex items-center bg-white px-3 py-1 rounded-md shadow-sm">
                  <User size={20} className="mr-2 text-indigo-500" />
                  <span className="font-medium">
                    {activePlayer.id === socket?.id ? "Your turn" : `${activePlayer.name}'s turn`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">{renderGameContent()}</div>
    </div>
  )
}

// Play icon component
const Play = ({ size, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
)

export default GameArea
