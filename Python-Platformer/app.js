const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector(".hud__status");
const shareList = document.querySelector(".hud__list");
const scoreboardList = document.querySelector(".scoreboard__list");
const timerEl = document.querySelector(".timer__value");

// Load sound effects
const sounds = {
  eat: new Audio('/Sound/eat-kandysound.mp3'),
  death: new Audio('/Sound/deathsound.mp3'),
  firstKill: new Audio('/Sound/fristKill.mp3'),
  secondKill: new Audio('/Sound/secoundKill.mp3'),
  thirdKill: new Audio('/Sound/thridKill.mp3'),
  killBySelf: new Audio('/Sound/killbytheself.mp3')
};

// Load background music
const backgroundMusic = new Audio('/Sound/Never-Ending High Score.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.3;

// Enable audio context on first user interaction
let audioEnabled = false;
document.addEventListener('click', () => {
  if (!audioEnabled) {
    // Try to play a silent sound to enable audio
    Object.values(sounds).forEach(sound => {
      sound.play().then(() => sound.pause()).catch(() => {});
    });
    audioEnabled = true;
    console.log('Audio enabled');
  }
}, { once: true });

// Set volume for all sounds
Object.values(sounds).forEach(sound => {
  sound.volume = 0.5;
  sound.load(); // Preload the sounds
  
  // Add error handler
  sound.addEventListener('error', (e) => {
    console.error('Failed to load sound:', sound.src, e);
  });
  
  sound.addEventListener('loadeddata', () => {
    console.log('Sound loaded:', sound.src);
  });
});

// Track kill streak
let killStreak = 0;
let lastKillTime = 0;

// Background music control
function startBackgroundMusic() {
  backgroundMusic.play().catch(e => console.log('Music play failed:', e));
}

function pauseBackgroundMusic() {
  backgroundMusic.pause();
}

function resumeBackgroundMusic() {
  backgroundMusic.play().catch(e => console.log('Music play failed:', e));
}

function playEatSound() {
  sounds.eat.currentTime = 0;
  sounds.eat.play().catch(e => console.log('Audio play failed:', e));
}

function playDeathSound() {
  sounds.death.currentTime = 0;
  sounds.death.play().catch(e => console.log('Audio play failed:', e));
}

function playKillSound() {
  const now = Date.now();
  // Reset streak if more than 5 seconds since last kill
  if (now - lastKillTime > 5000) {
    killStreak = 0;
  }
  
  killStreak++;
  lastKillTime = now;
  
  let soundToPlay;
  if (killStreak === 1) {
    soundToPlay = sounds.firstKill;
  } else if (killStreak === 2) {
    soundToPlay = sounds.secondKill;
  } else if (killStreak >= 3) {
    soundToPlay = sounds.thirdKill;
  }
  
  if (soundToPlay) {
    soundToPlay.currentTime = 0;
    soundToPlay.play().catch(e => console.log('Audio play failed:', e));
  }
}

function playKillBySelfSound() {
  console.log('Playing kill by self sound (Avada Kedavra)');
  sounds.killBySelf.currentTime = 0;
  sounds.killBySelf.play()
    .then(() => console.log('Kill by self sound started'))
    .catch(e => console.error('Kill by self audio play failed:', e));
}

function playGameEndSound() {
  // Use third kill sound for victory
  sounds.thirdKill.currentTime = 0;
  sounds.thirdKill.play().catch(e => console.log('Audio play failed:', e));
}

function playGameStartSound() {
  // Use eat sound for game start
  sounds.eat.currentTime = 0;
  sounds.eat.play().catch(e => console.log('Audio play failed:', e));
}

// Get or create persistent player ID
function getPlayerId() {
  let playerId = localStorage.getItem("snakePlayerId");
  if (!playerId) {
    playerId = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem("snakePlayerId", playerId);
  }
  return playerId;
}

// Get player name (prompt once per browser session, survives page reloads)
function getPlayerName() {
  // Check sessionStorage first (survives page reloads but not browser close)
  let playerName = sessionStorage.getItem("snakePlayerName");
  
  if (!playerName) {
    // Only ask for name if not in sessionStorage
    playerName = prompt("Enter your name:");
    if (!playerName || playerName.trim() === "") {
      playerName = "Player";
    } else {
      playerName = playerName.trim().substring(0, 20); // Limit to 20 characters
    }
    sessionStorage.setItem("snakePlayerName", playerName);
  }
  
  return playerName;
}

const persistentPlayerId = getPlayerId();
const playerName = getPlayerName();
const socket = io();
const players = new Map();
let foodItems = [];

let localId = null;
let waitingForStart = false;

// Restart button functionality
const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    // Stop music
    pauseBackgroundMusic();
    // Reload the page
    window.location.reload();
  });
}

const inputState = {
	up: false,
	down: false,
	left: false,
	right: false,
};

const keyBindings = {
	arrowup: "up",
	w: "up",
	arrowdown: "down",
	s: "down",
	arrowleft: "left",
	a: "left",
	arrowright: "right",
	d: "right",
};

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function updateScoreboard() {
  if (!scoreboardList) return;
  
  const sortedPlayers = Array.from(players.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  
  scoreboardList.innerHTML = "";
  
  sortedPlayers.forEach((player, index) => {
    const li = document.createElement("li");
    
    const playerDiv = document.createElement("div");
    playerDiv.className = "scoreboard__player";
    
    const colorBox = document.createElement("div");
    colorBox.className = "scoreboard__color";
    colorBox.style.backgroundColor = player.color;
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = `${index + 1}. ${player.name}`;
    nameSpan.style.color = player.color;
    nameSpan.style.fontWeight = "600";
    nameSpan.style.textShadow = "0 1px 3px rgba(0, 0, 0, 0.8)";
    if (player.id === localId) {
      nameSpan.textContent += " (You)";
      nameSpan.style.fontWeight = "700";
    }
    
    playerDiv.appendChild(colorBox);
    playerDiv.appendChild(nameSpan);
    
    const scoreSpan = document.createElement("span");
    scoreSpan.className = "scoreboard__score";
    scoreSpan.textContent = player.score || 0;
    scoreSpan.style.color = player.color;
    scoreSpan.style.fontWeight = "600";
    scoreSpan.style.textShadow = "0 1px 3px rgba(0, 0, 0, 0.8)";
    
    li.appendChild(playerDiv);
    li.appendChild(scoreSpan);
    scoreboardList.appendChild(li);
  });
}async function populateShareLinks() {
	if (!shareList) return;

	try {
		const response = await fetch("/api/hosts");
		const { hosts } = await response.json();

		shareList.innerHTML = "";

		hosts.forEach(({ host, url }) => {
			const li = document.createElement("li");
			const link = document.createElement("a");
			link.href = url;
			link.textContent = host === "localhost" ? "localhost" : url;
			link.target = "_blank";
			link.rel = "noopener";
			li.appendChild(link);
			shareList.appendChild(li);
		});

		if (hosts.length === 0) {
			shareList.innerHTML = "<li>Hittar inga delbara adresser.</li>";
		}
	} catch (error) {
		console.error("Failed to load hosts", error);
		shareList.innerHTML = "<li>Kunde inte hämta adresser.</li>";
	}
}

function syncPlayers(list) {
  players.clear();
  list.forEach((player) => {
    players.set(player.id, player);
  });
  updateScoreboard();
}

function upsertPlayer(player) {
  players.set(player.id, player);
  updateScoreboard();
}

function removePlayer(id) {
  players.delete(id);
  updateScoreboard();
}function emitInput() {
	if (!localId || socket.disconnected) return;
	socket.emit("player:input", inputState);
}

function handleKey(event, isDown) {
  if (!isDown) return; // Snake controls only trigger on keydown
  
  // Space key to start new round
  if (event.key === " " && waitingForStart) {
    socket.emit("player:startGame");
    event.preventDefault();
    return;
  }
  
  const action = keyBindings[event.key.toLowerCase()];
  if (!action) return;

  // Send single direction change
  const directionInput = {
    up: action === "up",
    down: action === "down",
    left: action === "left",
    right: action === "right",
  };
  
  socket.emit("player:input", directionInput);
  event.preventDefault();
}window.addEventListener("keydown", (event) => handleKey(event, true));
window.addEventListener("keyup", (event) => handleKey(event, false));

socket.on("connect", () => {
  setStatus("Ansluten, väntar på lobby...");
  // Send persistent ID and name to server
  socket.emit("player:register", { persistentId: persistentPlayerId, name: playerName });
});

socket.on("disconnect", () => {
	setStatus("Frånkopplad – försöker ansluta igen...");
	players.clear();
	localId = null;
});

socket.on("world:init", ({ id, players: list, food, gameTimer, gameActive, waitingForStart: waiting }) => {
  localId = id;
  syncPlayers(list);
  foodItems = food || [];
  waitingForStart = waiting || false;
  const myPlayer = players.get(id);
  setStatus(`You are ${myPlayer?.name || "Player"}`);
  
  if (timerEl) {
    timerEl.textContent = gameTimer || 0;
  }
  
  // Start background music when player joins
  startBackgroundMusic();
});socket.on("world:join", (player) => {
	upsertPlayer(player);
});

socket.on("world:leave", ({ id }) => {
	removePlayer(id);
});

socket.on("world:update", (list) => {
  list.forEach((player) => {
    const oldPlayer = players.get(player.id);
    // Check if local player's score increased (they ate food)
    if (player.id === localId && oldPlayer && player.score > oldPlayer.score) {
      playEatSound();
    }
    upsertPlayer(player);
  });
});

socket.on("food:update", (food) => {
  foodItems = food;
});

socket.on("timer:update", ({ time }) => {
  if (timerEl) {
    timerEl.textContent = time;
    
    // Add visual warning when time is running out
    if (time <= 5) {
      timerEl.style.color = "#ff595e";
      timerEl.style.fontSize = "28px";
    } else if (time <= 10) {
      timerEl.style.color = "#ffca3a";
      timerEl.style.fontSize = "26px";
    } else {
      timerEl.style.color = "#fff";
      timerEl.style.fontSize = "24px";
    }
  }
});

socket.on("game:end", ({ winner, scores }) => {
  waitingForStart = true;
  playGameEndSound();
  pauseBackgroundMusic();
  
  // Show winner overlay
  const overlay = document.createElement("div");
  overlay.id = "game-over-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  `;
  
  const content = document.createElement("div");
  content.style.cssText = `
    background: #1a1a1a;
    border: 3px solid ${winner?.color || "#ffca3a"};
    border-radius: 16px;
    padding: 32px;
    text-align: center;
    color: white;
    max-width: 400px;
  `;
  
  if (winner) {
    content.innerHTML = `
      <h1 style="font-size: 36px; margin: 0 0 16px; color: ${winner.color};">
        🏆 ${winner.name} WINS! 🏆
      </h1>
      <p style="font-size: 48px; margin: 0 0 24px; font-weight: 700; color: ${winner.color};">
        ${winner.score} points
      </p>
    `;
  } else {
    content.innerHTML = `
      <h1 style="font-size: 36px; margin: 0 0 16px; color: #ffca3a;">
        Game Over!
      </h1>
    `;
  }
  
  content.innerHTML += `
    <p style="font-size: 18px; margin-top: 24px; padding: 12px; background: rgba(255,202,58,0.1); border-radius: 8px; border: 2px solid #ffca3a;">
      Press <span style="font-weight: 700; color: #ffca3a;">SPACE</span> to start new round
    </p>
  `;
  
  overlay.appendChild(content);
  document.body.appendChild(overlay);
});

socket.on("game:reset", ({ players: list, food, gameTimer }) => {
  waitingForStart = false;
  playGameStartSound();
  resumeBackgroundMusic();
  syncPlayers(list);
  foodItems = food || [];
  
  if (timerEl) {
    timerEl.textContent = gameTimer;
    timerEl.style.color = "#fff";
    timerEl.style.fontSize = "24px";
  }
  
  setStatus("New round started!");
  
  // Remove game over overlay
  const overlay = document.getElementById("game-over-overlay");
  if (overlay) {
    document.body.removeChild(overlay);
  }
});

socket.on("player:death", ({ message, deathType }) => {
  console.log('Death event received:', { message, deathType });
  
  // Reset kill streak when you die
  killStreak = 0;
  
  // Pause background music when dying
  pauseBackgroundMusic();
  
  if (deathType === 'self') {
    playDeathSound();
  } else if (deathType === 'mutual') {
    playKillBySelfSound(); // Avada Kedavra for mutual kills
  } else {
    playDeathSound();
  }
  
  setStatus(`💀 ${message} Laddar om...`);
  
  // Give the sound time to play before reloading
  setTimeout(() => {
    window.location.reload();
  }, 2500);
});

socket.on("player:kill", ({ victim }) => {
  playKillSound();
  console.log(`You killed ${victim}!`);
});

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Draw food
	foodItems.forEach((f) => {
		ctx.fillStyle = "#ffca3a";
		ctx.beginPath();
		ctx.arc(f.x + f.size / 2, f.y + f.size / 2, f.size / 2, 0, Math.PI * 2);
		ctx.fill();
	});

	players.forEach((player) => {
		// Draw snake segments
		player.segments?.forEach((segment, index) => {
			ctx.fillStyle = player.color;
			
			// Head is slightly brighter
			if (index === 0) {
				ctx.globalAlpha = 1.0;
			} else {
				ctx.globalAlpha = 0.85;
			}
			
			ctx.fillRect(segment.x, segment.y, 8, 8);
		});
		
		ctx.globalAlpha = 1.0;

		// Draw border for local player's head
		if (player.id === localId && player.segments?.length > 0) {
			const head = player.segments[0];
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 1;
			ctx.strokeRect(head.x - 1, head.y - 1, 10, 10);
		}

		// Draw name above head
		if (player.segments?.length > 0) {
			const head = player.segments[0];
			ctx.font = "bold 8px 'Segoe UI', Arial, sans-serif";
			ctx.textAlign = "center";
			
			// Draw black outline for better visibility
			ctx.fillStyle = "rgba(0,0,0,0.8)";
			ctx.fillText(player.name ?? player.id, head.x + 4 - 1, head.y - 4);
			ctx.fillText(player.name ?? player.id, head.x + 4 + 1, head.y - 4);
			ctx.fillText(player.name ?? player.id, head.x + 4, head.y - 4 - 1);
			ctx.fillText(player.name ?? player.id, head.x + 4, head.y - 4 + 1);
			
			// Draw white name
			ctx.fillStyle = "white";
			ctx.fillText(player.name ?? player.id, head.x + 4, head.y - 4);
		}
	});

	requestAnimationFrame(draw);
}

draw();
populateShareLinks();
