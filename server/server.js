const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"], // Add both Vite and Create React App ports
    methods: ["GET", "POST"],
    credentials: true
  
  },
})

let messages = [];
let userCount = 0;

io.on("connection", (socket) => {
  userCount++;
  console.log(`✅ User connected: ${socket.id} (Total users: ${userCount})`);

  // Send existing messages to new user
  socket.emit("chatMessages", messages)
  
  // Broadcast user count to all clients
  io.emit("userCount", userCount);

  socket.on("chatMessage", (msg) => {
    console.log(`📩 Message received from ${socket.id}:`, msg);

    // Validate message
    if (typeof msg !== 'string') {
      console.log("⚠️ Invalid message type, ignoring");
      return;
    }

    const trimmedMsg = msg.trim();
    if (trimmedMsg.length === 0) {
      console.log("⚠️ Empty message, ignoring");
      return;
    }

    if (trimmedMsg.length > 500) {
      console.log("⚠️ Message too long, ignoring");
      return;
    }

    // Create message object
    const newMsg = { 
      id: socket.id, 
      text: trimmedMsg,
      timestamp: new Date().toISOString()
    };
    
    // Add to messages array
    messages.push(newMsg);
    
    // Keep only last 100 messages to prevent memory issues
    if (messages.length > 100) {
      messages = messages.slice(-100);
    }

    console.log(`📤 Broadcasting message to all clients. Total messages: ${messages.length}`);
    
    // Send updated messages to all clients
    io.emit("chatMessages", messages);
  });

  socket.on("disconnect", (reason) => {
    userCount--;
    console.log(`❌ User disconnected: ${socket.id} (${reason}) (Total users: ${userCount})`);
    
    // Broadcast updated user count
    io.emit("userCount", userCount);
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });
});

// Handle server errors
httpServer.on("error", (error) => {
  console.error("❌ Server error:", error);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
  console.log(`🌐 CORS enabled for localhost:5173 and localhost:3000`);
});