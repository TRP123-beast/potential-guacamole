#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime
from broker_bay_scraper import BrokerBayScraper
from booking_system import BookingSystem
from data_manager import DataManager
from selenium_manager import SeleniumManager
import logging

def setup_logging(level='INFO'):
    """Setup logging configuration"""
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('broker_bay_scraper.log'),
            logging.StreamHandler()
        ]
    )

def search_property(address: str, headless: bool = True):
    """Search for a property by address"""
    print(f"🔍 Searching for property: {address}")
    
    scraper = BrokerBayScraper(headless=headless)
    data_manager = DataManager()
    
    try:
        # Search for property
        property_data = scraper.search_property_by_address(address)
        
        if property_data:
            print(f"✅ Property found: {property_data.get('address', 'Unknown address')}")
            print(f"   Price: {property_data.get('price', 'Not available')}")
            print(f"   Property ID: {property_data.get('property_id', 'Unknown')}")
            
            # Save property data
            data_manager.save_property(property_data)
            
            # Get 7-day schedule
            schedule = scraper.get_7_day_schedule(property_data)
            if schedule:
                print(f"📅 7-day viewing schedule generated")
                
                # Save showing times
                showing_times = []
                for day in schedule:
                    for slot in day['time_slots']:
                        showing_times.append({
                            'date': day['date'],
                            'time': slot['time'],
                            'display': slot['display'],
                            'available': slot['available']
                        })
                
                data_manager.save_showing_times(property_data['property_id'], showing_times)
                
                # Display schedule
                print("\n📋 Available Viewing Times:")
                for day in schedule:
                    print(f"\n{day['day_name']} ({day['date']}):")
                    for slot in day['time_slots'][:5]:  # Show first 5 slots
                        status = "✅ Available" if slot['available'] else "❌ Unavailable"
                        print(f"  {slot['display']} - {status}")
                    if len(day['time_slots']) > 5:
                        print(f"  ... and {len(day['time_slots']) - 5} more slots")
            
            # Save search history
            data_manager.save_search_history(address, 1, True)
            
            return property_data
        else:
            print("❌ Property not found")
            data_manager.save_search_history(address, 0, False)
            return None
            
    except Exception as e:
        print(f"❌ Error searching property: {e}")
        data_manager.save_search_history(address, 0, False)
        return None
    finally:
        scraper.close()

def book_viewing(property_id: str, date: str, time: str, contact_info: dict, headless: bool = True):
    """Book a property viewing"""
    print(f"📅 Booking viewing for property: {property_id}")
    print(f"   Date: {date}")
    print(f"   Time: {time}")
    
    selenium_manager = SeleniumManager(headless=headless)
    booking_system = BookingSystem(selenium_manager)
    data_manager = DataManager()
    
    try:
        # Get property data
        property_data = data_manager.get_property(property_id)
        if not property_data:
            print("❌ Property not found in database")
            return False
        
        # Prepare booking data
        booking_data = {
            'date': date,
            'time': time,
            'contact_name': contact_info.get('name', ''),
            'contact_email': contact_info.get('email', ''),
            'contact_phone': contact_info.get('phone', ''),
            'message': contact_info.get('message', ''),
            'status': 'pending'
        }
        
        # Book viewing
        success = booking_system.book_viewing(property_data, booking_data, contact_info)
        
        if success:
            print("✅ Viewing booked successfully!")
            data_manager.save_booking(property_id, booking_data)
            return True
        else:
            print("❌ Failed to book viewing")
            return False
            
    except Exception as e:
        print(f"❌ Error booking viewing: {e}")
        return False
    finally:
        selenium_manager.close()

def list_properties():
    """List all properties in database"""
    data_manager = DataManager()
    properties = data_manager.get_properties_by_address("")
    
    if not properties:
        print("No properties found in database")
        return
    
    print(f"📋 Found {len(properties)} properties:")
    print("-" * 80)
    
    for prop in properties:
        print(f"ID: {prop['property_id']}")
        print(f"Address: {prop['address']}")
        print(f"Price: {prop['price']}")
        print(f"Type: {prop['property_type']}")
        print(f"Updated: {prop['updated_at']}")
        print("-" * 80)

def list_bookings(property_id: str = None):
    """List bookings"""
    data_manager = DataManager()
    bookings = data_manager.get_bookings(property_id)
    
    if not bookings:
        print("No bookings found")
        return
    
    print(f"📅 Found {len(bookings)} bookings:")
    print("-" * 80)
    
    for booking in bookings:
        print(f"Property ID: {booking['property_id']}")
        print(f"Date: {booking['booking_date']}")
        print(f"Time: {booking['booking_time']}")
        print(f"Contact: {booking['contact_name']} ({booking['contact_email']})")
        print(f"Status: {booking['status']}")
        print("-" * 80)

def export_data(table: str):
    """Export data to CSV"""
    data_manager = DataManager()
    
    if data_manager.export_to_csv(table):
        print(f"✅ {table} exported to CSV successfully")
    else:
        print(f"❌ Failed to export {table}")

def main():
    parser = argparse.ArgumentParser(description='Broker Bay Property Scraper and Booking System')
    parser.add_argument('--log-level', default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
                       help='Set logging level')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search for a property')
    search_parser.add_argument('address', help='Property address to search for')
    search_parser.add_argument('--headless', action='store_true', default=True,
                              help='Run in headless mode (default: True)')
    
    # Book command
    book_parser = subparsers.add_parser('book', help='Book a property viewing')
    book_parser.add_argument('property_id', help='Property ID to book')
    book_parser.add_argument('date', help='Viewing date (YYYY-MM-DD)')
    book_parser.add_argument('time', help='Viewing time (HH:MM)')
    book_parser.add_argument('--name', required=True, help='Contact name')
    book_parser.add_argument('--email', required=True, help='Contact email')
    book_parser.add_argument('--phone', help='Contact phone')
    book_parser.add_argument('--message', help='Additional message')
    book_parser.add_argument('--headless', action='store_true', default=True,
                            help='Run in headless mode (default: True)')
    
    # List commands
    subparsers.add_parser('list-properties', help='List all properties')
    subparsers.add_parser('list-bookings', help='List all bookings')
    
    # Export command
    export_parser = subparsers.add_parser('export', help='Export data to CSV')
    export_parser.add_argument('table', choices=['properties', 'bookings', 'showing_times', 'search_history'],
                              help='Table to export')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    setup_logging(args.log_level)
    
    if args.command == 'search':
        search_property(args.address, args.headless)
    
    elif args.command == 'book':
        contact_info = {
            'name': args.name,
            'email': args.email,
            'phone': args.phone or '',
            'message': args.message or ''
        }
        book_viewing(args.property_id, args.date, args.time, contact_info, args.headless)
    
    elif args.command == 'list-properties':
        list_properties()
    
    elif args.command == 'list-bookings':
        list_bookings()
    
    elif args.command == 'export':
        export_data(args.table)

if __name__ == '__main__':
    main()
