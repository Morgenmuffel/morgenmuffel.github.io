// ========================================
// CLIENT-SIDE PASSWORD PROTECTION
// ========================================
// This is a simple password protection solution
// NOTE: This is NOT secure - password is visible in source code
// For better security, use the middleware.js approach
//
// Usage: Add this script to the <head> or beginning of <body>
// in any HTML file you want to protect
// ========================================

(function() {
  'use strict';

  // CONFIGURATION
  const CORRECT_PASSWORD = 'your-password-here'; // CHANGE THIS!
  const AUTH_KEY = 'portfolio-auth-token';
  const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  // Check if user is already authenticated
  const authData = sessionStorage.getItem(AUTH_KEY);

  if (authData) {
    try {
      const { timestamp, authenticated } = JSON.parse(authData);
      const now = new Date().getTime();

      // Check if session is still valid
      if (authenticated && (now - timestamp) < SESSION_DURATION) {
        // User is authenticated and session is valid
        return;
      }
    } catch (e) {
      // Invalid auth data, proceed to password prompt
      sessionStorage.removeItem(AUTH_KEY);
    }
  }

  // Prompt for password
  const password = prompt('🔒 This project is password protected.\n\nPlease enter the password to continue:');

  if (password === CORRECT_PASSWORD) {
    // Store authentication
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({
      authenticated: true,
      timestamp: new Date().getTime()
    }));

    // Show success message (optional)
    console.log('✅ Access granted');
  } else {
    // Invalid password
    if (password !== null) { // User didn't click Cancel
      alert('❌ Incorrect password. Redirecting to home page.');
    }

    // Redirect to home page
    window.location.href = '/index.html';
  }
})();
