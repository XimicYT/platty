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

// Game State
let players = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create new player entry
    players[socket.id] = {
        x: 100,
        y: 2000, // Default spawn (bottom)
        vx: 0,
        vy: 0,
        facing: 1,
        isDashing: false,
        color: `hsl(${Math.random() * 360}, 100%, 50%)` // Unique color
    };

    // Send current players to new joiner
    socket.emit('currentPlayers', players);

    // Broadcast new player to others
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Handle Movement Updates
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...movementData };
            // Broadcast movement to everyone else (volatile drops packets if laggy, good for movement)
            socket.broadcast.emit('playerMoved', { id: socket.id, ...movementData });
        }
    });

    // Handle Dash Visuals
    socket.on('playerDash', () => {
        socket.broadcast.emit('otherPlayerDash', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});