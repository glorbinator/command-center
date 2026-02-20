#!/bin/bash
# Start both the command center and trading service

echo "Starting Glorb Command Center..."
echo "Installing Python dependencies..."

# Ensure Python packages are installed (installed during build, but ensure they're available)
if [ -f "glorb-trader/requirements.txt" ]; then
    pip install --no-cache-dir -r glorb-trader/requirements.txt 2>/dev/null || echo "Python packages may already be installed"
fi

# Start trading service in background using system Python
echo "Starting trading service..."
python trading-service.py &
TRADING_PID=$!

# Give the trading service a moment to start
sleep 3

# Check if trading service is running
if kill -0 $TRADING_PID 2>/dev/null; then
    echo "Trading service started (PID: $TRADING_PID)"
else
    echo "WARNING: Trading service failed to start"
fi

# Start the command center (Node.js)
echo "Starting command center..."
exec node server.js

# If Node.js exits, kill the trading service
trap "kill $TRADING_PID 2>/dev/null" EXIT