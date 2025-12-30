#!/bin/bash

# Make sure the script stops on errors
set -e

# Navigate to script directory
cd "$(dirname "$0")"


# Kill anything on port 3000 (React)
if lsof -i :3000 >/dev/null; then
    echo "Killing process on port 3000..."
    lsof -t -i :3000 | xargs kill -9
fi

# Start Flask in background
echo "Starting Flask on port 5000..."
cd backend
python3 app.py &
cd ..

# Start React in background
echo "Starting React on port 3000..."
cd frontend
npm start &
cd ..

# Give React a few seconds to start
sleep 5


echo "All set! Flask and React are running."
