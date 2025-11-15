# Start Server and Ngrok Tunnel
# This script starts the game server and creates an internet tunnel

Write-Host "🎮 Starting Snake Game Server..." -ForegroundColor Green

# Stop and remove old container if exists
docker rm -f snake-game 2>$null

# Start Docker container
Write-Host "📦 Starting Docker container..." -ForegroundColor Yellow
docker run -d -p 3000:3000 --name snake-game ghcr.io/deltiz/serversnake:latest

# Wait a moment for container to start
Start-Sleep -Seconds 2

# Check if container is running
Write-Host "✅ Container started successfully!" -ForegroundColor Green

# Start ngrok tunnel
Write-Host "`n🌐 Starting ngrok tunnel..." -ForegroundColor Cyan
Write-Host "Press CTRL+C to stop the server and tunnel" -ForegroundColor Yellow
Write-Host "`n📋 Copy the HTTPS URL below and add '/Python-Platformer/index.html' to share with friends!`n" -ForegroundColor Magenta

.\ngrok http 3000
