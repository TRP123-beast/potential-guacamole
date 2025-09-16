import re
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from bs4 import BeautifulSoup
import pandas as pd

class PropertyParser:
    def __init__(self):
        self.canadian_provinces = [
            'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
        ]
        self.province_names = {
            'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB',
            'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL',
            'Nova Scotia': 'NS', 'Northwest Territories': 'NT', 'Nunavut': 'NU',
            'Ontario': 'ON', 'Prince Edward Island': 'PE', 'Quebec': 'QC',
            'Saskatchewan': 'SK', 'Yukon': 'YT'
        }
    
    def parse_property_address(self, address_text: str) -> Dict[str, str]:
        """Parse Canadian property address into components"""
        address = {
            'street': '',
            'city': '',
            'province': '',
            'postal_code': '',
            'full_address': address_text.strip()
        }
        
        # Extract postal code (Canadian format: A1A 1A1)
        postal_match = re.search(r'([A-Z]\d[A-Z]\s?\d[A-Z]\d)', address_text.upper())
        if postal_match:
            address['postal_code'] = postal_match.group(1)
        
        # Extract province
        for province_name, province_code in self.province_names.items():
            if province_name.lower() in address_text.lower():
                address['province'] = province_code
                break
        
        # If no province name found, try province codes
        if not address['province']:
            for code in self.canadian_provinces:
                if f' {code} ' in f' {address_text.upper()} ':
                    address['province'] = code
                    break
        
        # Extract city (usually before province)
        if address['province']:
            province_pattern = f"({address['province']}|{self.get_province_name(address['province'])})"
            city_match = re.search(r'([^,]+),\s*' + province_pattern, address_text, re.IGNORECASE)
            if city_match:
                address['city'] = city_match.group(1).strip()
        
        # Extract street address (everything before city)
        if address['city']:
            street_match = re.search(r'^(.+?),\s*' + re.escape(address['city']), address_text)
            if street_match:
                address['street'] = street_match.group(1).strip()
        
        return address
    
    def get_province_name(self, province_code: str) -> str:
        """Get full province name from code"""
        reverse_map = {v: k for k, v in self.province_names.items()}
        return reverse_map.get(province_code, '')
    
    def parse_property_details(self, html_content: str) -> Dict:
        """Parse property details from HTML content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        property_data = {
            'property_id': '',
            'address': '',
            'price': '',
            'bedrooms': '',
            'bathrooms': '',
            'square_feet': '',
            'property_type': '',
            'description': '',
            'images': [],
            'agent_info': {},
            'showing_times': [],
            'raw_html': html_content
        }
        
        # Extract property ID
        id_selectors = [
            '[data-property-id]',
            '.property-id',
            '#property-id'
        ]
        for selector in id_selectors:
            element = soup.select_one(selector)
            if element:
                property_data['property_id'] = element.get('data-property-id') or element.get_text(strip=True)
                break
        
        # Extract price
        price_selectors = [
            '.price',
            '.property-price',
            '[class*="price"]',
            '.listing-price'
        ]
        for selector in price_selectors:
            element = soup.select_one(selector)
            if element:
                price_text = element.get_text(strip=True)
                price_match = re.search(r'[\$]?[\d,]+', price_text)
                if price_match:
                    property_data['price'] = price_match.group(0)
                break
        
        # Extract bedrooms and bathrooms
        details_selectors = [
            '.property-details',
            '.listing-details',
            '.property-info'
        ]
        for selector in details_selectors:
            element = soup.select_one(selector)
            if element:
                text = element.get_text()
                
                # Bedrooms
                bed_match = re.search(r'(\d+)\s*(?:bed|br|bedroom)', text, re.IGNORECASE)
                if bed_match:
                    property_data['bedrooms'] = bed_match.group(1)
                
                # Bathrooms
                bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)', text, re.IGNORECASE)
                if bath_match:
                    property_data['bathrooms'] = bath_match.group(1)
                
                # Square feet
                sqft_match = re.search(r'(\d+(?:,\d+)*)\s*(?:sq\.?\s*ft|sqft|square\s*feet)', text, re.IGNORECASE)
                if sqft_match:
                    property_data['square_feet'] = sqft_match.group(1).replace(',', '')
                break
        
        # Extract property type
        type_selectors = [
            '.property-type',
            '.listing-type',
            '[class*="type"]'
        ]
        for selector in type_selectors:
            element = soup.select_one(selector)
            if element:
                property_data['property_type'] = element.get_text(strip=True)
                break
        
        # Extract description
        desc_selectors = [
            '.description',
            '.property-description',
            '.listing-description'
        ]
        for selector in desc_selectors:
            element = soup.select_one(selector)
            if element:
                property_data['description'] = element.get_text(strip=True)
                break
        
        # Extract images
        img_elements = soup.select('img[src*="property"], img[src*="listing"]')
        property_data['images'] = [img.get('src') for img in img_elements if img.get('src')]
        
        return property_data
    
    def parse_showing_times(self, html_content: str) -> List[Dict]:
        """Parse available showing times from HTML"""
        soup = BeautifulSoup(html_content, 'html.parser')
        showing_times = []
        
        # Look for showing time elements
        time_selectors = [
            '.showing-time',
            '.available-time',
            '.booking-slot',
            '[class*="showing"]',
            '[class*="booking"]'
        ]
        
        for selector in time_selectors:
            elements = soup.select(selector)
            for element in elements:
                time_text = element.get_text(strip=True)
                time_data = self.parse_time_slot(time_text)
                if time_data:
                    showing_times.append(time_data)
        
        return showing_times
    
    def parse_time_slot(self, time_text: str) -> Optional[Dict]:
        """Parse individual time slot"""
        # Common time patterns
        time_patterns = [
            r'(\d{1,2}):(\d{2})\s*(AM|PM)',
            r'(\d{1,2})\s*(AM|PM)',
            r'(\d{1,2}):(\d{2})',
            r'(\d{1,2})h(\d{2})'
        ]
        
        for pattern in time_patterns:
            match = re.search(pattern, time_text, re.IGNORECASE)
            if match:
                groups = match.groups()
                if len(groups) == 3:  # HH:MM AM/PM
                    hour, minute, period = groups
                    hour = int(hour)
                    if period.upper() == 'PM' and hour != 12:
                        hour += 12
                    elif period.upper() == 'AM' and hour == 12:
                        hour = 0
                    return {
                        'time': f"{hour:02d}:{minute}",
                        'display': time_text,
                        'available': 'book' in time_text.lower() or 'available' in time_text.lower()
                    }
                elif len(groups) == 2:  # HH AM/PM or HH:MM
                    if 'AM' in groups[1].upper() or 'PM' in groups[1].upper():
                        hour, period = groups
                        hour = int(hour)
                        if period.upper() == 'PM' and hour != 12:
                            hour += 12
                        elif period.upper() == 'AM' and hour == 12:
                            hour = 0
                        return {
                            'time': f"{hour:02d}:00",
                            'display': time_text,
                            'available': 'book' in time_text.lower() or 'available' in time_text.lower()
                        }
                    else:  # HH:MM
                        hour, minute = groups
                        return {
                            'time': f"{int(hour):02d}:{minute}",
                            'display': time_text,
                            'available': 'book' in time_text.lower() or 'available' in time_text.lower()
                        }
        
        return None
    
    def generate_7_day_schedule(self, start_date: datetime = None) -> List[Dict]:
        """Generate 7-day schedule for property viewing"""
        if not start_date:
            start_date = datetime.now()
        
        schedule = []
        for i in range(7):
            date = start_date + timedelta(days=i)
            day_schedule = {
                'date': date.strftime('%Y-%m-%d'),
                'day_name': date.strftime('%A'),
                'time_slots': self.generate_time_slots()
            }
            schedule.append(day_schedule)
        
        return schedule
    
    def generate_time_slots(self) -> List[Dict]:
        """Generate standard time slots for property viewing"""
        slots = []
        start_hour = 9
        end_hour = 17
        
        for hour in range(start_hour, end_hour + 1):
            for minute in [0, 30]:
                if hour == end_hour and minute > 0:
                    break
                
                time_str = f"{hour:02d}:{minute:02d}"
                slots.append({
                    'time': time_str,
                    'display': self.format_time_display(hour, minute),
                    'available': True
                })
        
        return slots
    
    def format_time_display(self, hour: int, minute: int) -> str:
        """Format time for display"""
        if hour == 0:
            return f"12:{minute:02d} AM"
        elif hour < 12:
            return f"{hour}:{minute:02d} AM"
        elif hour == 12:
            return f"12:{minute:02d} PM"
        else:
            return f"{hour-12}:{minute:02d} PM"
