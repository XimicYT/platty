const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 2000,
    pingTimeout: 5000
});

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- GAME STATE ---
let players = {};
let currentTaggerId = null;
const ADMIN_PASSWORD = "neon_secret_pass"; // Change this for security!

// Default Map (This is sent to players when they join)
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
    "1111111111111111111111111111111111111111"
];

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // 1. Send Sync Data (Players, Map, Tagger)
    socket.emit('currentPlayers', players);
    socket.emit('mapUpdate', currentMapLayout); 
    socket.emit('taggerUpdate', currentTaggerId);

    // 2. Handle Join Request
    socket.on('requestJoin', (data, callback) => {
        // Simple validation
        const existingName = Object.values(players).find(p => p.username === data.username);
        if (existingName) {
            callback({ success: false, message: "NAME TAKEN" });
            return;
        }

        // Initialize Player
        players[socket.id] = {
            x: 100, y: 100, vx: 0, vy: 0,
            facing: 1, isDashing: false,
            color: data.color,
            username: data.username
        };

        // If no tagger exists, this player becomes IT
        if (!currentTaggerId) {
            currentTaggerId = socket.id;
            io.emit('taggerUpdate', currentTaggerId);
        }

        callback({ success: true, id: socket.id });
        socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });
    });

    // 3. Movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...movementData };
            // Volatile emit for movement (drops packets if laggy to prevent buildup)
            socket.broadcast.volatile.emit('playerMoved', { id: socket.id, ...movementData });
        }
    });

    socket.on('playerDash', () => {
        socket.broadcast.emit('otherPlayerDash', socket.id);
    });

    // 4. Tagging Logic
    socket.on('tagHit', (victimId) => {
        // Only the current tagger can tag someone
        if (socket.id !== currentTaggerId) return;
        
        // Verify victim exists
        if (players[victimId]) {
            currentTaggerId = victimId; // Swap roles
            io.emit('taggerUpdate', currentTaggerId); // Tell everyone
        }
    });

    // 5. Admin Map Builder
    socket.on('adminUpdateMap', (data, callback) => {
        if (data.password !== ADMIN_PASSWORD) {
            callback({ success: false, message: "INVALID PASSWORD" });
            return;
        }

        currentMapLayout = data.layout;
        console.log("Map updated by Admin");
        
        // Broadcast new map to all players
        io.emit('mapUpdate', currentMapLayout);
        
        callback({ success: true });
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);

        // If the tagger left, pick a random new tagger
        if (socket.id === currentTaggerId) {
            const remainingIds = Object.keys(players);
            if (remainingIds.length > 0) {
                currentTaggerId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
            } else {
                currentTaggerId = null;
            }
            io.emit('taggerUpdate', currentTaggerId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});