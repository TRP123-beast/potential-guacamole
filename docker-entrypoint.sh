#!/bin/bash
set -e

echo "🚀 Starting BrokerBay Auto-Booking Application..."

# Initialize database with empty tables if it doesn't exist
if [ ! -f /app/src/data/data.db ]; then
    node init-database.js || echo "⚠️ Database initialization failed, but continuing..."
fi

# Start D-Bus for Chromium stability in containers
if command -v dbus-daemon &> /dev/null; then
    mkdir -p /var/run/dbus
    dbus-daemon --system --fork 2>/dev/null || true
    echo "🔌 D-Bus started for Chromium stability"
fi

# Start the auto-booking worker in the background
# (v2: uses in-process booking + auto-cancel sweep via shared headless Chromium)
echo "🤖 Starting event-driven auto-booking worker (v2)..."
node auto-booking-worker.js &
WORKER_PID=$!

# Start the main dashboard server
echo "🌐 Starting dashboard server on port ${PORT:-3000}..."
node dashboard-server.js &
SERVER_PID=$!

# Function to handle shutdown gracefully
shutdown() {
    echo ""
    echo "🛑 Shutting down services..."
    kill -TERM $WORKER_PID 2>/dev/null || true
    kill -TERM $SERVER_PID 2>/dev/null || true
    wait $WORKER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

# Trap termination signals
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait $SERVER_PID $WORKER_PID
