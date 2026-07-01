require("dotenv").config();
const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Message = require("./models/Message");
const { encrypt, decrypt } = require("./utils/crypto");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://websocket-olive-two.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
});

let userCount = 0;

// --- MongoDB connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

// Fetch last N messages from DB and decrypt them into the shape the frontend expects
async function getRecentMessages(limit = 100) {
  const docs = await Message.find().sort({ timestamp: -1 }).limit(limit).lean();
  return docs
    .reverse() // oldest first
    .map((doc) => {
      try {
        return {
          id: doc.socketId,
          text: decrypt(doc.encryptedText, doc.iv),
          timestamp: doc.timestamp,
        };
      } catch (err) {
        console.error("❌ Failed to decrypt a message, skipping it:", err);
        return null;
      }
    })
    .filter(Boolean);
}

// Trim collection down to the most recent 100 docs
async function trimOldMessages(maxCount = 100) {
  const count = await Message.countDocuments();
  if (count > maxCount) {
    const excess = count - maxCount;
    const oldest = await Message.find().sort({ timestamp: 1 }).limit(excess).select("_id");
    const idsToDelete = oldest.map((m) => m._id);
    await Message.deleteMany({ _id: { $in: idsToDelete } });
  }
}

io.on("connection", async (socket) => {
  userCount++;
  console.log(`✅ User connected: ${socket.id} (Total users: ${userCount})`);

  // Send existing messages (from MongoDB, decrypted) to the newly connected user
  try {
    const recentMessages = await getRecentMessages();
    socket.emit("chatMessages", recentMessages);
  } catch (err) {
    console.error("❌ Failed to load messages from DB:", err);
    socket.emit("chatMessages", []);
  }

  io.emit("userCount", userCount);

  socket.on("chatMessage", async (msg) => {
    console.log(`📩 Message received from ${socket.id}:`, msg);

    if (typeof msg !== "string") {
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

    try {
      const { encryptedText, iv } = encrypt(trimmedMsg);

      await Message.create({
        socketId: socket.id,
        encryptedText,
        iv,
      });

      await trimOldMessages(100);

      const recentMessages = await getRecentMessages();
      console.log(`📤 Broadcasting message to all clients. Total messages: ${recentMessages.length}`);
      io.emit("chatMessages", recentMessages);
    } catch (err) {
      console.error("❌ Failed to save/broadcast message:", err);
    }
  });

  socket.on("disconnect", (reason) => {
    userCount--;
    console.log(`❌ User disconnected: ${socket.id} (${reason}) (Total users: ${userCount})`);
    io.emit("userCount", userCount);
  });

  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });
});

httpServer.on("error", (error) => {
  console.error("❌ Server error:", error);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
});