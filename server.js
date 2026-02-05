const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

// Store: { socketId: { x, y, color, level, username } }
let players = {};

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(7);
    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    
    console.log(`Connection attempt: ${id}`);

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // 1. Player joins from Menu
        if (data.type === 'join') {
            players[id] = { 
                x: 100, 
                y: 500, 
                color, 
                level: 1, 
                username: data.username 
            };
            
            // Tell client they are in
            ws.send(JSON.stringify({ type: 'init', id, color, startLevel: 1 }));
        }

        // 2. Player moves
        if (data.type === 'move' && players[id]) {
            players[id].x = data.x;
            players[id].y = data.y;
            players[id].level = data.level;
            players[id].vx = data.vx; // Sync velocity for smoother prediction if needed
            players[id].vy = data.vy;
        }
    });

    ws.on('close', () => {
        console.log(`Player ${id} disconnected`);
        delete players[id];
    });
});

// Broadcast Loop (30 FPS)
setInterval(() => {
    // Convert players object to array to save bandwidth
    const pack = [];
    for (let id in players) {
        pack.push({
            id: id,
            x: Math.round(players[id].x),
            y: Math.round(players[id].y),
            c: players[id].color,
            l: players[id].level
        });
    }
    
    const data = JSON.stringify({ type: 'state', players: pack });
    
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}, 1000 / 30);

console.log(`Server running on port ${port}`);