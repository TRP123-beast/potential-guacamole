import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Session management (for logged-in users)
    USE_EXISTING_SESSION = os.getenv('USE_EXISTING_SESSION', 'false').lower() == 'true'
    CHROME_PROFILE_PATH = os.getenv('CHROME_PROFILE_PATH', '')
    CHROME_PROFILE_DIR_NAME = os.getenv('CHROME_PROFILE_DIR_NAME', '')
    
    # Proxy settings
    PROXY_LIST = os.getenv('PROXY_LIST', '').split(',') if os.getenv('PROXY_LIST') else []
    
    # Rate limiting
    MIN_DELAY = int(os.getenv('MIN_DELAY', '2'))
    MAX_DELAY = int(os.getenv('MAX_DELAY', '5'))
    REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', '30'))
    
    # Database
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///broker_bay_scraper.db')
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # Broker Bay specific settings
    BASE_URL = "https://www.brokerbay.ca"
    SEARCH_ENDPOINT = "/search"
    PROPERTY_ENDPOINT = "/property"
    
    # User agents for rotation
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"
    ]
    
    # Headers for requests
    DEFAULT_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
