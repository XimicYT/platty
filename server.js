const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

let players = {};
let history = [];
const HISTORY_Limit = 30;

// Config
const TICK_RATE = 20; // Broadcasts per second (50ms)

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substr(2, 9);
    // Assign a random neon color from a curated palette
    const palette = ['#00f3ff', '#ff00ff', '#fff200', '#00ff9d', '#ff3333'];
    const color = palette[Math.floor(Math.random() * palette.length)];

    console.log(`[+] Player ${id} connected`);

    // Initial Handshake
    ws.send(JSON.stringify({ 
        type: 'init', 
        id, 
        color, 
        history 
    }));

    ws.on('message', (msgRaw) => {
        try {
            const data = JSON.parse(msgRaw);

            if (data.type === 'join') {
                players[id] = {
                    id,
                    username: (data.username || "Guest").substring(0, 12),
                    color,
                    x: 0, y: 0, vx: 0, vy: 0,
                    state: 'idle',
                    lastSeen: Date.now()
                };
            }
            else if (data.type === 'update' && players[id]) {
                const p = players[id];
                p.x = data.x;
                p.y = data.y;
                p.vx = data.vx;
                p.vy = data.vy;
                p.state = data.state; // 'run', 'jump', 'wall'
                p.facing = data.facing;
                p.lastSeen = Date.now();
            }
            else if (data.type === 'chat') {
                const chatMsg = {
                    user: players[id] ? players[id].username : "Anon",
                    text: data.text.substring(0, 128),
                    color: players[id] ? players[id].color : "#fff",
                    time: Date.now()
                };
                history.push(chatMsg);
                if (history.length > HISTORY_Limit) history.shift();
                broadcast({ type: 'chat', msg: chatMsg });
            }
        } catch (e) {
            console.error("Packet Error", e);
        }
    });

    ws.on('close', () => {
        delete players[id];
        broadcast({ type: 'leave', id });
    });
});

function broadcast(data) {
    const pack = JSON.stringify(data);
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(pack);
    });
}

// Optimized Game Loop
setInterval(() => {
    const snapshot = [];
    const now = Date.now();
    
    for (let id in players) {
        // Prune stale connections (10 seconds timeout)
        if (now - players[id].lastSeen > 10000) {
            delete players[id];
            continue;
        }
        
        const p = players[id];
        // Compress data: Round to 1 decimal for bandwidth
        snapshot.push({
            id: p.id,
            x: Math.round(p.x * 10) / 10,
            y: Math.round(p.y * 10) / 10,
            vx: Math.round(p.vx),
            vy: Math.round(p.vy),
            u: p.username,
            c: p.color,
            s: p.state,
            f: p.facing
        });
    }

    if (snapshot.length > 0) {
        broadcast({ type: 'world', players: snapshot });
    }
}, 1000 / TICK_RATE);

console.log(`CORE SYSTEM ONLINE: PORT ${port}`);