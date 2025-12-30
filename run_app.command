#!/bin/bash

# Exit on error
set -e

# Move to the directory where this script lives
cd "$(dirname "$0")"

echo "Starting Flask..."
python3 backend/app.py &

echo "Starting React..."
cd frontend
npm start &

# Wait for React to compile
sleep 10

echo "Opening browser..."
open http://localhost:3000
