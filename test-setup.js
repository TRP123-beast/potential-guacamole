#!/usr/bin/env node

import { testSpecificProperties } from './src/test/test-properties.js';

console.log('🏠 Broker Bay Property Scraper - Setup Test');
console.log('==========================================\n');

console.log('Testing property scraping for:');
console.log('- 101 Lake Drive N');
console.log('- 10 Navy Wharf Court #3209\n');

console.log('Starting test...\n');

try {
  const results = await testSpecificProperties();
  
  console.log('\n✅ Test completed successfully!');
  console.log(`📊 Results: ${results.length} properties processed`);
  
  if (results.length > 0) {
    console.log('\n📋 Property Summary:');
    results.forEach((property, index) => {
      console.log(`${index + 1}. ${property.address}`);
      console.log(`   Price: $${property.price?.toLocaleString() || 'N/A'}`);
      console.log(`   Bedrooms: ${property.bedrooms || 'N/A'}`);
      console.log(`   Bathrooms: ${property.bathrooms || 'N/A'}`);
      console.log(`   MLS: ${property.mls_number || 'N/A'}`);
      console.log(`   URL: ${property.url || 'N/A'}`);
      console.log('');
    });
  }
  
  console.log('🎉 Setup test completed! Check src/data/test-properties-results.json for detailed results.');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('\nTroubleshooting:');
  console.error('1. Make sure Chrome is installed and BROWSER_EXECUTABLE_PATH is set correctly');
  console.error('2. Ensure you are logged into Broker Bay in your Chrome profile');
  console.error('3. Check that BROWSER_PROFILE_USERDATA points to your Chrome profile');
  console.error('4. Verify your .env file is configured properly');
  process.exit(1);
}
