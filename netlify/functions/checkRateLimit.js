// netlify/functions/checkRateLimit.js
import admin from 'firebase-admin';

// Get Firebase credentials from environment variables
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Global rate limit configuration
const RATE_LIMIT = {
    // Global limits (primary defense)
    GLOBAL_GENERATIONS_PER_HOUR: 500, // Total factoids across all users per hour
    GLOBAL_GENERATIONS_PER_DAY: 5000, // Total factoids across all users per day
    
    // Per-IP limits (secondary defense - much higher)
    PER_IP_GENERATIONS_PER_HOUR: 50, // Per IP per hour (higher than before)
    PER_IP_GENERATIONS_PER_MINUTE: 10, // Prevent rapid-fire abuse
    
    // Window durations
    HOUR_WINDOW_MS: 60 * 60 * 1000, // 1 hour
    DAY_WINDOW_MS: 24 * 60 * 60 * 1000, // 1 day
    MINUTE_WINDOW_MS: 60 * 1000, // 1 minute
};

/**
 * Get client IP address from request - prioritize trusted sources
 */
function getClientIP(event) {
    const headers = event.headers || {};
    
    // For Netlify, the most reliable IP source is usually the first in x-forwarded-for
    // or the direct client IP from Netlify's infrastructure
    let clientIP = null;
    
    // 1. Try Cloudflare IP (most trusted)
    if (headers['cf-connecting-ip']) {
        clientIP = headers['cf-connecting-ip'];
    }
    // 2. Try Netlify's direct client IP
    else if (headers['x-nf-client-connection-ip']) {
        clientIP = headers['x-nf-client-connection-ip'];
    }
    // 3. Try x-forwarded-for (but take the first IP, not the last)
    else if (headers['x-forwarded-for']) {
        // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
        // The first IP is usually the original client
        const forwardedIPs = headers['x-forwarded-for'].split(',');
        clientIP = forwardedIPs[0].trim();
    }
    // 4. Fallback to other headers
    else if (headers['x-real-ip']) {
        clientIP = headers['x-real-ip'];
    }
    
    // Validate IP format (basic check)
    if (clientIP && isValidIP(clientIP)) {
        return clientIP;
    }
    
    // If no valid IP found, generate a fallback identifier
    // This combines multiple headers to create a more unique identifier
    const fallbackId = generateFallbackId(headers);
    return fallbackId;
}

/**
 * Basic IP address validation
 */
function isValidIP(ip) {
    // IPv4 regex
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 regex (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
        return false;
    }
    
    // Additional validation for IPv4
    if (ipv4Regex.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }
    
    return true;
}

/**
 * Generate a fallback identifier when IP is not available or valid
 */
function generateFallbackId(headers) {
    // Combine multiple headers to create a semi-unique identifier
    const userAgent = headers['user-agent'] || 'unknown';
    const acceptLanguage = headers['accept-language'] || 'unknown';
    const acceptEncoding = headers['accept-encoding'] || 'unknown';
    
    // Create a simple hash-like identifier (not cryptographically secure, but sufficient for rate limiting)
    const combined = `${userAgent}-${acceptLanguage}-${acceptEncoding}`;
    return `fallback-${hashString(combined).substring(0, 16)}`;
}

/**
 * Simple hash function for generating fallback IDs
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
}

/**
 * Check global rate limits (primary defense)
 */
async function checkGlobalRateLimit() {
    const now = Date.now();
    const hourStart = now - RATE_LIMIT.HOUR_WINDOW_MS;
    const dayStart = now - RATE_LIMIT.DAY_WINDOW_MS;

    try {
        // Get global usage statistics
        const globalRef = db.collection('globalUsage').doc('stats');
        const globalDoc = await globalRef.get();

        let globalStats = {
            hourlyGenerations: [],
            dailyGenerations: [],
            lastUpdate: now
        };

        if (globalDoc.exists) {
            globalStats = globalDoc.data();
            
            // Clean up old data
            globalStats.hourlyGenerations = globalStats.hourlyGenerations.filter(
                timestamp => timestamp > hourStart
            );
            globalStats.dailyGenerations = globalStats.dailyGenerations.filter(
                timestamp => timestamp > dayStart
            );
        }

        const hourlyUsage = globalStats.hourlyGenerations.length;
        const dailyUsage = globalStats.dailyGenerations.length;

        const isHourlyLimitExceeded = hourlyUsage >= RATE_LIMIT.GLOBAL_GENERATIONS_PER_HOUR;
        const isDailyLimitExceeded = dailyUsage >= RATE_LIMIT.GLOBAL_GENERATIONS_PER_DAY;

        return {
            isAllowed: !isHourlyLimitExceeded && !isDailyLimitExceeded,
            hourlyUsage,
            dailyUsage,
            hourlyLimit: RATE_LIMIT.GLOBAL_GENERATIONS_PER_HOUR,
            dailyLimit: RATE_LIMIT.GLOBAL_GENERATIONS_PER_DAY,
            limitType: isHourlyLimitExceeded ? 'hourly' : isDailyLimitExceeded ? 'daily' : null
        };

    } catch (error) {
        console.error('Error checking global rate limit:', error);
        // On error, allow the request but log it
        return {
            isAllowed: true,
            hourlyUsage: 0,
            dailyUsage: 0,
            hourlyLimit: RATE_LIMIT.GLOBAL_GENERATIONS_PER_HOUR,
            dailyLimit: RATE_LIMIT.GLOBAL_GENERATIONS_PER_DAY,
            limitType: null,
            error: 'Global rate limit check failed, allowing request'
        };
    }
}

/**
 * Check per-IP rate limits (secondary defense)
 */
async function checkIPRateLimit(clientIP) {
    const now = Date.now();
    const hourStart = now - RATE_LIMIT.HOUR_WINDOW_MS;
    const minuteStart = now - RATE_LIMIT.MINUTE_WINDOW_MS;

    try {
        const ipRef = db.collection('ipRateLimits').doc(clientIP);
        const ipDoc = await ipRef.get();

        let ipStats = {
            hourlyGenerations: [],
            minuteGenerations: [],
            lastUpdate: now
        };

        if (ipDoc.exists) {
            ipStats = ipDoc.data();
            
            // Clean up old data
            ipStats.hourlyGenerations = ipStats.hourlyGenerations.filter(
                timestamp => timestamp > hourStart
            );
            ipStats.minuteGenerations = ipStats.minuteGenerations.filter(
                timestamp => timestamp > minuteStart
            );
        }

        const hourlyUsage = ipStats.hourlyGenerations.length;
        const minuteUsage = ipStats.minuteGenerations.length;

        const isHourlyLimitExceeded = hourlyUsage >= RATE_LIMIT.PER_IP_GENERATIONS_PER_HOUR;
        const isMinuteLimitExceeded = minuteUsage >= RATE_LIMIT.PER_IP_GENERATIONS_PER_MINUTE;

        return {
            isAllowed: !isHourlyLimitExceeded && !isMinuteLimitExceeded,
            hourlyUsage,
            minuteUsage,
            hourlyLimit: RATE_LIMIT.PER_IP_GENERATIONS_PER_HOUR,
            minuteLimit: RATE_LIMIT.PER_IP_GENERATIONS_PER_MINUTE,
            limitType: isMinuteLimitExceeded ? 'minute' : isHourlyLimitExceeded ? 'hourly' : null
        };

    } catch (error) {
        console.error('Error checking IP rate limit:', error);
        return {
            isAllowed: true,
            hourlyUsage: 0,
            minuteUsage: 0,
            hourlyLimit: RATE_LIMIT.PER_IP_GENERATIONS_PER_HOUR,
            minuteLimit: RATE_LIMIT.PER_IP_GENERATIONS_PER_MINUTE,
            limitType: null,
            error: 'IP rate limit check failed, allowing request'
        };
    }
}

/**
 * Main rate limit check function
 */
export async function checkRateLimit(event) {
    const clientIP = getClientIP(event);
    
    try {
        // Check global limits first (primary defense)
        const globalLimits = await checkGlobalRateLimit();
        if (!globalLimits.isAllowed) {
            return {
                isAllowed: false,
                limitType: 'global',
                globalLimits,
                clientIP,
                message: `Global rate limit exceeded: ${globalLimits.hourlyUsage}/${globalLimits.hourlyLimit} per hour or ${globalLimits.dailyUsage}/${globalLimits.dailyLimit} per day`
            };
        }

        // Check IP limits second (secondary defense)
        const ipLimits = await checkIPRateLimit(clientIP);
        if (!ipLimits.isAllowed) {
            return {
                isAllowed: false,
                limitType: 'ip',
                ipLimits,
                clientIP,
                message: `IP rate limit exceeded: ${ipLimits.minuteUsage}/${ipLimits.minuteLimit} per minute or ${ipLimits.hourlyUsage}/${ipLimits.hourlyLimit} per hour`
            };
        }

        // Both checks passed
        return {
            isAllowed: true,
            limitType: null,
            globalLimits,
            ipLimits,
            clientIP
        };

    } catch (error) {
        console.error('Error in rate limit check:', error);
        // On error, allow the request but log it
        return {
            isAllowed: true,
            limitType: null,
            clientIP,
            error: 'Rate limit check failed, allowing request'
        };
    }
}

/**
 * Record a generation for both global and IP rate limiting
 */
export async function recordGeneration(event) {
    const clientIP = getClientIP(event);
    const now = Date.now();

    try {
        // Record global usage
        await recordGlobalGeneration(now);
        
        // Record IP-specific usage
        await recordIPGeneration(clientIP, now);

        return { success: true };

    } catch (error) {
        console.error('Error recording generation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Record generation in global statistics
 */
async function recordGlobalGeneration(timestamp) {
    const globalRef = db.collection('globalUsage').doc('stats');
    
    await db.runTransaction(async (transaction) => {
        const globalDoc = await transaction.get(globalRef);
        
        let globalStats = {
            hourlyGenerations: [],
            dailyGenerations: [],
            lastUpdate: timestamp
        };

        if (globalDoc.exists) {
            globalStats = globalDoc.data();
            
            // Clean up old data
            const hourStart = timestamp - RATE_LIMIT.HOUR_WINDOW_MS;
            const dayStart = timestamp - RATE_LIMIT.DAY_WINDOW_MS;
            
            globalStats.hourlyGenerations = globalStats.hourlyGenerations.filter(
                ts => ts > hourStart
            );
            globalStats.dailyGenerations = globalStats.dailyGenerations.filter(
                ts => ts > dayStart
            );
        }

        // Add current generation
        globalStats.hourlyGenerations.push(timestamp);
        globalStats.dailyGenerations.push(timestamp);
        globalStats.lastUpdate = timestamp;

        transaction.set(globalRef, globalStats);
    });
}

/**
 * Record generation for specific IP
 */
async function recordIPGeneration(clientIP, timestamp) {
    const ipRef = db.collection('ipRateLimits').doc(clientIP);
    
    await db.runTransaction(async (transaction) => {
        const ipDoc = await transaction.get(ipRef);
        
        let ipStats = {
            hourlyGenerations: [],
            minuteGenerations: [],
            lastUpdate: timestamp
        };

        if (ipDoc.exists) {
            ipStats = ipDoc.data();
            
            // Clean up old data
            const hourStart = timestamp - RATE_LIMIT.HOUR_WINDOW_MS;
            const minuteStart = timestamp - RATE_LIMIT.MINUTE_WINDOW_MS;
            
            ipStats.hourlyGenerations = ipStats.hourlyGenerations.filter(
                ts => ts > hourStart
            );
            ipStats.minuteGenerations = ipStats.minuteGenerations.filter(
                ts => ts > minuteStart
            );
        }

        // Add current generation
        ipStats.hourlyGenerations.push(timestamp);
        ipStats.minuteGenerations.push(timestamp);
        ipStats.lastUpdate = timestamp;

        transaction.set(ipRef, ipStats);
    });
}

/**
 * Get rate limit status for a client
 */
export const handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, GET',
            },
            body: JSON.stringify({}),
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
        };
    }

    const API_KEY = process.env.FUNCTIONS_API_KEY;

    // Check for valid API key
    const providedKey = event.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        return {
            statusCode: 401,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Unauthorized' }),
        };
    }

    try {
        const rateLimitStatus = await checkRateLimit(event);
        
        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(rateLimitStatus),
        };
    } catch (error) {
        console.error('Error in checkRateLimit handler:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
