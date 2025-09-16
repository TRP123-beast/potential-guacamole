#!/bin/bash

echo "🚀 Setting up Broker Bay Scraper..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "scrapper" ]; then
    echo "❌ Virtual environment 'scrapper' not found. Please create it first:"
    echo "   python3 -m venv scrapper"
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source scrapper/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
python3 -m pip install --upgrade pip

# Install required packages
echo "📥 Installing required packages..."
python3 -m pip install -r requirements.txt

# Install Chrome/Chromium if not present
if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null; then
    echo "⚠️  Chrome/Chromium not found. Installing Chromium..."
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y chromium-browser
        # CentOS/RHEL
        elif command -v yum &> /dev/null; then
            sudo yum install -y chromium
        # Arch Linux
        elif command -v pacman &> /dev/null; then
            sudo pacman -S chromium
        else
            echo "❌ Could not detect package manager. Please install Chrome/Chromium manually."
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install --cask google-chrome
        else
            echo "❌ Homebrew not found. Please install Chrome manually."
        fi
    else
        echo "❌ Unsupported OS. Please install Chrome/Chromium manually."
    fi
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp env_example.txt .env
    echo "⚠️  Please edit .env file and add your 2captcha API key for captcha solving."
fi

# Make main.py executable
chmod +x main.py

# Create data directory
mkdir -p data

echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file and add your 2captcha API key"
echo "2. Test the scraper: python3 main.py search '123 Main St, Toronto, ON'"
echo "3. View help: python3 main.py --help"
echo ""
echo "🔧 Configuration:"
echo "- Edit config.py to modify scraping settings"
echo "- Add proxy servers to .env file if needed"
echo "- Adjust rate limiting in .env file"
