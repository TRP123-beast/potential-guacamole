import time
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from selenium_manager import SeleniumManager
from property_parser import PropertyParser
from captcha_solver import CaptchaSolver

class BookingSystem:
    def __init__(self, selenium_manager: SeleniumManager, captcha_solver: CaptchaSolver):
        self.selenium_manager = selenium_manager
        self.captcha_solver = captcha_solver
        self.property_parser = PropertyParser()
        self.logger = logging.getLogger(__name__)
    
    def book_viewing(self, property_data: Dict, selected_time: Dict, contact_info: Dict) -> bool:
        """Book a property viewing"""
        try:
            self.logger.info(f"Booking viewing for property: {property_data.get('property_id', 'Unknown')}")
            
            # Navigate to booking page
            booking_url = self.get_booking_url(property_data)
            if not booking_url:
                self.logger.error("Could not determine booking URL")
                return False
            
            self.selenium_manager.driver.get(booking_url)
            self.selenium_manager.random_delay(2, 4)
            
            # Check for captcha
            if self.selenium_manager.check_for_captcha():
                self.logger.warning("Captcha detected on booking page")
                if not self.solve_captcha():
                    return False
            
            # Fill booking form
            booking_success = self.fill_booking_form(property_data, selected_time, contact_info)
            if not booking_success:
                self.logger.error("Failed to fill booking form")
                return False
            
            # Submit booking
            submit_success = self.submit_booking()
            if not submit_success:
                self.logger.error("Failed to submit booking")
                return False
            
            # Verify booking
            verification_success = self.verify_booking()
            if verification_success:
                self.logger.info("Booking successful!")
                return True
            else:
                self.logger.warning("Booking verification failed")
                return False
            
        except Exception as e:
            self.logger.error(f"Error booking viewing: {e}")
            return False
    
    def get_booking_url(self, property_data: Dict) -> Optional[str]:
        """Get booking URL for property"""
        try:
            # Common booking URL patterns
            property_id = property_data.get('property_id', '')
            property_url = property_data.get('url', '')
            
            if property_id:
                booking_patterns = [
                    f"/book/{property_id}",
                    f"/booking/{property_id}",
                    f"/schedule/{property_id}",
                    f"/viewing/{property_id}"
                ]
                
                for pattern in booking_patterns:
                    booking_url = f"{property_data.get('base_url', '')}{pattern}"
                    # Test if URL exists (you could add a HEAD request here)
                    return booking_url
            
            # Try to find booking link on property page
            if property_url:
                self.selenium_manager.driver.get(property_url)
                self.selenium_manager.random_delay(1, 2)
                
                booking_selectors = [
                    'a[href*="book"]',
                    'a[href*="booking"]',
                    'a[href*="schedule"]',
                    'a[href*="viewing"]',
                    '.book-viewing',
                    '.schedule-viewing'
                ]
                
                for selector in booking_selectors:
                    element = self.selenium_manager.driver.find_element('css', selector)
                    if element:
                        href = element.get_attribute('href')
                        if href:
                            return href
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting booking URL: {e}")
            return None
    
    def fill_booking_form(self, property_data: Dict, selected_time: Dict, contact_info: Dict) -> bool:
        """Fill the booking form with required information"""
        try:
            # Fill contact information
            contact_fields = {
                'name': contact_info.get('name', ''),
                'email': contact_info.get('email', ''),
                'phone': contact_info.get('phone', ''),
                'message': contact_info.get('message', '')
            }
            
            for field_name, field_value in contact_fields.items():
                if not field_value:
                    continue
                
                field_selectors = [
                    f'input[name="{field_name}"]',
                    f'input[id*="{field_name}"]',
                    f'textarea[name="{field_name}"]',
                    f'textarea[id*="{field_name}"]'
                ]
                
                for selector in field_selectors:
                    if self.selenium_manager.safe_send_keys('css', selector, field_value):
                        break
            
            # Select date and time
            date_time_success = self.select_date_time(selected_time)
            if not date_time_success:
                self.logger.error("Failed to select date and time")
                return False
            
            # Select property (if multiple properties)
            if property_data.get('property_id'):
                property_selectors = [
                    f'input[value="{property_data["property_id"]}"]',
                    f'option[value="{property_data["property_id"]}"]'
                ]
                
                for selector in property_selectors:
                    if self.selenium_manager.safe_click('css', selector):
                        break
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error filling booking form: {e}")
            return False
    
    def select_date_time(self, selected_time: Dict) -> bool:
        """Select date and time for viewing"""
        try:
            # Select date
            date_value = selected_time.get('date', '')
            if date_value:
                date_selectors = [
                    'input[name="date"]',
                    'input[name="viewing_date"]',
                    'input[type="date"]',
                    '#viewing-date'
                ]
                
                for selector in date_selectors:
                    if self.selenium_manager.safe_send_keys('css', selector, date_value):
                        break
            
            # Select time
            time_value = selected_time.get('time', '')
            if time_value:
                time_selectors = [
                    'select[name="time"]',
                    'select[name="viewing_time"]',
                    '#viewing-time'
                ]
                
                for selector in time_selectors:
                    if self.select_time_option(selector, time_value):
                        break
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error selecting date/time: {e}")
            return False
    
    def select_time_option(self, selector: str, time_value: str) -> bool:
        """Select time option from dropdown"""
        try:
            from selenium.webdriver.support.ui import Select
            
            select_element = self.selenium_manager.wait_for_element('css', selector)
            if not select_element:
                return False
            
            select = Select(select_element)
            
            # Try to select by value
            try:
                select.select_by_value(time_value)
                return True
            except:
                pass
            
            # Try to select by visible text
            try:
                select.select_by_visible_text(time_value)
                return True
            except:
                pass
            
            # Try partial match
            for option in select.options:
                if time_value in option.text or option.text in time_value:
                    select.select_by_visible_text(option.text)
                    return True
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error selecting time option: {e}")
            return False
    
    def submit_booking(self) -> bool:
        """Submit the booking form"""
        try:
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[class*="submit"]',
                'button[class*="book"]',
                '.submit-booking',
                '#submit-booking'
            ]
            
            for selector in submit_selectors:
                if self.selenium_manager.safe_click('css', selector):
                    self.selenium_manager.random_delay(2, 4)
                    return True
            
            self.logger.error("Could not find submit button")
            return False
            
        except Exception as e:
            self.logger.error(f"Error submitting booking: {e}")
            return False
    
    def verify_booking(self) -> bool:
        """Verify that booking was successful"""
        try:
            # Look for success indicators
            success_selectors = [
                '.booking-success',
                '.success-message',
                '.confirmation',
                '[class*="success"]',
                '[class*="confirm"]'
            ]
            
            for selector in success_selectors:
                element = self.selenium_manager.driver.find_element('css', selector)
                if element and element.is_displayed():
                    success_text = element.text.lower()
                    if any(word in success_text for word in ['success', 'confirmed', 'booked', 'scheduled']):
                        return True
            
            # Check for error indicators
            error_selectors = [
                '.error',
                '.error-message',
                '[class*="error"]'
            ]
            
            for selector in error_selectors:
                element = self.selenium_manager.driver.find_element('css', selector)
                if element and element.is_displayed():
                    self.logger.warning(f"Booking error: {element.text}")
                    return False
            
            # Check URL for success indicators
            current_url = self.selenium_manager.driver.current_url
            if any(word in current_url.lower() for word in ['success', 'confirm', 'booked']):
                return True
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error verifying booking: {e}")
            return False
    
    def solve_captcha(self) -> bool:
        """Solve captcha on booking page"""
        try:
            # Check for reCAPTCHA
            recaptcha_element = self.selenium_manager.driver.find_element('css', '.g-recaptcha')
            if recaptcha_element:
                site_key = recaptcha_element.get_attribute('data-sitekey')
                if site_key:
                    solution = self.captcha_solver.solve_recaptcha_v2(
                        site_key,
                        self.selenium_manager.driver.current_url
                    )
                    if solution:
                        self.selenium_manager.driver.execute_script(
                            f"document.getElementById('g-recaptcha-response').innerHTML='{solution}'"
                        )
                        return True
            
            # Check for hCaptcha
            hcaptcha_element = self.selenium_manager.driver.find_element('css', '.h-captcha')
            if hcaptcha_element:
                site_key = hcaptcha_element.get_attribute('data-sitekey')
                if site_key:
                    solution = self.captcha_solver.solve_hcaptcha(
                        site_key,
                        self.selenium_manager.driver.current_url
                    )
                    if solution:
                        self.selenium_manager.driver.execute_script(
                            f"document.querySelector('[name=\"h-captcha-response\"]').value='{solution}'"
                        )
                        return True
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error solving captcha: {e}")
            return False
