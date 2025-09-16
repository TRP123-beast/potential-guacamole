import sqlite3
import json
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional
import logging

class DataManager:
    def __init__(self, db_path: str = "broker_bay_scraper.db"):
        self.db_path = db_path
        self.logger = logging.getLogger(__name__)
        self.init_database()
    
    def init_database(self):
        """Initialize database with required tables"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Properties table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS properties (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    property_id TEXT UNIQUE,
                    address TEXT,
                    city TEXT,
                    province TEXT,
                    postal_code TEXT,
                    price TEXT,
                    bedrooms TEXT,
                    bathrooms TEXT,
                    square_feet TEXT,
                    property_type TEXT,
                    description TEXT,
                    url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Showing times table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS showing_times (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    property_id TEXT,
                    date TEXT,
                    time TEXT,
                    display TEXT,
                    available BOOLEAN,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (property_id) REFERENCES properties (property_id)
                )
            ''')
            
            # Bookings table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    property_id TEXT,
                    booking_date TEXT,
                    booking_time TEXT,
                    contact_name TEXT,
                    contact_email TEXT,
                    contact_phone TEXT,
                    message TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (property_id) REFERENCES properties (property_id)
                )
            ''')
            
            # Search history table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    search_address TEXT,
                    search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    results_count INTEGER,
                    success BOOLEAN
                )
            ''')
            
            conn.commit()
            conn.close()
            
            self.logger.info("Database initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Error initializing database: {e}")
            raise
    
    def save_property(self, property_data: Dict) -> bool:
        """Save property data to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Parse address components
            address_components = self.parse_address(property_data.get('address', ''))
            
            cursor.execute('''
                INSERT OR REPLACE INTO properties 
                (property_id, address, city, province, postal_code, price, 
                 bedrooms, bathrooms, square_feet, property_type, description, url, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                property_data.get('property_id', ''),
                property_data.get('address', ''),
                address_components.get('city', ''),
                address_components.get('province', ''),
                address_components.get('postal_code', ''),
                property_data.get('price', ''),
                property_data.get('bedrooms', ''),
                property_data.get('bathrooms', ''),
                property_data.get('square_feet', ''),
                property_data.get('property_type', ''),
                property_data.get('description', ''),
                property_data.get('url', ''),
                datetime.now()
            ))
            
            conn.commit()
            conn.close()
            
            self.logger.info(f"Property saved: {property_data.get('property_id', 'Unknown')}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error saving property: {e}")
            return False
    
    def save_showing_times(self, property_id: str, showing_times: List[Dict]) -> bool:
        """Save showing times for a property"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Clear existing showing times
            cursor.execute('DELETE FROM showing_times WHERE property_id = ?', (property_id,))
            
            # Insert new showing times
            for time_slot in showing_times:
                cursor.execute('''
                    INSERT INTO showing_times 
                    (property_id, date, time, display, available)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    property_id,
                    time_slot.get('date', ''),
                    time_slot.get('time', ''),
                    time_slot.get('display', ''),
                    time_slot.get('available', False)
                ))
            
            conn.commit()
            conn.close()
            
            self.logger.info(f"Showing times saved for property: {property_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error saving showing times: {e}")
            return False
    
    def save_booking(self, property_id: str, booking_data: Dict) -> bool:
        """Save booking information"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO bookings 
                (property_id, booking_date, booking_time, contact_name, 
                 contact_email, contact_phone, message, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                property_id,
                booking_data.get('date', ''),
                booking_data.get('time', ''),
                booking_data.get('contact_name', ''),
                booking_data.get('contact_email', ''),
                booking_data.get('contact_phone', ''),
                booking_data.get('message', ''),
                booking_data.get('status', 'pending')
            ))
            
            conn.commit()
            conn.close()
            
            self.logger.info(f"Booking saved for property: {property_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error saving booking: {e}")
            return False
    
    def save_search_history(self, search_address: str, results_count: int, success: bool) -> bool:
        """Save search history"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO search_history 
                (search_address, results_count, success)
                VALUES (?, ?, ?)
            ''', (search_address, results_count, success))
            
            conn.commit()
            conn.close()
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error saving search history: {e}")
            return False
    
    def get_property(self, property_id: str) -> Optional[Dict]:
        """Get property by ID"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM properties WHERE property_id = ?', (property_id,))
            row = cursor.fetchone()
            
            if row:
                columns = [description[0] for description in cursor.description]
                property_data = dict(zip(columns, row))
                conn.close()
                return property_data
            
            conn.close()
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting property: {e}")
            return None
    
    def get_properties_by_address(self, address: str) -> List[Dict]:
        """Get properties by address"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM properties 
                WHERE address LIKE ? OR city LIKE ? OR province LIKE ?
                ORDER BY updated_at DESC
            ''', (f'%{address}%', f'%{address}%', f'%{address}%'))
            
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description]
            
            properties = [dict(zip(columns, row)) for row in rows]
            conn.close()
            
            return properties
            
        except Exception as e:
            self.logger.error(f"Error getting properties by address: {e}")
            return []
    
    def get_showing_times(self, property_id: str) -> List[Dict]:
        """Get showing times for a property"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM showing_times 
                WHERE property_id = ? 
                ORDER BY date, time
            ''', (property_id,))
            
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description]
            
            showing_times = [dict(zip(columns, row)) for row in rows]
            conn.close()
            
            return showing_times
            
        except Exception as e:
            self.logger.error(f"Error getting showing times: {e}")
            return []
    
    def get_bookings(self, property_id: str = None) -> List[Dict]:
        """Get bookings (optionally filtered by property)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            if property_id:
                cursor.execute('''
                    SELECT * FROM bookings 
                    WHERE property_id = ? 
                    ORDER BY created_at DESC
                ''', (property_id,))
            else:
                cursor.execute('''
                    SELECT * FROM bookings 
                    ORDER BY created_at DESC
                ''')
            
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description]
            
            bookings = [dict(zip(columns, row)) for row in rows]
            conn.close()
            
            return bookings
            
        except Exception as e:
            self.logger.error(f"Error getting bookings: {e}")
            return []
    
    def export_to_csv(self, table_name: str, filename: str = None) -> bool:
        """Export table to CSV"""
        try:
            if not filename:
                filename = f"{table_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            conn = sqlite3.connect(self.db_path)
            
            df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
            df.to_csv(filename, index=False)
            
            conn.close()
            
            self.logger.info(f"Exported {table_name} to {filename}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error exporting to CSV: {e}")
            return False
    
    def parse_address(self, address: str) -> Dict:
        """Parse address into components"""
        import re
        
        address_components = {
            'city': '',
            'province': '',
            'postal_code': ''
        }
        
        # Extract postal code
        postal_match = re.search(r'([A-Z]\d[A-Z]\s?\d[A-Z]\d)', address.upper())
        if postal_match:
            address_components['postal_code'] = postal_match.group(1)
        
        # Extract province
        provinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']
        for province in provinces:
            if f' {province} ' in f' {address.upper()} ':
                address_components['province'] = province
                break
        
        return address_components
