#!/bin/bash
# =============================================================================
# prepare-chrome-session.sh
# =============================================================================
# Extracts only the essential session files from a Chrome profile for
# embedding into the Docker image. This keeps the image small (~5-20MB
# instead of the full profile which can be 500MB+).
#
# Usage:
#   ./prepare-chrome-session.sh [source_profile_path]
#
# Default source: ~/.var/app/com.google.Chrome/docker-profile
# Output:        ./chrome-session/  (ready for Docker COPY)
# =============================================================================

set -e

SOURCE="${1:-$HOME/.var/app/com.google.Chrome/docker-profile}"
DEST="./chrome-session"

if [ ! -d "$SOURCE" ]; then
    echo "❌ Source profile not found: $SOURCE"
    echo "Usage: $0 [path/to/chrome/profile]"
    exit 1
fi

echo "🔍 Source profile: $SOURCE"
echo "📁 Output dir:    $DEST"

# Clean previous export
rm -rf "$DEST"
mkdir -p "$DEST/Default/Network"
mkdir -p "$DEST/Default/Local Storage/leveldb"
mkdir -p "$DEST/Default/Session Storage"

# --- Essential files for session persistence ---

# 1. Cookies (most critical for staying logged in)
for cookie_path in \
    "$SOURCE/Default/Network/Cookies" \
    "$SOURCE/Default/Cookies" \
    ; do
    if [ -f "$cookie_path" ]; then
        cp "$cookie_path" "$DEST/Default/Network/Cookies"
        echo "  ✓ Cookies"
        break
    fi
done

# Cookies journal
for journal_path in \
    "$SOURCE/Default/Network/Cookies-journal" \
    "$SOURCE/Default/Cookies-journal" \
    ; do
    if [ -f "$journal_path" ]; then
        cp "$journal_path" "$DEST/Default/Network/Cookies-journal"
        echo "  ✓ Cookies-journal"
        break
    fi
done

# 2. Local Storage (site-specific tokens)
if [ -d "$SOURCE/Default/Local Storage/leveldb" ]; then
    cp -r "$SOURCE/Default/Local Storage/leveldb/"* "$DEST/Default/Local Storage/leveldb/" 2>/dev/null || true
    echo "  ✓ Local Storage"
fi

# 3. Session Storage
if [ -d "$SOURCE/Default/Session Storage" ]; then
    cp -r "$SOURCE/Default/Session Storage/"* "$DEST/Default/Session Storage/" 2>/dev/null || true
    echo "  ✓ Session Storage"
fi

# 5. Preferences files
for f in "Preferences" "Secure Preferences"; do
    if [ -f "$SOURCE/Default/$f" ]; then
        cp "$SOURCE/Default/$f" "$DEST/Default/"
        echo "  ✓ $f"
    fi
done

# 6. Local State (top-level Chrome state)
if [ -f "$SOURCE/Local State" ]; then
    cp "$SOURCE/Local State" "$DEST/"
    echo "  ✓ Local State"
fi

# 7. Login Data (saved passwords — needed for auto-login)
for f in "Login Data" "Login Data-journal"; do
    if [ -f "$SOURCE/Default/$f" ]; then
        cp "$SOURCE/Default/$f" "$DEST/Default/"
        echo "  ✓ $f"
    fi
done

# Calculate size
SIZE=$(du -sh "$DEST" | cut -f1)
echo ""
echo "✅ Chrome session extracted: $DEST ($SIZE)"
echo "   Ready for Docker build — run: docker-compose build"
echo ""
echo "⚠️  Remember to re-run this script whenever you re-login to BrokerBay locally!"
