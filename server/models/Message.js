const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  encryptedText: { type: String, required: true },
  iv: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);