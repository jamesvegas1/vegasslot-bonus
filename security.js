// ============================================
// SECURITY UTILITIES
// ============================================

// XSS Sanitization - Remove dangerous HTML/Script tags
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove HTML tags
    let clean = input.replace(/<[^>]*>/g, '');
    
    // Encode special characters
    clean = clean
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    
    // Remove potential script injections
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/on\w+\s*=/gi, '');
    
    return clean.trim();
}

// Validate username - only allow safe characters
function validateUsername(username) {
    // Allow: letters, numbers, underscore, dash, dot (3-30 chars)
    const pattern = /^[a-zA-Z0-9_\-\.]{3,30}$/;
    return pattern.test(username);
}

// SHA-256 Hash function for passwords
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Verify password against hash
async function verifyPassword(password, hash) {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

// Generate secure random token
function generateSecureToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Rate limit tracker (client-side)
const rateLimitMap = new Map();
function checkClientRateLimit(key, maxAttempts = 5, windowMs = 60000) {
    const now = Date.now();
    const attempts = rateLimitMap.get(key) || [];
    
    // Remove old attempts
    const validAttempts = attempts.filter(t => now - t < windowMs);
    
    if (validAttempts.length >= maxAttempts) {
        return false; // Rate limited
    }
    
    validAttempts.push(now);
    rateLimitMap.set(key, validAttempts);
    return true; // Allowed
}

console.log('🔒 Security utilities loaded');
