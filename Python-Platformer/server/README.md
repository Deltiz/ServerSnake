# Platformer backend (Express + Socket.IO)

Det här är en liten Node.js-server som gör tre saker:

1. **Sparar speldata i `data.json`.**
   - Frontend skickar JSON (t.ex. spelarnas positioner, highscore) via POST `/api/save`.
   - Servern skriver filen och broadcastar den uppdaterade staten till alla anslutna klienter.

2. **Exponerar REST-endpoints.**
   - `GET /api/state` ger den sparade JSON-staten.
   - `POST /api/save` tar emot ny state.

3. **Realtime med Socket.IO.**
   - Vid anslutning får klienten `state:init` med nuvarande state.
   - När någon sparar ny state skickas `state:update` till alla anslutna.

## Kom igång

```bash
cd server
npm install
npm run dev
```

Servern startar på `http://localhost:3000`.

## Frontend-integration

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js" crossorigin></script>
<script>
  const socket = io("http://localhost:3000");

  socket.on("state:init", (state) => {
    console.log("Current state", state);
  });

  socket.on("state:update", (state) => {
    console.log("Updated state", state);
  });

  async function saveState(newState) {
    await fetch("http://localhost:3000/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newState),
    });
  }
</script>
```

## Varför denna setup?

- **Enkel filbaserad lagring** duger när det är små datamängder och du vill se JSON direkt i repo.
- **Express** ger snabb REST-API för manuell sparning/hämtning.
- **Socket.IO** ger realtidsuppdateringar så alla klienter får nya värden direkt (t.ex. online-scoreboard eller co-op).

När datamängden växer kan du byta ut `data.json` mot t.ex. SQLite eller Mongo utan att ändra client-API:erna.
