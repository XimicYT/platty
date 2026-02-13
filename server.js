const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
// Optimization: Enable compression and set transport preferences
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 2000,
  pingTimeout: 5000,
  transports: ["websocket", "polling"], // Prefer websocket
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is healthy" });
});

// --- GAME STATE ---
let players = {};
let currentTaggerId = null;
const ADMIN_PASSWORD = "admin";

// Default Map
let currentMapLayout = [
  "1111111111111111111111111111111111111111",
  "1......................................1",
  "1......................................1",
  "1..P...................................1",
  "111111....11111..................11111.1",
  "1................................1...1.1",
  "1...................1111.........1...1.1",
  "1...................1..1.........1...1.1",
  "1.........1111......1..1.........1...1.1",
  "1.........1.........1..1.........1...1.1",
  "1.........1.........1..1.........1...1.1",
  "1....2222.1.........1..1.........1...1.1",
  "1111111111111111111111111111111111111111",
  "1......................................1",
  "1......................................1",
  "1......................................1",
  "1......................................1",
  "1......................................1",
  "1......................................1",
  "1111111111111111111111111111111111111111",
];

// Helper to send count
const broadcastCount = () => {
  io.emit("playerCount", Object.keys(players).length);
};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Send initial data
  socket.emit("currentPlayers", players);
  socket.emit("mapUpdate", currentMapLayout);
  socket.emit("taggerUpdate", currentTaggerId);
  socket.emit("playerCount", Object.keys(players).length); // Send count immediately

  socket.on("requestJoin", (data, callback) => {
    // Validation
    const existingName = Object.values(players).find(
      (p) => p.username === data.username,
    );
    if (existingName) {
      callback({ success: false, message: "NAME TAKEN" });
      return;
    }

    players[socket.id] = {
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      facing: 1,
      isDashing: false,
      color: data.color,
      username: data.username,
    };

    if (!currentTaggerId) {
      currentTaggerId = socket.id;
      io.emit("taggerUpdate", currentTaggerId);
    }

    callback({ success: true, id: socket.id });
    socket.broadcast.emit("newPlayer", {
      id: socket.id,
      player: players[socket.id],
    });
    broadcastCount(); // Update count for everyone
  });

  socket.on("playerMovement", (movementData) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...movementData };
      // Volatile for performance (drops packets if laggy)
      socket.broadcast.volatile.emit("playerMoved", {
        id: socket.id,
        ...movementData,
      });
    }
  });

  socket.on("playerDash", () => {
    socket.broadcast.emit("otherPlayerDash", socket.id);
  });

  socket.on("tagHit", (victimId) => {
    if (socket.id !== currentTaggerId) return;

    if (players[victimId]) {
      currentTaggerId = victimId;
      io.emit("taggerUpdate", currentTaggerId);
    }
  });

  socket.on("adminUpdateMap", (data, callback) => {
    if (data.password !== ADMIN_PASSWORD) {
      callback({ success: false, message: "INVALID PASSWORD" });
      return;
    }
    currentMapLayout = data.layout;
    io.emit("mapUpdate", currentMapLayout);
    callback({ success: true });
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit("playerDisconnected", socket.id);

      if (socket.id === currentTaggerId) {
        const remainingIds = Object.keys(players);
        currentTaggerId =
          remainingIds.length > 0
            ? remainingIds[Math.floor(Math.random() * remainingIds.length)]
            : null;
        io.emit("taggerUpdate", currentTaggerId);
      }
      broadcastCount(); // Update count
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
