import time
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from selenium_manager import SeleniumManager
from property_parser import PropertyParser
from anti_detection import AntiDetection
from config import Config

class BrokerBayScraper:
    def __init__(self, headless=True):
        self.selenium_manager = SeleniumManager(headless=headless)
        self.property_parser = PropertyParser()
        self.anti_detection = AntiDetection()
        self.setup_logging()
        
    def setup_logging(self):
        """Setup logging configuration"""
        logging.basicConfig(
            level=getattr(logging, Config.LOG_LEVEL),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('broker_bay_scraper.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def search_property_by_address(self, address: str) -> Optional[Dict]:
        """Search for property by Canadian address"""
        try:
            self.logger.info(f"Searching for property: {address}")
            
            # Parse address components
            address_components = self.property_parser.parse_property_address(address)
            self.logger.info(f"Parsed address: {address_components}")
            
            # Navigate to home/search page (data-first approach)
            search_url = f"{Config.BASE_URL}"
            self.selenium_manager.driver.get(search_url)
            self.selenium_manager.random_delay(2, 4)
            
            # Check for captcha (informational only - user should be logged in)
            if self.selenium_manager.check_for_captcha():
                self.logger.warning("Captcha detected - you may need to solve manually")
                self.logger.info("Continuing with scraping...")
            
            # Try to use a single search box if present (omnibox)
            if not self.try_omnibox_search(address_components['full_address']):
                # Fallback to structured form
                search_success = self.fill_search_form(address_components)
                if not search_success:
                    self.logger.error("Failed to fill search form")
                    # As last resort, try site-wide search anchors/links
                    self.try_sitewide_search(address_components['full_address'])
            
            # Wait for results
            self.selenium_manager.random_delay(3, 5)
            
            # Parse search results
            results = self.parse_search_results()
            if not results:
                self.logger.warning("No search results found")
                return None
            
            # Find exact match
            property_data = self.find_exact_match(results, address_components)
            if property_data:
                self.logger.info(f"Found property: {property_data.get('property_id', 'Unknown ID')}")
                return property_data
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error searching property: {e}")
            return None
    
    def fill_search_form(self, address_components: Dict) -> bool:
        """Fill the search form with address components"""
        try:
            # Common search form selectors
            address_selectors = [
                'input[name="address"]',
                'input[placeholder*="address"]',
                'input[id*="address"]',
                '#search-address',
                '.search-address'
            ]
            
            city_selectors = [
                'input[name="city"]',
                'input[placeholder*="city"]',
                'input[id*="city"]',
                '#search-city',
                '.search-city'
            ]
            
            province_selectors = [
                'select[name="province"]',
                'select[name="state"]',
                'select[id*="province"]',
                '#search-province'
            ]
            
            # Fill address field
            address_filled = False
            for selector in address_selectors:
                if self.selenium_manager.safe_send_keys('css', selector, address_components['full_address']):
                    address_filled = True
                    break
            
            if not address_filled:
                self.logger.warning("Could not find address input field")
            
            # Fill city field
            if address_components['city']:
                city_filled = False
                for selector in city_selectors:
                    if self.selenium_manager.safe_send_keys('css', selector, address_components['city']):
                        city_filled = True
                        break
                
                if not city_filled:
                    self.logger.warning("Could not find city input field")
            
            # Select province
            if address_components['province']:
                province_selected = False
                for selector in province_selectors:
                    if self.select_province(selector, address_components['province']):
                        province_selected = True
                        break
                
                if not province_selected:
                    self.logger.warning("Could not find province select field")
            
            # Submit search form
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[class*="search"]',
                '.search-button',
                '#search-button'
            ]
            
            for selector in submit_selectors:
                if self.selenium_manager.safe_click('css', selector):
                    return True
            
            self.logger.error("Could not find submit button")
            return False
            
        except Exception as e:
            self.logger.error(f"Error filling search form: {e}")
            return False
    
    def select_province(self, selector: str, province_code: str) -> bool:
        """Select province from dropdown"""
        try:
            from selenium.webdriver.support.ui import Select
            
            select_element = self.selenium_manager.wait_for_element('css', selector)
            if not select_element:
                return False
            
            select = Select(select_element)
            
            # Try to select by value first
            try:
                select.select_by_value(province_code)
                return True
            except:
                pass
            
            # Try to select by visible text
            try:
                province_name = self.property_parser.get_province_name(province_code)
                select.select_by_visible_text(province_name)
                return True
            except:
                pass
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error selecting province: {e}")
            return False

    def try_omnibox_search(self, full_address: str) -> bool:
        """Try a single-input omnibox search and submit."""
        selectors = [
            'input[placeholder*="Search"]',
            'input[type="search"]',
            'input[aria-label*="Search"]',
            'input[name*="search"]',
            'input[class*="search"]'
        ]
        for sel in selectors:
            if self.selenium_manager.safe_send_keys('css', sel, full_address):
                if self.selenium_manager.safe_click('css', 'button[type="submit"]'):
                    return True
                # try Enter key submit
                try:
                    elem = self.selenium_manager.wait_for_element('css', sel)
                    if elem:
                        elem.submit()
                        return True
                except Exception:
                    pass
        return False

    def try_sitewide_search(self, full_address: str) -> None:
        """Fallback: try to navigate via common search links if present."""
        links = [
            'a[href*="search"]',
            'a[href*="listing"]',
            'a[href*="property"]'
        ]
        for l in links:
            if self.selenium_manager.safe_click('css', l):
                self.selenium_manager.random_delay(1, 2)
                self.try_omnibox_search(full_address)
                break
    
    def parse_search_results(self) -> List[Dict]:
        """Parse search results from the page"""
        try:
            results = []
            
            # Common result container selectors
            result_selectors = [
                '.property-result',
                '.listing-result',
                '.search-result',
                '[class*="property"]',
                '[class*="listing"]',
                'a[href*="property"], a[href*="listing"]'
            ]
            
            for selector in result_selectors:
                elements = self.selenium_manager.driver.find_elements("css selector", selector)
                if elements:
                    for element in elements:
                        try:
                            result_data = self.extract_result_data(element)
                            if result_data:
                                results.append(result_data)
                        except Exception as e:
                            self.logger.warning(f"Error parsing result element: {e}")
                            continue
                    break
            
            self.logger.info(f"Found {len(results)} search results")
            return results
            
        except Exception as e:
            self.logger.error(f"Error parsing search results: {e}")
            return []
    
    def extract_result_data(self, element) -> Optional[Dict]:
        """Extract data from individual result element"""
        try:
            result_data = {
                'property_id': '',
                'address': '',
                'price': '',
                'link': '',
                'raw_html': element.get_attribute('outerHTML')
            }
            
            # Extract property ID
            id_attrs = ['data-property-id', 'data-id', 'id']
            for attr in id_attrs:
                if element.get_attribute(attr):
                    result_data['property_id'] = element.get_attribute(attr)
                    break
            
            # Extract address
            address_selectors = ['.address', '.property-address', '[class*="address"]', 'a']
            for selector in address_selectors:
                try:
                    address_elem = element.find_element('css selector', selector)
                except Exception:
                    continue
                if address_elem:
                    result_data['address'] = (address_elem.text or address_elem.get_attribute('title') or '').strip()
                    break
            
            # Extract price
            price_selectors = ['.price', '.property-price', '[class*="price"]']
            for selector in price_selectors:
                try:
                    price_elem = element.find_element('css selector', selector)
                except Exception:
                    continue
                if price_elem:
                    result_data['price'] = price_elem.text.strip()
                    break
            
            # Extract link
            try:
                link_elem = element.find_element('css selector', 'a')
                if link_elem:
                    result_data['link'] = link_elem.get_attribute('href')
            except Exception:
                pass
            
            return result_data
            
        except Exception as e:
            self.logger.warning(f"Error extracting result data: {e}")
            return None
    
    def find_exact_match(self, results: List[Dict], address_components: Dict) -> Optional[Dict]:
        """Find exact property match based on address components"""
        try:
            for result in results:
                if not result.get('address'):
                    continue
                
                result_address = self.property_parser.parse_property_address(result['address'])
                
                # Check for exact match
                if (result_address['city'].lower() == address_components['city'].lower() and
                    result_address['province'] == address_components['province']):
                    
                    # Get detailed property data
                    property_data = self.get_property_details(result['link'])
                    if property_data:
                        property_data.update(result)
                        return property_data
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error finding exact match: {e}")
            return None
    
    def get_property_details(self, property_url: str) -> Optional[Dict]:
        """Get detailed property information"""
        try:
            self.logger.info(f"Getting property details from: {property_url}")
            
            self.selenium_manager.driver.get(property_url)
            self.selenium_manager.random_delay(2, 4)
            
            # Check for captcha (informational only - user should be logged in)
            if self.selenium_manager.check_for_captcha():
                self.logger.warning("Captcha detected on property page - you may need to solve manually")
                self.logger.info("Continuing with scraping...")
            
            # Get page source and parse
            page_source = self.selenium_manager.get_page_source()
            if not page_source:
                return None
            
            property_data = self.property_parser.parse_property_details(page_source)
            showing_times = self.property_parser.parse_showing_times(page_source)
            
            property_data['showing_times'] = showing_times
            property_data['url'] = property_url
            
            return property_data
            
        except Exception as e:
            self.logger.error(f"Error getting property details: {e}")
            return None
    
    def get_7_day_schedule(self, property_data: Dict) -> List[Dict]:
        """Get 7-day viewing schedule for property"""
        try:
            if not property_data.get('showing_times'):
                # Generate default schedule if no specific times found
                return self.property_parser.generate_7_day_schedule()
            
            # Use existing showing times and extend to 7 days
            schedule = []
            base_date = datetime.now()
            
            for i in range(7):
                date = base_date + timedelta(days=i)
                day_schedule = {
                    'date': date.strftime('%Y-%m-%d'),
                    'day_name': date.strftime('%A'),
                    'time_slots': property_data['showing_times'].copy()
                }
                schedule.append(day_schedule)
            
            return schedule
            
        except Exception as e:
            self.logger.error(f"Error getting 7-day schedule: {e}")
            return []
    
    
    def close(self):
        """Close scraper and cleanup"""
        if self.selenium_manager:
            self.selenium_manager.close()
