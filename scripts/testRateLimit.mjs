// scripts/testRateLimit.mjs
import dotenv from 'dotenv';

dotenv.config({ path: './frontend/.env' });

async function testRateLimit() {
  const NETLIFY_FUNCTION_URL = process.env.NETLIFY_FUNCTION_URL || "https://andys-daily-factoids.com/.netlify/functions/checkRateLimit";
  const FUNCTIONS_API_KEY = process.env.FUNCTIONS_API_KEY;

  if (!NETLIFY_FUNCTION_URL || !FUNCTIONS_API_KEY) {
    console.error("Error: Missing NETLIFY_FUNCTION_URL or FUNCTIONS_API_KEY in environment variables.");
    process.exit(1);
  }

  try {
    console.log("Testing rate limit endpoint...");
    
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': FUNCTIONS_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`Error: Failed to check rate limit. Status: ${response.status}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      process.exit(1);
    }

    const rateLimitData = await response.json();
    console.log("Rate limit status:");
    console.log(`- Can generate more: ${rateLimitData.isAllowed}`);
    console.log(`- Limit type: ${rateLimitData.limitType || 'none'}`);
    
    if (rateLimitData.globalLimits) {
      console.log(`- Global hourly: ${rateLimitData.globalLimits.hourlyUsage}/${rateLimitData.globalLimits.hourlyLimit}`);
      console.log(`- Global daily: ${rateLimitData.globalLimits.dailyUsage}/${rateLimitData.globalLimits.dailyLimit}`);
    }
    
    if (rateLimitData.ipLimits) {
      console.log(`- IP hourly: ${rateLimitData.ipLimits.hourlyUsage}/${rateLimitData.ipLimits.hourlyLimit}`);
      console.log(`- IP per minute: ${rateLimitData.ipLimits.minuteUsage}/${rateLimitData.ipLimits.minuteLimit}`);
    }
    
    console.log(`- Client IP: ${rateLimitData.clientIP}`);
    
  } catch (error) {
    console.error("Error: Unable to test rate limit.", error);
    process.exit(1);
  }
}

// Execute the test
testRateLimit();
