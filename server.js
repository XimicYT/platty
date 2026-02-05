const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

let players = {};
const MAX_HISTORY = 50;
let chatHistory = [];

// validation constants
const MAX_SPEED_TOLERANCE = 40; // Generous to account for lag/dashing

function broadcast(data) {
    const pack = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(pack);
    });
}

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(2, 9);
    // Neon palette
    const colors = ['#00ff00', '#00eaff', '#ff00ff', '#ffff00', '#ff5500'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    let lastPacketTime = Date.now();

    console.log(`[Connect] Player ${id}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const now = Date.now();

            if (data.type === 'join') {
                players[id] = { 
                    x: 100, y: 700, vx: 0, vy: 0, 
                    color, level: 1, 
                    username: (data.username || "Anon").substring(0, 12).replace(/[^a-zA-Z0-9]/g, ''),
                    lastUpdate: now
                };
                ws.send(JSON.stringify({ type: 'init', id, color, history: chatHistory }));
            }
            
            else if (data.type === 'move' && players[id]) {
                const p = players[id];
                
                // Basic Speed Sanity Check (Anti-Cheat)
                const dist = Math.abs(data.x - p.x) + Math.abs(data.y - p.y);
                const dt = now - p.lastUpdate;
                
                // Only update if movement is within realm of physics (or it's a respawn/level change)
                if (dist < MAX_SPEED_TOLERANCE * (dt/16) || dist > 500) { 
                    p.x = data.x;
                    p.y = data.y;
                    p.vx = data.vx;
                    p.vy = data.vy;
                    p.level = data.level;
                    p.facing = data.facing; // -1 or 1
                }
                p.lastUpdate = now;
            }

            else if (data.type === 'chat' && players[id]) {
                const msg = { 
                    id: Date.now(), 
                    user: players[id].username, 
                    text: data.text.substring(0, 140), 
                    color: players[id].color 
                };
                chatHistory.push(msg);
                if(chatHistory.length > MAX_HISTORY) chatHistory.shift();
                broadcast({ type: 'chat', msg });
            }
        } catch (e) { console.error("Err:", e.message); }
    });

    ws.on('close', () => { delete players[id]; });
});

// Broadcast Loop (20 FPS is enough for interpolation)
setInterval(() => {
    const pack = [];
    for (let id in players) {
        pack.push({
            id: id,
            x: Math.round(players[id].x),
            y: Math.round(players[id].y),
            vx: Number(players[id].vx.toFixed(2)),
            vy: Number(players[id].vy.toFixed(2)),
            l: players[id].level,
            f: players[id].facing,
            c: players[id].color,
            u: players[id].username
        });
    }
    broadcast({ type: 'state', players: pack });
}, 50);

console.log(`Server running on port ${port}`);