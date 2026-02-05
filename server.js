const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

// Store players and chat history
let players = {};
const MAX_HISTORY = 50;
let chatHistory = [];

function broadcast(data) {
    const pack = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(pack);
        }
    });
}

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(2, 9);
    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    let isAlive = true;

    // Heartbeat (Keep connection alive)
    ws.on('pong', () => { isAlive = true; });

    console.log(`Player ${id} connected`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // JOIN
            if (data.type === 'join') {
                players[id] = { 
                    x: 100, y: 500, vx: 0, vy: 0, 
                    color, level: 1, username: data.username.substring(0, 15) 
                };
                ws.send(JSON.stringify({ type: 'init', id, color, history: chatHistory }));
            }
            // MOVE
            else if (data.type === 'move' && players[id]) {
                players[id].x = data.x;
                players[id].y = data.y;
                players[id].vx = data.vx;
                players[id].vy = data.vy;
                players[id].level = data.level;
            }
            // CHAT
            else if (data.type === 'chat' && players[id]) {
                const msg = { 
                    id: Math.random().toString(36), 
                    user: players[id].username, 
                    text: data.text.substring(0, 100), 
                    color: players[id].color 
                };
                chatHistory.push(msg);
                if(chatHistory.length > MAX_HISTORY) chatHistory.shift();
                broadcast({ type: 'chat', msg });
            }
        } catch (e) {
            console.error("Invalid message received");
        }
    });

    ws.on('close', () => {
        delete players[id];
    });

    // Heartbeat Loop
    const interval = setInterval(() => {
        if (isAlive === false) return ws.terminate();
        isAlive = false;
        ws.ping();
    }, 30000);

    ws.on('close', () => clearInterval(interval));
});

// Game State Broadcast (30 FPS)
setInterval(() => {
    const pack = [];
    for (let id in players) {
        pack.push({
            id: id,
            x: Math.round(players[id].x),
            y: Math.round(players[id].y),
            vx: parseFloat(players[id].vx.toFixed(2)),
            vy: parseFloat(players[id].vy.toFixed(2)),
            l: players[id].level
        });
    }
    broadcast({ type: 'state', players: pack });
}, 1000 / 30);

console.log(`Server running on port ${port}`);