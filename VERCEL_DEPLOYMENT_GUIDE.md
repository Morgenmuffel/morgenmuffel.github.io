# Vercel Deployment & Password Protection Guide

This guide will help you migrate your portfolio from GitHub Pages to Vercel and add password protection to specific project pages.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Part 1: Deploy to Vercel](#part-1-deploy-to-vercel)
3. [Part 2: Custom Domain Setup](#part-2-custom-domain-setup)
4. [Part 3: Password Protection](#part-3-password-protection)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Git installed on your computer
- GitHub account (you already have this)
- Vercel account (free tier) - sign up at https://vercel.com
- Access to your domain DNS settings (for yuliavilensky.com)

---

## Part 1: Deploy to Vercel

### Step 1: Create a Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub" (recommended for easy integration)
4. Authorize Vercel to access your GitHub repositories

### Step 2: Import Your Repository

1. From your Vercel dashboard, click "Add New..." → "Project"
2. Find and select your `morgenmuffel.github.io` repository
3. Click "Import"

### Step 3: Configure Build Settings

Since this is a static HTML site, use these settings:

- **Framework Preset**: Other (or leave as detected)
- **Build Command**: Leave empty (no build needed for static HTML)
- **Output Directory**: `.` (root directory)
- **Install Command**: Leave empty

Click "Deploy"

### Step 4: Wait for Deployment

Vercel will deploy your site in 30-60 seconds. You'll get a temporary URL like:
```
https://morgenmuffel-github-io.vercel.app
```

---

## Part 2: Custom Domain Setup

### Step 1: Add Custom Domain in Vercel

1. In your Vercel project, go to "Settings" → "Domains"
2. Enter `yuliavilensky.com` and click "Add"
3. Vercel will show you DNS records to configure

### Step 2: Update DNS Records

You'll need to update your domain's DNS settings. Vercel will provide you with one of these options:

#### Option A: Using A Records (Recommended)
Add these A records to your DNS:
```
Type: A
Name: @
Value: 76.76.21.21
```

For www subdomain:
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

#### Option B: Using CNAME
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
```

**Where to update DNS:**
- Log into your domain registrar (where you bought yuliavilensky.com)
- Find DNS settings/management
- Remove the old GitHub Pages records
- Add the new Vercel records above

### Step 3: Verify Domain

1. After updating DNS (may take 5-60 minutes), return to Vercel
2. Click "Refresh" to verify the domain
3. Once verified, Vercel will automatically provision an SSL certificate

### Step 4: Remove GitHub Pages (Optional)

Once Vercel is working:
1. Go to your GitHub repository settings
2. Navigate to "Pages" section
3. Set source to "None" or keep it as backup
4. Delete the `CNAME` file from your repository (optional)

---

## Part 3: Password Protection

Vercel's free tier doesn't have built-in password protection, but we can implement it using:
- **Option A**: Vercel Edge Functions (Middleware) - *Recommended*
- **Option B**: Client-side password protection (Simple but less secure)

### Option A: Edge Middleware (Vercel Middleware)

This is the professional approach using Vercel's Edge Runtime.

#### Step 1: Create Package.json

Create `package.json` in your repository root:

```json
{
  "name": "portfolio-site",
  "version": "1.0.0",
  "private": true,
  "dependencies": {}
}
```

#### Step 2: Create Middleware File

Create `middleware.js` in your repository root:

```javascript
import { NextResponse } from 'next/server';

// Define which pages require password protection
const PROTECTED_PAGES = [
  '/ai-health-coach.html',
  '/multi-agent-architecture.html',
  '/bank.html',
  // Add more pages as needed
];

// Password for protected pages (change this!)
const PASSWORD = 'your-secure-password-here';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Check if the current page is protected
  const isProtected = PROTECTED_PAGES.some(page =>
    pathname === page || pathname === page.replace('.html', '')
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for password in cookie or header
  const authCookie = request.cookies.get('portfolio-auth')?.value;
  const authHeader = request.headers.get('authorization');

  // Validate password from cookie
  if (authCookie === PASSWORD) {
    return NextResponse.next();
  }

  // Check Basic Auth header
  if (authHeader) {
    const auth = authHeader.split(' ')[1];
    const [user, pass] = Buffer.from(auth, 'base64').toString().split(':');

    if (pass === PASSWORD) {
      // Set cookie and allow access
      const response = NextResponse.next();
      response.cookies.set('portfolio-auth', PASSWORD, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
      return response;
    }
  }

  // Return 401 with Basic Auth challenge
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Protected Project Pages"'
    }
  });
}

export const config = {
  matcher: [
    '/ai-health-coach.html',
    '/multi-agent-architecture.html',
    '/bank.html',
    // Add more pages as needed
  ]
};
```

#### Step 3: Update Vercel Configuration

Create `vercel.json` in your repository root:

```json
{
  "buildCommand": "echo 'No build needed'",
  "outputDirectory": ".",
  "framework": null
}
```

#### Step 4: Deploy Changes

```bash
git add package.json middleware.js vercel.json
git commit -m "Add password protection middleware"
git push origin main
```

Vercel will automatically redeploy with the new middleware.

### Option B: Client-Side Password Protection (Simpler)

This is easier to implement but less secure (password visible in source code).

#### Create Protected Page Wrapper

For each protected page, add this script at the beginning of the `<body>` tag:

```html
<script>
(function() {
  const CORRECT_PASSWORD = 'your-password-here';
  const AUTH_KEY = 'portfolio-auth';

  // Check if already authenticated
  const isAuthenticated = sessionStorage.getItem(AUTH_KEY) === 'true';

  if (!isAuthenticated) {
    const password = prompt('This project is password protected. Please enter the password:');

    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
    } else {
      alert('Incorrect password');
      window.location.href = '/index.html';
    }
  }
})();
</script>
```

Example integration in `ai-health-coach.html`:

```html
<body>
  <script>
  (function() {
    const CORRECT_PASSWORD = 'secretproject123';
    const AUTH_KEY = 'portfolio-auth';

    const isAuthenticated = sessionStorage.getItem(AUTH_KEY) === 'true';

    if (!isAuthenticated) {
      const password = prompt('This project is password protected. Please enter the password:');

      if (password === CORRECT_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, 'true');
      } else {
        alert('Incorrect password');
        window.location.href = '/index.html';
      }
    }
  })();
  </script>

  <!-- Rest of your page content -->
</body>
```

### Option C: Vercel Authentication (Pro Feature)

If you upgrade to Vercel Pro ($20/month), you get:
- Built-in password protection
- Team collaboration
- Advanced authentication options

To enable:
1. Upgrade to Vercel Pro
2. Go to Project Settings → Deployment Protection
3. Enable "Password Protection"
4. Set password for specific deployments or branches

---

## Testing

### Test Your Deployment

1. **Visit your Vercel URL**: Check that the site loads correctly
2. **Test protected pages**: Try accessing password-protected pages
3. **Test custom domain**: Once DNS propagates, visit yuliavilensky.com
4. **Check SSL**: Ensure HTTPS is working (should show padlock icon)
5. **Test all links**: Make sure navigation and assets load properly

### Common Issues

**"Domain not verified"**
- DNS changes can take up to 48 hours (usually 5-30 minutes)
- Use https://dnschecker.org to check propagation

**"Assets not loading"**
- Check that asset paths are relative (e.g., `assets/image.png` not `/assets/image.png`)
- Clear browser cache

**"Password protection not working"**
- For middleware: Ensure `middleware.js` is in the repository root
- For client-side: Check browser console for JavaScript errors
- Verify the file was committed and deployed

---

## Deployment Workflow Going Forward

### Making Updates

1. Edit your files locally
2. Commit changes:
   ```bash
   git add .
   git commit -m "Your change description"
   git push origin main
   ```
3. Vercel automatically deploys in ~30 seconds
4. Preview deployment at your Vercel URL before it goes live

### Preview Deployments

Every push to a branch creates a preview deployment:
- Main branch → Production (yuliavilensky.com)
- Other branches → Preview URLs for testing

---

## Comparison: GitHub Pages vs Vercel

| Feature | GitHub Pages | Vercel Free |
|---------|-------------|-------------|
| Custom Domain | ✅ | ✅ |
| SSL/HTTPS | ✅ | ✅ |
| Deploy Speed | ~2-5 min | ~30 sec |
| Password Protection | ❌ | ✅ (with middleware) |
| Analytics | ❌ | ✅ (basic) |
| Preview Deployments | ❌ | ✅ |
| Edge Functions | ❌ | ✅ |
| Bandwidth | 100GB/month | 100GB/month |

---

## Security Best Practices

1. **Never commit passwords directly in code**
   - Use environment variables for middleware passwords
   - For client-side, accept that it's not truly secure

2. **Use strong passwords**
   - Minimum 12 characters
   - Mix of letters, numbers, symbols

3. **Rotate passwords periodically**
   - Update every 3-6 months
   - Update if shared with someone who no longer needs access

4. **Consider upgrading to Vercel Pro**
   - If you need professional-grade security
   - If you're sharing with clients/stakeholders

---

## Environment Variables (Recommended for Middleware)

Instead of hardcoding the password in `middleware.js`, use environment variables:

### Step 1: Update middleware.js

```javascript
const PASSWORD = process.env.PROTECTED_PAGES_PASSWORD || 'fallback-password';
```

### Step 2: Set Environment Variable in Vercel

1. Go to Project Settings → Environment Variables
2. Add variable:
   - **Name**: `PROTECTED_PAGES_PASSWORD`
   - **Value**: `your-secure-password`
   - **Environments**: Production, Preview, Development
3. Click "Save"
4. Redeploy your project

---

## Quick Start Checklist

- [ ] Create Vercel account
- [ ] Connect GitHub repository
- [ ] Deploy to Vercel
- [ ] Test Vercel preview URL
- [ ] Add custom domain in Vercel
- [ ] Update DNS records at domain registrar
- [ ] Wait for DNS propagation (5-60 min)
- [ ] Verify domain in Vercel
- [ ] Implement password protection (choose method)
- [ ] Test password-protected pages
- [ ] Remove GitHub Pages deployment (optional)
- [ ] Update any bookmarks/links to new URL

---

## Support Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Vercel Support**: https://vercel.com/support
- **Community Help**: https://github.com/vercel/vercel/discussions

---

## Next Steps

1. Follow Part 1 to deploy to Vercel
2. Test with the preview URL
3. Follow Part 2 to setup custom domain
4. Choose and implement password protection method (Part 3)
5. Share the password with authorized viewers

Good luck with your deployment! 🚀
