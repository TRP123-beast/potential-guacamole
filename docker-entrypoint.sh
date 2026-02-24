#!/bin/bash
set -e

echo "🚀 Starting BrokerBay Auto-Booking Application..."

# Initialize database with empty tables if it doesn't exist
if [ ! -f /app/src/data/data.db ]; then
    node init-database.js || echo "⚠️ Database initialization failed, but continuing..."
fi

# Clean Chrome lock files from the mounted session profile.
# These are left behind by a previous Chrome process and prevent the
# container's Chromium from loading the profile's saved session/cookies.
SESSION_DIR="${BROWSER_PROFILE_USERDATA:-/app/session-data}"
if [ -d "$SESSION_DIR" ]; then
    echo "🧹 Cleaning Chrome lock files from session profile: $SESSION_DIR"
    for lock_file in \
        "$SESSION_DIR/SingletonLock" \
        "$SESSION_DIR/SingletonCookie" \
        "$SESSION_DIR/SingletonSocket" \
        "$SESSION_DIR/lockfile" \
        "$SESSION_DIR/Default/.com.google.Chrome.NTjLid" \
        "$SESSION_DIR/Default/Cache/Cache_Data/index" \
        "$SESSION_DIR/Default/.org.chromium.Chromium.*"; do
        # Use glob-safe removal
        rm -f "$lock_file" 2>/dev/null || true
    done
    # Also remove any .com.google.Chrome.* temp lock files in the profile root
    find "$SESSION_DIR" -maxdepth 2 \( \
        -name "SingletonLock" \
        -o -name "SingletonCookie" \
        -o -name "SingletonSocket" \
        -o -name ".com.google.Chrome.*" \
        -o -name ".org.chromium.Chromium.*" \
    \) -delete 2>/dev/null || true
    echo "✅ Lock files cleaned"
else
    echo "ℹ️  Session directory not found at $SESSION_DIR, skipping lock cleanup"
fi

# Seed exported session cookies into the volume-mounted data directory.
# The Railway volume at /app/src/data overwrites build-time files, so we
# stashed a copy in /app/session-seed/ during docker build. Copy it in
# on every start so the latest exported cookies are always available.
if [ -f /app/session-seed/exported-session.json ]; then
    cp /app/session-seed/exported-session.json /app/src/data/exported-session.json
    echo "🍪 Seeded exported-session.json into data volume"
else
    echo "ℹ️  No exported-session.json found in build — skipping session seed"
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
