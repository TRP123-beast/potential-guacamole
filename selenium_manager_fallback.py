import time
import random
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from fake_useragent import UserAgent
from config import Config

class SeleniumManager:
    def __init__(self, headless=True):
        self.driver = None
        self.headless = headless
        self.ua = UserAgent()
        self.setup_driver()
    
    def setup_driver(self):
        """Setup Chrome driver with fallback for Python 3.12"""
        options = Options()
        
        if self.headless:
            options.add_argument('--headless')
        
        # Anti-detection arguments
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Use existing Chrome profile if configured
        if Config.USE_EXISTING_SESSION and Config.CHROME_PROFILE_PATH:
            if os.path.exists(Config.CHROME_PROFILE_PATH):
                options.add_argument(f'--user-data-dir={Config.CHROME_PROFILE_PATH}')
                print(f"Using existing Chrome profile: {Config.CHROME_PROFILE_PATH}")
            else:
                print(f"Chrome profile path not found: {Config.CHROME_PROFILE_PATH}")
                print("Continuing without existing session...")
        else:
            # Random user agent for new sessions
            user_agent = self.ua.random
            options.add_argument(f'--user-agent={user_agent}')
        
        # Window size randomization
        width = random.randint(1200, 1920)
        height = random.randint(800, 1080)
        options.add_argument(f'--window-size={width},{height}')
        
        # Additional anti-detection arguments
        options.add_argument('--disable-web-security')
        options.add_argument('--allow-running-insecure-content')
        options.add_argument('--disable-extensions')
        options.add_argument('--disable-plugins')
        options.add_argument('--disable-images')
        
        try:
            # Use webdriver-manager to handle Chrome driver
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            
            # Execute script to remove webdriver property
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            # Check if we're logged in to Broker Bay
            if Config.USE_EXISTING_SESSION:
                self.check_login_status()
                
        except Exception as e:
            print(f"Failed to setup Chrome driver: {e}")
            raise
    
    def check_login_status(self):
        """Check if user is logged in to Broker Bay"""
        try:
            self.driver.get(Config.BASE_URL)
            self.random_delay(2, 3)
            
            # Look for login indicators
            login_indicators = [
                "//a[contains(text(), 'Logout')]",
                "//a[contains(text(), 'Sign Out')]",
                "//button[contains(text(), 'Logout')]",
                "//div[contains(@class, 'user-menu')]",
                "//div[contains(@class, 'account')]"
            ]
            
            logged_in = False
            for indicator in login_indicators:
                try:
                    element = self.driver.find_element(By.XPATH, indicator)
                    if element and element.is_displayed():
                        logged_in = True
                        print("✅ Successfully using existing logged-in session")
                        break
                except:
                    continue
            
            if not logged_in:
                print("⚠️  No logged-in session detected. You may need to log in manually.")
                print("   The scraper will continue but may encounter login prompts.")
                
        except Exception as e:
            print(f"⚠️  Could not verify login status: {e}")
            print("   The scraper will continue but may encounter login prompts.")
    
    def random_delay(self, min_delay=1, max_delay=3):
        """Add random delay"""
        delay = random.uniform(min_delay, max_delay)
        time.sleep(delay)
        return delay
    
    def wait_for_element(self, by, value, timeout=10):
        """Wait for element to be present and visible"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            return None
    
    def wait_for_clickable(self, by, value, timeout=10):
        """Wait for element to be clickable"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            return None
    
    def safe_click(self, by, value, timeout=10):
        """Safely click element with retry"""
        for attempt in range(3):
            try:
                element = self.wait_for_clickable(by, value, timeout)
                if element:
                    self.driver.execute_script("arguments[0].click();", element)
                    self.random_delay(0.5, 1.5)
                    return True
            except Exception as e:
                print(f"Click attempt {attempt + 1} failed: {e}")
                self.random_delay(1, 2)
        
        return False
    
    def safe_send_keys(self, by, value, text, timeout=10):
        """Safely send keys to element"""
        try:
            element = self.wait_for_element(by, value, timeout)
            if element:
                element.clear()
                for char in text:
                    element.send_keys(char)
                    time.sleep(random.uniform(0.05, 0.15))
                return True
        except Exception as e:
            print(f"Send keys failed: {e}")
        
        return False
    
    def check_for_captcha(self):
        """Check if captcha is present on page"""
        captcha_selectors = [
            "iframe[src*='recaptcha']",
            ".g-recaptcha",
            "#captcha",
            ".captcha",
            "iframe[src*='hcaptcha']"
        ]
        
        for selector in captcha_selectors:
            try:
                if self.driver.find_element(By.CSS_SELECTOR, selector):
                    return True
            except NoSuchElementException:
                continue
        
        return False
    
    def get_page_source(self):
        """Get page source with error handling"""
        try:
            return self.driver.page_source
        except Exception as e:
            print(f"Failed to get page source: {e}")
            return None
    
    def close(self):
        """Close driver"""
        if self.driver:
            self.driver.quit()
            self.driver = None
