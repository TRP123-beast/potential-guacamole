#!/usr/bin/env python3
"""
Test script for Broker Bay Scraper
Run this to test the scraper functionality
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from broker_bay_scraper import BrokerBayScraper
from data_manager import DataManager
import logging

def test_property_search():
    """Test property search functionality"""
    print("🧪 Testing property search...")
    
    # Test addresses (known Broker Bay properties)
    test_addresses = [
        "10 Navy Wharf Court #3209, Toronto, ON",
        "275 Larch Street #G612, Toronto, ON", 
        "17 Bathurst Street #4205, Toronto, ON"
    ]
    
    scraper = BrokerBayScraper(headless=True)
    data_manager = DataManager()
    
    try:
        for address in test_addresses:
            print(f"\n🔍 Testing: {address}")
            
            # Search property
            property_data = scraper.search_property_by_address(address)
            
            if property_data:
                print(f"✅ Found: {property_data.get('address', 'Unknown')}")
                print(f"   Price: {property_data.get('price', 'N/A')}")
                print(f"   ID: {property_data.get('property_id', 'N/A')}")
                
                # Save to database
                data_manager.save_property(property_data)
                
                # Get schedule
                schedule = scraper.get_7_day_schedule(property_data)
                if schedule:
                    print(f"📅 Generated {len(schedule)} days of schedule")
            else:
                print("❌ Property not found")
    
    except Exception as e:
        print(f"❌ Test failed: {e}")
    
    finally:
        scraper.close()

def test_database_operations():
    """Test database operations"""
    print("\n🧪 Testing database operations...")
    
    data_manager = DataManager()
    
    try:
        # Test property retrieval
        properties = data_manager.get_properties_by_address("Toronto")
        print(f"📊 Found {len(properties)} properties in database")
        
        # Test showing times
        if properties:
            property_id = properties[0]['property_id']
            showing_times = data_manager.get_showing_times(property_id)
            print(f"📅 Found {len(showing_times)} showing times for property {property_id}")
        
        # Test export
        if data_manager.export_to_csv('properties', 'test_properties.csv'):
            print("✅ Export test successful")
        else:
            print("❌ Export test failed")
    
    except Exception as e:
        print(f"❌ Database test failed: {e}")

def test_configuration():
    """Test configuration loading"""
    print("\n🧪 Testing configuration...")
    
    try:
        from config import Config
        
        print(f"Base URL: {Config.BASE_URL}")
        print(f"Min Delay: {Config.MIN_DELAY}")
        print(f"Max Delay: {Config.MAX_DELAY}")
        print(f"User Agents: {len(Config.USER_AGENTS)}")
        print(f"Use Existing Session: {Config.USE_EXISTING_SESSION}")
        print(f"Chrome Profile Path: {Config.CHROME_PROFILE_PATH or 'Not set'}")
        
        print("✅ Configuration test passed")
    
    except Exception as e:
        print(f"❌ Configuration test failed: {e}")

def main():
    """Run all tests"""
    print("🚀 Starting Broker Bay Scraper Tests")
    print("=" * 50)
    
    # Setup logging
    logging.basicConfig(level=logging.INFO)
    
    # Run tests
    test_configuration()
    test_database_operations()
    
    # Only run search test if user confirms (it will make actual web requests)
    response = input("\n🤔 Run property search test? This will make actual web requests (y/N): ")
    if response.lower() in ['y', 'yes']:
        test_property_search()
    else:
        print("⏭️  Skipping property search test")
    
    print("\n✅ All tests completed!")

if __name__ == '__main__':
    main()
