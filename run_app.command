#!/bin/bash

# === Kill ports if in use ===
echo "Killing ports 5000 and 3000 if occupied..."
lsof -ti :5000 | xargs -r kill -9
lsof -ti :3000 | xargs -r kill -9

# === Start Flask in a new Terminal tab ===
echo "Starting Flask backend..."
osascript <<EOF
tell application "Terminal"
    do script "cd /Users/fiscalteam/Desktop/DataCleaningHealth/DataCleanHealthApp/backend && python3 app.py"
end tell
EOF

# === Start React in a new Terminal tab ===
echo "Starting React frontend..."
osascript <<EOF
tell application "Terminal"
    do script "cd /Users/fiscalteam/Desktop/DataCleaningHealth/DataCleanHealthApp/frontend && npm start"
end tell
EOF

echo "Both servers should now be running in separate Terminal tabs."