const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

// Store connected players: { socketId: { x, y, color, level } }
let players = {};

wss.on('connection', (ws) => {
    // Generate a simple ID
    const id = Math.random().toString(36).substring(7);
    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;

    // Initialize player
    players[id] = { x: 50, y: 50, color, level: 1 };

    console.log(`Player ${id} connected`);

    // Send initial ID to the client
    ws.send(JSON.stringify({ type: 'init', id, color }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'move') {
            // Update player position
            if (players[id]) {
                players[id].x = data.x;
                players[id].y = data.y;
                players[id].level = data.level;
            }
        }
    });

    ws.on('close', () => {
        delete players[id];
    });
});

// Broadcast game state to all clients 30 times a second
setInterval(() => {
    const pack = JSON.stringify({ type: 'state', players });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(pack);
        }
    });
}, 1000 / 30);

console.log(`Server running on port ${port}`);