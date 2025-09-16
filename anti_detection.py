import random
import time
import requests
from fake_useragent import UserAgent
from config import Config

class AntiDetection:
    def __init__(self):
        self.ua = UserAgent()
        self.session = requests.Session()
        self.proxy_index = 0
        self.setup_session()
    
    def setup_session(self):
        """Initialize session with anti-detection measures"""
        self.session.headers.update(Config.DEFAULT_HEADERS)
        self.rotate_user_agent()
        
        if Config.PROXY_LIST:
            self.rotate_proxy()
    
    def rotate_user_agent(self):
        """Rotate user agent to avoid detection"""
        try:
            user_agent = self.ua.random
        except:
            user_agent = random.choice(Config.USER_AGENTS)
        
        self.session.headers.update({'User-Agent': user_agent})
        return user_agent
    
    def rotate_proxy(self):
        """Rotate proxy if available"""
        if not Config.PROXY_LIST:
            return None
            
        proxy = Config.PROXY_LIST[self.proxy_index % len(Config.PROXY_LIST)]
        self.proxy_index += 1
        
        proxy_dict = {
            'http': f'http://{proxy}',
            'https': f'http://{proxy}'
        }
        
        self.session.proxies.update(proxy_dict)
        return proxy
    
    def random_delay(self):
        """Add random delay between requests"""
        delay = random.uniform(Config.MIN_DELAY, Config.MAX_DELAY)
        time.sleep(delay)
        return delay
    
    def get_session(self):
        """Get configured session with anti-detection measures"""
        self.random_delay()
        return self.session
    
    def reset_session(self):
        """Reset session to avoid detection patterns"""
        self.session.close()
        self.session = requests.Session()
        self.setup_session()
