const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- 1. HEALTH CHECK ENDPOINT (For Cron Jobs/Render) ---
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.use(express.static('public'));

// --- GAME STATE ---
let players = {};
let taggerId = null; // Stores the Socket ID of the current "IT" player

// Helper: Pick a random player to be IT
function pickRandomTagger() {
    const ids = Object.keys(players);
    if (ids.length > 0) {
        const randomId = ids[Math.floor(Math.random() * ids.length)];
        taggerId = randomId;
        io.emit('taggerUpdate', taggerId);
        console.log(`New Tagger Selected: ${players[taggerId]?.username || taggerId}`);
    } else {
        taggerId = null;
    }
}

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
                id: socket.id,
                facing: 1,
                isDashing: false
            };
            
            // Send success response (Include ID so client knows their own ID)
            callback({ success: true, id: socket.id });
            
            // Broadcast new player to others
            socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });
            
            // Send current players to new player
            socket.emit('currentPlayers', players);

            // Send current Tagger to the new player
            socket.emit('taggerUpdate', taggerId);

            // START GAME CHECK: If we have 2+ players and no tagger, pick one
            if (Object.keys(players).length >= 2 && !taggerId) {
                pickRandomTagger();
            }
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...movementData };
            socket.broadcast.emit('playerMoved', { id: socket.id, ...movementData });
        }
    });

    socket.on('playerDash', () => {
        socket.broadcast.emit('otherPlayerDash', socket.id);
    });

    // --- 3. TAGGING LOGIC ---
    socket.on('tagHit', (targetId) => {
        // Security: Only the current tagger can tag someone else
        if (socket.id === taggerId && players[targetId]) {
            console.log(`Tag Event: ${socket.id} tagged ${targetId}`);
            
            // Swap "IT" status
            taggerId = targetId; 
            
            // Broadcast update to everyone (updates colors and UI)
            io.emit('taggerUpdate', taggerId); 
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);

        // If the TAGGER disconnected, pick a new one
        if (socket.id === taggerId) {
            console.log("Tagger disconnected, picking new tagger...");
            pickRandomTagger();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});