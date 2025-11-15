# ServerSnake 🐍

A multiplayer snake game with real-time gameplay, sound effects, and background music.

## Features

- 🎮 Real-time multiplayer gameplay
- 🎵 Background music (Never-Ending High Score)
- 🔊 Sound effects (eat, death, kills, Avada Kedavra)
- 🏆 Kill streak system (first, second, third kill)
- 💀 Mutual kill detection with special sound
- 🎨 Color-coded player names
- ⏱️ 60-second rounds
- 🔄 Restart button

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5 Canvas, JavaScript
- **Deployment**: Docker

## Getting Started

### Local Development

1. Install dependencies:
```bash
cd Python-Platformer/server
npm install
```

2. Run the server:
```bash
node index.js
```

3. Open browser: `http://localhost:3000/Python-Platformer/index.html`

### Docker

Build and run:
```bash
docker build -t snake-game .
docker run -d -p 3000:3000 --name snake-game-container snake-game
```

## Game Controls

- **Arrow Keys**: Move snake
- **Space**: Start new round (when waiting)
- **Restart Button**: Reload game if bugs occur

## Network Play

The server displays local network addresses when starting. Share these with friends on the same network to play together!

## Project Structure

```
ServerSnake/
├── Dockerfile              # Docker configuration
├── .dockerignore          # Docker ignore rules
├── Python-Platformer/     # Game client
│   ├── index.html         # Game UI
│   ├── app.js            # Client logic
│   ├── style.css         # Styling
│   └── server/           # Game server
│       ├── index.js      # Server logic
│       └── package.json  # Dependencies
└── Sound/                # Audio files
    ├── eat-kandysound.mp3
    ├── deathsound.mp3
    ├── fristKill.mp3
    ├── secoundKill.mp3
    ├── thridKill.mp3
    ├── killbytheself.mp3
    └── Never-Ending High Score.mp3
```

## License

MIT
