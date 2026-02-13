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

app.use(express.static(path.join(__dirname, 'public')));

// --- GAME STATE ---
let players = {};
let currentTaggerId = null;
const ADMIN_PASSWORD = "admin";

// 30 FPS Server Tick Rate (Optimizes Bandwidth)
const TICK_RATE = 30; 
const TICK_INTERVAL = 1000 / TICK_RATE;

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
    "1111111111111111111111111111111111111111"
];

// --- SERVER LOOP (Heartbeat) ---
// Instead of sending data immediately, we bundle it.
setInterval(() => {
    // specific formatting to reduce JSON size
    const packet = {}; 
    for (let id in players) {
        let p = players[id];
        packet[id] = {
            x: Math.round(p.x * 100) / 100, // Round to 2 decimals
            y: Math.round(p.y * 100) / 100,
            f: p.facing, // 'f' is shorter than 'facing'
            d: p.isDashing ? 1 : 0,
            c: p.color,
            u: p.username
        };
    }
    
    // Volatile emit: If client is laggy, they drop old packets and jump to new ones
    io.volatile.emit('worldState', packet);
    
    // Send player count for menu users
    io.emit('serverStats', { count: Object.keys(players).length });

}, TICK_INTERVAL);

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // Send initial map and tagger
    socket.emit('mapUpdate', currentMapLayout); 
    socket.emit('taggerUpdate', currentTaggerId);
    socket.emit('serverStats', { count: Object.keys(players).length });

    // Handle Join
    socket.on('requestJoin', (data, callback) => {
        // Anti-Duplicate Name Check
        const existing = Object.values(players).find(p => p.username === data.username && p.id !== socket.id);
        if (existing) {
            callback({ success: false, message: "NAME TAKEN" });
            return;
        }

        players[socket.id] = {
            id: socket.id,
            x: 100, y: 100, vx: 0, vy: 0,
            facing: 1, isDashing: false,
            color: data.color,
            username: data.username
        };

        if (!currentTaggerId) {
            currentTaggerId = socket.id;
            io.emit('taggerUpdate', currentTaggerId);
        }

        callback({ success: true, id: socket.id });
    });

    // Receive Movement (Client Authority for responsiveness, validated by server implicitly)
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].facing = data.facing;
            players[socket.id].isDashing = data.isDashing;
        }
    });

    socket.on('playerDash', () => {
        socket.broadcast.emit('otherPlayerDash', socket.id);
    });

    socket.on('tagHit', (victimId) => {
        if (socket.id !== currentTaggerId) return;
        if (players[victimId]) {
            currentTaggerId = victimId; 
            io.emit('taggerUpdate', currentTaggerId); 
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id); // For cleanup
        
        if (socket.id === currentTaggerId) {
            const ids = Object.keys(players);
            currentTaggerId = ids.length > 0 ? ids[Math.floor(Math.random() * ids.length)] : null;
            io.emit('taggerUpdate', currentTaggerId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server optimized on port ${PORT}`);
});