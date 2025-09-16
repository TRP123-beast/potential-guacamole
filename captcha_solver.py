import time
import base64
from twocaptcha import TwoCaptcha
from config import Config

class CaptchaSolver:
    def __init__(self):
        self.solver = TwoCaptcha(Config.CAPTCHA_API_KEY) if Config.CAPTCHA_API_KEY else None
    
    def solve_recaptcha_v2(self, site_key, page_url):
        """Solve reCAPTCHA v2"""
        if not self.solver:
            raise Exception("2captcha API key not configured")
        
        try:
            result = self.solver.recaptcha(
                sitekey=site_key,
                url=page_url
            )
            return result['code']
        except Exception as e:
            print(f"Captcha solving failed: {e}")
            return None
    
    def solve_hcaptcha(self, site_key, page_url):
        """Solve hCaptcha"""
        if not self.solver:
            raise Exception("2captcha API key not configured")
        
        try:
            result = self.solver.hcaptcha(
                sitekey=site_key,
                url=page_url
            )
            return result['code']
        except Exception as e:
            print(f"hCaptcha solving failed: {e}")
            return None
    
    def solve_image_captcha(self, image_path):
        """Solve image-based captcha"""
        if not self.solver:
            raise Exception("2captcha API key not configured")
        
        try:
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            result = self.solver.normal(
                image_data
            )
            return result['code']
        except Exception as e:
            print(f"Image captcha solving failed: {e}")
            return None
    
    def solve_captcha_from_base64(self, base64_image):
        """Solve captcha from base64 encoded image"""
        if not self.solver:
            raise Exception("2captcha API key not configured")
        
        try:
            image_data = base64.b64decode(base64_image)
            result = self.solver.normal(image_data)
            return result['code']
        except Exception as e:
            print(f"Base64 captcha solving failed: {e}")
            return None
