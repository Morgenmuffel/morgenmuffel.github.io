// Edge Middleware for static sites (no Next.js)

// ========================================
// CONFIGURATION
// ========================================

// Define which pages require password protection
const PROTECTED_PAGES = [
  '/multi-agent-architecture.html'
];

// Password for protected pages
// RECOMMENDED: Set this as an environment variable in Vercel dashboard
// (Project Settings → Environment Variables → PROTECTED_PAGES_PASSWORD)
const PASSWORD = process.env.PROTECTED_PAGES_PASSWORD || 'change-this-password';

// Cookie settings
const COOKIE_NAME = 'portfolio-auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// ========================================
// MIDDLEWARE FUNCTION
// ========================================

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  // Check if the current page is in the protected list
  const isProtected = PROTECTED_PAGES.some(page => {
    // Match exact path or path without .html extension
    return pathname === page || pathname === page.replace('.html', '');
  });

  // If page is not protected, allow access
  if (!isProtected) {
    return;
  }

  // Check for authentication cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...v] = c.trim().split('=');
      return [key, v.join('=')];
    })
  );
  const authCookie = cookies[COOKIE_NAME];

  // If valid cookie exists, grant access
  if (authCookie === PASSWORD) {
    return;
  }

  // Check for Basic Auth header
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    try {
      // Parse Basic Auth header
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      // Validate password (username can be anything)
      if (password === PASSWORD) {
        // Create response with auth cookie
        const response = new Response(null, {
          headers: {
            'Set-Cookie': `${COOKIE_NAME}=${PASSWORD}; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`
          }
        });
        return response;
      }
    } catch (error) {
      // Invalid auth header format, fall through to 401
      console.error('Auth header parsing error:', error);
    }
  }

  // Authentication failed - return 401 with Basic Auth challenge
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Required</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    h1 { color: #333; margin-top: 0; }
    p { color: #666; }
    .icon { font-size: 48px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔒</div>
    <h1>Authentication Required</h1>
    <p>This project page is password protected.</p>
    <p>Please authenticate to view this content.</p>
  </div>
</body>
</html>`,
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Protected Project Pages", charset="UTF-8"',
        'Content-Type': 'text/html; charset=utf-8'
      }
    }
  );
}

// ========================================
// MIDDLEWARE MATCHER CONFIG
// ========================================

// Define which routes this middleware should run on
export const config = {
  matcher: [
    '/multi-agent-architecture.html',
    '/multi-agent-architecture'
  ]
};
