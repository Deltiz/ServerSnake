const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const os = require("os");
const { Server: SocketIOServer } = require("socket.io");

const GAME_WIDTH = 256;
const GAME_HEIGHT = 224;
const TICK_RATE = 10; // Reduced from 15 to save ngrok requests
const GRID_SIZE = 8;
const FOOD_COUNT = 5;
const FOOD_SIZE = 6;
const GAME_DURATION = 60; // seconds (1 minute)

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const STATIC_ROOT = path.resolve(__dirname, "../..");

const players = new Map();
const food = [];
const usedColors = new Set();

let gameTimer = GAME_DURATION;
let gameActive = true;
let waitingForStart = false;

function spawnFood() {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: Math.floor(Math.random() * (GAME_WIDTH - FOOD_SIZE)),
    y: Math.floor(Math.random() * (GAME_HEIGHT - FOOD_SIZE)),
    size: FOOD_SIZE,
  };
}

// Initialize food
for (let i = 0; i < FOOD_COUNT; i++) {
  food.push(spawnFood());
}

app.use(express.json());
app.use(express.static(STATIC_ROOT));

// Redirect root to the game
app.get('/', (req, res) => {
  res.redirect('/Python-Platformer/index.html');
});

function getLocalAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((iface = []) => {
    iface.forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    });
  });

  if (!addresses.includes("localhost")) {
    addresses.unshift("localhost");
  }

  return addresses;
}

app.get("/api/hosts", (_req, res) => {
  res.json({
    hosts: getLocalAddresses().map((host) => ({
      host,
      url: `http://${host}:${PORT}/`,
    })),
  });
});

async function readData() {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { players: [], stats: {} };
    }
    throw err;
  }
}

async function writeData(data) {
  await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

app.get("/api/state", async (_req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (err) {
    console.error("Failed to read state", err);
    res.status(500).json({ error: "Failed to read state" });
  }
});

app.post("/api/save", async (req, res) => {
  try {
    const { players = [], stats = {} } = req.body;
    const payload = { players, stats, updatedAt: new Date().toISOString() };
    await writeData(payload);
    io.emit("state:update", payload);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save state", err);
    res.status(500).json({ error: "Failed to save state" });
  }
});

io.on("connection", async (socket) => {
  console.log("Client connected", socket.id);

  let playerPersistentId = null;

  socket.on("player:register", ({ persistentId, name }) => {
    playerPersistentId = persistentId;
    const playerName = name || `Player-${String(players.size + 1).padStart(2, "0")}`;

    const colorPalette = [
      "#ff595e",
      "#ffca3a",
      "#8ac926",
      "#1982c4",
      "#6a4c93",
      "#ff6b9d",
      "#c9ada7",
      "#4ecdc4",
      "#f4a261",
      "#e76f51",
      "#2a9d8f",
      "#e9c46a",
    ];

    // Generate consistent color based on persistent ID
    function hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return Math.abs(hash);
    }

    // Try to get preferred color first
    let colorIndex = hashCode(persistentId) % colorPalette.length;
    let selectedColor = colorPalette[colorIndex];

    // If color is taken, find the next available one
    if (usedColors.has(selectedColor)) {
      selectedColor = null;
      for (const color of colorPalette) {
        if (!usedColors.has(color)) {
          selectedColor = color;
          break;
        }
      }
      // If all colors are taken, reuse with slight modification
      if (!selectedColor) {
        selectedColor = colorPalette[colorIndex];
      }
    }

    usedColors.add(selectedColor);

    const spawn = {
      id: socket.id,
      segments: [
        { x: 120, y: 112 },
        { x: 112, y: 112 },
        { x: 104, y: 112 },
      ],
      direction: "right",
      nextDirection: "right",
      color: selectedColor,
      name: playerName,
      length: 3,
      score: 0,
    };

    players.set(socket.id, spawn);

    socket.emit("world:init", {
      id: socket.id,
      players: Array.from(players.values()),
      food: food,
      gameTimer: gameTimer,
      gameActive: gameActive,
      waitingForStart: waitingForStart,
    });

    socket.broadcast.emit("world:join", spawn);
  });

  socket.on("player:input", (input) => {
    const player = players.get(socket.id);
    if (!player || !gameActive) return;
    
    // Snake-style: arrow keys change direction only, prevent 180° turns
    if (input.up && player.direction !== "down") {
      player.nextDirection = "up";
    } else if (input.down && player.direction !== "up") {
      player.nextDirection = "down";
    } else if (input.left && player.direction !== "right") {
      player.nextDirection = "left";
    } else if (input.right && player.direction !== "left") {
      player.nextDirection = "right";
    }
  });

  socket.on("player:startGame", () => {
    if (waitingForStart) {
      startNewRound();
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    const player = players.get(socket.id);
    if (player) {
      usedColors.delete(player.color);
    }
    players.delete(socket.id);
    socket.broadcast.emit("world:leave", { id: socket.id });
  });
});

setInterval(() => {
  if (!gameActive) return;
  
  let changed = false;

  players.forEach((player) => {
    // Update direction from queued input
    player.direction = player.nextDirection;
    
    // Get current head position
    const head = player.segments[0];
    let newHead = { x: head.x, y: head.y };
    
    // Move head in current direction
    if (player.direction === "left") newHead.x -= GRID_SIZE;
    else if (player.direction === "right") newHead.x += GRID_SIZE;
    else if (player.direction === "up") newHead.y -= GRID_SIZE;
    else if (player.direction === "down") newHead.y += GRID_SIZE;
    
    // Wrap around screen edges
    if (newHead.x < 0) newHead.x = GAME_WIDTH - GRID_SIZE;
    if (newHead.x >= GAME_WIDTH) newHead.x = 0;
    if (newHead.y < 0) newHead.y = GAME_HEIGHT - GRID_SIZE;
    if (newHead.y >= GAME_HEIGHT) newHead.y = 0;
    
    // Add new head
    player.segments.unshift(newHead);
    
    // Check collision with food
    let ate = false;
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      const distance = Math.sqrt(
        Math.pow(newHead.x + GRID_SIZE / 2 - (f.x + f.size / 2), 2) +
        Math.pow(newHead.y + GRID_SIZE / 2 - (f.y + f.size / 2), 2)
      );
      
      if (distance < (GRID_SIZE / 2 + f.size / 2)) {
        // Player ate food
        player.length += 1;
        player.score += 10;
        ate = true;
        
        // Remove eaten food and spawn new one
        food.splice(i, 1);
        food.push(spawnFood());
        
        io.emit("food:update", food);
        break;
      }
    }
    
    // Remove tail if didn't eat
    if (!ate) {
      player.segments.pop();
    }
    
    changed = true;
  });

  // Check collisions between players
  const deadPlayers = [];
  const killInfo = new Map(); // Track who killed who
  
  // First pass: Check for head-to-head collisions (mutual kills)
  players.forEach((player, playerId) => {
    const head = player.segments[0];
    
    players.forEach((otherPlayer, otherPlayerId) => {
      if (playerId >= otherPlayerId) return; // Only check each pair once
      
      const otherHead = otherPlayer.segments[0];
      if (head.x === otherHead.x && head.y === otherHead.y) {
        // Mutual kill - both die
        deadPlayers.push(playerId);
        deadPlayers.push(otherPlayerId);
        killInfo.set(playerId, { type: 'mutual', killer: otherPlayerId, killerName: otherPlayer.name });
        killInfo.set(otherPlayerId, { type: 'mutual', killer: playerId, killerName: player.name });
      }
    });
  });
  
  // Second pass: Check self-collision and body collisions (only if not already dead)
  players.forEach((player, playerId) => {
    if (deadPlayers.includes(playerId)) return; // Skip if already marked dead from mutual kill
    
    const head = player.segments[0];
    
    // Check collision with own body (skip head)
    for (let i = 1; i < player.segments.length; i++) {
      const segment = player.segments[i];
      if (head.x === segment.x && head.y === segment.y) {
        deadPlayers.push(playerId);
        killInfo.set(playerId, { type: 'self', killer: null });
        return;
      }
    }
    
    // Check collision with other players' bodies
    players.forEach((otherPlayer, otherPlayerId) => {
      if (playerId === otherPlayerId) return;
      
      // Check against all segments of other player (including head)
      otherPlayer.segments.forEach((segment) => {
        if (head.x === segment.x && head.y === segment.y) {
          if (!deadPlayers.includes(playerId)) {
            deadPlayers.push(playerId);
            killInfo.set(playerId, { type: 'killed', killer: otherPlayerId, killerName: otherPlayer.name });
          }
        }
      });
    });
  });

  // Remove dead players and notify clients
  deadPlayers.forEach((playerId) => {
    const player = players.get(playerId);
    if (player) {
      usedColors.delete(player.color);
    }
    players.delete(playerId);
    io.emit("world:leave", { id: playerId });
    
    const socket = io.sockets.sockets.get(playerId);
    const info = killInfo.get(playerId);
    if (socket && info) {
      let message = "You died!";
      if (info.type === 'self') {
        message = "You died!";
      } else if (info.type === 'mutual') {
        message = `Both died with ${info.killerName}!`;
      } else {
        message = `Killed by ${info.killerName}!`;
      }
      
      socket.emit("player:death", { 
        message: message,
        deathType: info.type,
        killer: info.killer
      });
      
      // Notify killer (only for regular kills, not mutual)
      if (info.type === 'killed' && info.killer) {
        const killerSocket = io.sockets.sockets.get(info.killer);
        if (killerSocket) {
          killerSocket.emit("player:kill", { victim: player.name });
        }
      }
    }
  });

  if (changed) {
    io.emit("world:update", Array.from(players.values()));
    
    // Check if all players died - keep game running
    if (players.size === 0 && gameActive && !waitingForStart) {
      console.log('All players died, game continues...');
      // Game continues, waiting for new players to join
    }
  }
}, 1000 / TICK_RATE);

// Game timer countdown
setInterval(() => {
  if (!gameActive || waitingForStart) return;
  
  gameTimer--;
  io.emit("timer:update", { time: gameTimer });
  
  if (gameTimer <= 0) {
    endGame();
  }
}, 1000);

function endGame() {
  gameActive = false;
  waitingForStart = true;
  
  // Find winner(s)
  const sortedPlayers = Array.from(players.values())
    .sort((a, b) => b.score - a.score);
  
  const winner = sortedPlayers[0];
  
  io.emit("game:end", {
    winner: winner ? {
      name: winner.name,
      score: winner.score,
      color: winner.color,
    } : null,
    scores: sortedPlayers.map(p => ({
      name: p.name,
      score: p.score,
      color: p.color,
    })),
  });
}

function startNewRound() {
  gameTimer = GAME_DURATION;
  gameActive = true;
  waitingForStart = false;
  
  // Reset all players
  players.forEach((player) => {
    player.segments = [
      { x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE, 
        y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE },
      { x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE, 
        y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE },
      { x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE, 
        y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE },
    ];
    player.direction = "right";
    player.nextDirection = "right";
    player.score = 0;
    player.length = 3;
  });
  
  // Reset food
  food.length = 0;
  for (let i = 0; i < FOOD_COUNT; i++) {
    food.push(spawnFood());
  }
  
  io.emit("game:reset", {
    players: Array.from(players.values()),
    food: food,
    gameTimer: gameTimer,
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`\nLocal access: http://localhost:${PORT}/Python-Platformer/index.html`);
  
  // Get all network interfaces to show LAN IP addresses
  const networkInterfaces = os.networkInterfaces();
  console.log('\nNetwork access (share these with other computers):');
  
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(iface => {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  http://${iface.address}:${PORT}/Python-Platformer/index.html`);
      }
    });
  });
});
