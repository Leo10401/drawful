'use client';
import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import Head from "next/head";
import Chat from "../components/Chat";
import io from 'socket.io-client';

const SIGNALING_SERVER = process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:5000';

const HomePage = () => {
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    // Check URL params for room ID
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setRoomId(roomParam);
    }
    
    // Handle kicked event from sessionStorage (set by Chat component)
    const wasKicked = sessionStorage.getItem('wasKicked');
    if (wasKicked) {
      setError("You were kicked from the room by the leader");
      sessionStorage.removeItem('wasKicked');
    }
  }, []);

  const handleCreateRoom = () => {
    if (!userName.trim()) {
      setError("Please enter your name first");
      return;
    }
    const newRoomId = uuidv4();
    setRoomId(newRoomId);
    setJoining(true);
    window.history.replaceState({}, "", `?room=${newRoomId}`);
    
    // When creating a new room, the user is automatically the leader
    sessionStorage.setItem('isRoomLeader', 'true');
  };

  const handleJoinRoom = () => {
    if (!userName.trim()) {
      setError("Please enter your name first");
      return;
    }
    if (!roomId.trim()) {
      setError("Please enter a room ID");
      return;
    }
    setError("");
    window.history.replaceState({}, "", `?room=${roomId.trim()}`);
    setJoining(true);
  };

  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave the room?')) {
      setJoining(false);
      setRoomId("");
      setUserName("");
      setIsChatOpen(false);
      window.history.replaceState({}, "", "/");
    }
  };

  const handleJoinRandomRoom = async () => {
    if (!userName.trim()) {
      setError("Please enter your name first");
      return;
    }
    setError("");
    const socket = io(SIGNALING_SERVER, { transports: ['websocket', 'polling'] });
    socket.emit('get-random-room', (randomRoomId) => {
      socket.disconnect();
      if (randomRoomId) {
        setRoomId(randomRoomId);
        setJoining(true);
        window.history.replaceState({}, "", `?room=${randomRoomId}`);
      } else {
        setError("No available rooms to join. Try again later or create a new room.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-2 sm:p-4">
      <Head>
        <title>Drawful</title>
        <meta name="description" content="A simple video calling app using Next.js, WebRTC, and Socket.IO" />
      </Head>

      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-8">Draw to play</h1>
      
      {!joining ? (
        <div className="max-w-md mx-auto bg-white p-4 sm:p-8 rounded-lg shadow-md">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-4">
            <button
              onClick={handleCreateRoom}
              className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create New Room
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleJoinRoom}
                className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Join Room
              </button>
              <button
                onClick={handleJoinRandomRoom}
                className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
              >
                Join Random Room
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-red-500 text-center">{error}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4 relative">
          {/* Game area would go here */}
          <div className="flex-1 bg-white rounded-lg shadow-md p-4 min-h-[400px] md:min-h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Room: {roomId}</h2>
              <button 
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Leave Room
              </button>
            </div>
            <div className="h-[300px] md:h-[500px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
              <p className="text-gray-500">Game area goes here</p>
            </div>
          </div>

          {/* Chat component - now positioned at the extreme right */}
          <div className="md:order-last">
            <Chat roomId={roomId} userName={userName} />
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
