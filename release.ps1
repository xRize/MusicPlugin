# Release script for MediaPlugin
Write-Host "Stopping existing MediaCompanion process..."
Stop-Process -Name MediaCompanion -ErrorAction SilentlyContinue

# Build Helper
Write-Host "Building Helper (Companion App)..."
cd helper
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ../temp-companion
cd ..

# Build Plugin
Write-Host "Building Plugin..."
cd plugin-advanced-ts-vite
npm run build
cd ..

# Create release folder
Write-Host "Creating flat release folder 'MediaPlugin'..."
if (Test-Path "MediaPlugin") { Remove-Item "MediaPlugin" -Recurse -Force }
mkdir MediaPlugin

# Copy files
Copy-Item -Path temp-companion/MediaCompanion.exe -Destination MediaPlugin/MediaCompanion.exe -Force
Copy-Item -Path plugin-advanced-ts-vite/dist/* -Destination MediaPlugin/ -Force
# Use the README from the project root or copy it manually if you update it
# For now, let's copy from the existing one in the MediaPlugin folder we just created (wait, it doesn't exist yet)
# I'll create it here or copy from a template
Copy-Item -Path MediaPlugin/README.txt -Destination MediaPlugin/README.txt -ErrorAction SilentlyContinue

# Create README if not copied
if (-not (Test-Path "MediaPlugin/README.txt")) {
    $readme = @"
MusicPlugin - Pengu Loader & Media Companion

Plug-and-Play Instructions:

1. INSTALL:
   - Copy this entire folder (you can rename it to 'MediaPlugin') to your Pengu Loader 'plugins' directory.

2. COMPLETELY HANDS-FREE:
   - Once installed, you can simply run League of Legends.
   - The plugin will automatically try to initialize 'MediaCompanion.exe' using available native APIs.
   - If it doesn't start automatically on your first run, just run 'MediaCompanion.exe' once manually.
   - From then on, it will register itself to start with Windows and run silently in the background.
   - It stays dormant when League is closed and activates automatically when the game starts.

3. START LEAGUE:
   - Restart or Reload your League of Legends client.

The media widget will appear when music is playing.

Features:
- Playback control (Play/Pause, Skip).
- DRAG-AND-DROP: Click and drag the widget to reposition it anywhere on your screen.
- Sleek wide design.
- Automatic reconnection.
- No performance impact on League of Legends.

DEBUGGING:
- If you don't see the widget:
  1. Press Ctrl+Shift+I in the League client to open the developer console.
  2. Look for logs starting with [MediaPlugin].
  3. Check if there's a "Connected to companion" message.
  4. If you see "WebSocket error", ensure MediaCompanion.exe is running (check Task Manager) and not blocked by a firewall.
  5. Check if another plugin or the client UI is covering the widget.
"@
    $readme | Out-File -FilePath "MediaPlugin/README.txt" -Encoding utf8
}

# Cleanup
Remove-Item "temp-companion" -Recurse -Force

Write-Host "Release completed in 'MediaPlugin' folder."
