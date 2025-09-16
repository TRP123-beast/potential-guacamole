#!/usr/bin/env python3
"""
Setup script for Broker Bay Scraper
This script helps with initial setup and dependency installation
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        print(f"Error output: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    print("🐍 Checking Python version...")
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ is required")
        return False
    print(f"✅ Python {sys.version.split()[0]} is compatible")
    return True

def check_virtual_environment():
    """Check if virtual environment exists"""
    print("📦 Checking virtual environment...")
    venv_path = Path("scrapper")
    if not venv_path.exists():
        print("❌ Virtual environment 'scrapper' not found")
        print("Please create it first: python3 -m venv scrapper")
        return False
    print("✅ Virtual environment found")
    return True

def install_dependencies():
    """Install required dependencies"""
    print("📥 Installing dependencies...")
    
    # Activate virtual environment and install
    commands = [
        "source scrapper/bin/activate && python -m pip install --upgrade pip",
        "source scrapper/bin/activate && pip install -r requirements.txt"
    ]
    
    for command in commands:
        if not run_command(command, f"Running: {command.split('&&')[1].strip()}"):
            return False
    
    return True

def create_env_file():
    """Create .env file if it doesn't exist"""
    print("📝 Setting up environment file...")
    
    if not os.path.exists(".env"):
        if os.path.exists("env_example.txt"):
            run_command("cp env_example.txt .env", "Creating .env file")
            print("⚠️  Please edit .env file and add your 2captcha API key")
        else:
            print("❌ env_example.txt not found")
            return False
    else:
        print("✅ .env file already exists")
    
    return True

def test_installation():
    """Test if installation was successful"""
    print("🧪 Testing installation...")
    
    test_command = "source scrapper/bin/activate && python test_scraper.py"
    return run_command(test_command, "Running installation test")

def main():
    """Main setup function"""
    print("🚀 Broker Bay Scraper Setup")
    print("=" * 40)
    
    # Check prerequisites
    if not check_python_version():
        sys.exit(1)
    
    if not check_virtual_environment():
        sys.exit(1)
    
    # Install dependencies
    if not install_dependencies():
        print("❌ Dependency installation failed")
        sys.exit(1)
    
    # Setup environment
    if not create_env_file():
        print("❌ Environment setup failed")
        sys.exit(1)
    
    # Test installation
    print("\n🤔 Would you like to run installation tests? (y/N): ", end="")
    response = input().lower()
    if response in ['y', 'yes']:
        test_installation()
    
    print("\n✅ Setup completed successfully!")
    print("\n📋 Next steps:")
    print("1. Edit .env file and add your 2captcha API key")
    print("2. Test the scraper: python3 main.py search '123 Main St, Toronto, ON'")
    print("3. View help: python3 main.py --help")

if __name__ == '__main__':
    main()
