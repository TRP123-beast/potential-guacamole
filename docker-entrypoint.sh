#!/bin/bash
set -e

echo "🚀 Starting BrokerBay Auto-Booking Application..."

# Initialize database with empty tables if it doesn't exist
if [ ! -f /app/src/data/data.db ]; then
    node init-database.js || echo "⚠️ Database initialization failed, but continuing..."
fi

# Start the scheduler in the background
echo "⏰ Starting automated fetch scheduler..."
node scheduler.js &
SCHEDULER_PID=$!

# Start the main dashboard server
echo "🌐 Starting dashboard server on port ${DASHBOARD_PORT:-3000}..."
node dashboard-server.js &
SERVER_PID=$!

# Function to handle shutdown gracefully
shutdown() {
    echo ""
    echo "🛑 Shutting down services..."
    kill -TERM $SCHEDULER_PID 2>/dev/null || true
    kill -TERM $SERVER_PID 2>/dev/null || true
    wait $SCHEDULER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

# Trap termination signals
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait $SERVER_PID $SCHEDULER_PID

