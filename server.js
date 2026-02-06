const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- 1. HEALTH CHECK ENDPOINT (For Cron Jobs) ---
// usage: curl https://your-site.com/health
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.use(express.static('public'));

let players = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- 2. JOIN REQUEST (Prevent Duplicates) ---
    socket.on('requestJoin', (data, callback) => {
        const requestedName = data.username.toUpperCase();
        
        // Check if name exists in current players
        const isDuplicate = Object.values(players).some(p => p.username === requestedName);

        if (isDuplicate) {
            callback({ success: false, message: "NAME TAKEN" });
        } else {
            // Initialize player on server
            players[socket.id] = {
                x: 0, y: 0, 
                username: requestedName, 
                color: data.color,
                id: socket.id
            };
            
            // Send success response
            callback({ success: true });
            
            // Broadcast new player to others
            socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });
            // Send current players to new player
            socket.emit('currentPlayers', players);
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].facing = movementData.facing;
            players[socket.id].isDashing = movementData.isDashing;
            players[socket.id].color = movementData.color;
            players[socket.id].username = movementData.username;
            socket.broadcast.emit('playerMoved', { id: socket.id, ...movementData });
        }
    });

    socket.on('playerDash', () => {
        socket.broadcast.emit('otherPlayerDash', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});