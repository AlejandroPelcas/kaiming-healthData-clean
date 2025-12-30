#!/bin/bash
cd /path/to/your/project

echo "Starting Flask..."
python backend/app.py &

echo "Starting React..."
cd frontend
npm start &

sleep 5
open http://localhost:3000
