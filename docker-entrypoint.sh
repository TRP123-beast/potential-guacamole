#!/bin/bash
set -e

echo "🚀 Starting BrokerBay Auto-Booking Application..."

# Initialize database with empty tables if it doesn't exist
if [ ! -f /app/src/data/data.db ]; then
    echo "📦 Initializing database..."
    node -e "
    import Database from 'better-sqlite3';
    const db = new Database('/app/src/data/data.db');
    db.exec(\`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT,
        property_address TEXT,
        booking_date TEXT,
        booking_time TEXT,
        duration TEXT,
        user_name TEXT,
        user_email TEXT,
        organization TEXT,
        showing_type TEXT,
        status TEXT,
        auto_confirmed INTEGER DEFAULT 0,
        booking_url TEXT,
        screenshot_path TEXT,
        confirmation_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS processed_showing_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        property_id TEXT NOT NULL,
        status TEXT,
        group_name TEXT,
        scheduled_date TEXT,
        scheduled_time TEXT,
        created_at TEXT,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id TEXT UNIQUE,
        address TEXT,
        price INTEGER,
        price_change INTEGER DEFAULT 0,
        status TEXT,
        bedrooms INTEGER,
        bathrooms INTEGER,
        sqft INTEGER,
        listing_date TEXT,
        last_updated TEXT,
        mls_number TEXT,
        agent TEXT,
        agent_phone TEXT,
        description TEXT,
        features TEXT,
        details_json TEXT,
        rooms_json TEXT,
        url TEXT,
        property_type TEXT,
        year_built INTEGER,
        lot_size TEXT,
        parking_spaces INTEGER,
        organization TEXT,
        organization_address TEXT,
        UNIQUE(property_id)
      );
    \`);
    db.close();
    console.log('✅ Database initialized');
    " || echo "⚠️ Database initialization skipped"
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

