#!/bin/bash
# Start both the command center and trading service

# Start trading service in background
python trading-service.py &
TRADING_PID=$!

# Give the trading service a moment to start
sleep 2

# Start the command center (Node.js)
exec node server.js

# If Node.js exits, kill the trading service
trap "kill $TRADING_PID" EXIT