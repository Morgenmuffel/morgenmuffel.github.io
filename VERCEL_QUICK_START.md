# Quick Start: Vercel Deployment with Password Protection

## What's Included

I've created the following files to help you deploy to Vercel with password protection:

1. **VERCEL_DEPLOYMENT_GUIDE.md** - Complete step-by-step guide
2. **vercel.json** - Vercel configuration file
3. **package.json** - Required for using middleware
4. **middleware.js** - Server-side password protection (Recommended)
5. **password-protection-simple.js** - Client-side alternative (simpler, less secure)

## Choose Your Protection Method

### Option 1: Server-Side (Recommended) ⭐

**Files needed:**
- `vercel.json`
- `package.json`
- `middleware.js`

**Pros:**
- ✅ More secure
- ✅ Professional browser authentication dialog
- ✅ Password not visible in source code
- ✅ Works on all browsers

**Setup:**
1. Commit all three files to your repository
2. Set environment variable in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Name: `PROTECTED_PAGES_PASSWORD`
   - Value: Your secure password
3. Deploy to Vercel

**To customize protected pages:**
Edit `middleware.js` lines 11-18 to add/remove pages from the `PROTECTED_PAGES` array.

### Option 2: Client-Side (Simple)

**Files needed:**
- `password-protection-simple.js`

**Pros:**
- ✅ Very easy to implement
- ✅ No build process needed
- ✅ Works immediately

**Cons:**
- ❌ Password visible in source code
- ❌ Less secure
- ❌ Can be bypassed by disabling JavaScript

**Setup:**
1. Edit `password-protection-simple.js` and change `your-password-here` to your password
2. Add this to each HTML file you want to protect (in the `<head>` section):
   ```html
   <script src="/password-protection-simple.js"></script>
   ```

## Quick Deployment Steps

### Step 1: Commit Files (Choose your method first!)

**For Server-Side Protection:**
```bash
git add vercel.json package.json middleware.js
git commit -m "Add Vercel configuration and password protection"
git push origin claude/vercel-redeploy-password-protect-01LgcnUQdvEwgZXJfvbbiCPb
```

**For Client-Side Protection:**
```bash
git add password-protection-simple.js
# Edit your HTML files to include the script
git add *.html
git commit -m "Add client-side password protection"
git push origin claude/vercel-redeploy-password-protect-01LgcnUQdvEwgZXJfvbbiCPb
```

### Step 2: Deploy to Vercel

1. Go to https://vercel.com and sign up/login
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Click "Deploy"

### Step 3: Set Password (Server-Side only)

1. In Vercel, go to Project Settings → Environment Variables
2. Add:
   - **Name:** `PROTECTED_PAGES_PASSWORD`
   - **Value:** Your secure password (e.g., `MySecureP@ssw0rd2024`)
   - **Environments:** Check all (Production, Preview, Development)
3. Click "Save"
4. Redeploy your project

### Step 4: Setup Custom Domain

1. In Vercel, go to Settings → Domains
2. Add `yuliavilensky.com`
3. Update DNS at your domain registrar:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   ```
4. Wait 5-60 minutes for DNS propagation

### Step 5: Test

1. Visit your Vercel URL
2. Try accessing a protected page (e.g., `/ai-health-coach.html`)
3. Enter password when prompted
4. Verify you can access the page

## Current Protected Pages

Based on your repository, I've configured these pages to be password-protected:

- `/ai-health-coach.html`
- `/multi-agent-architecture.html`
- `/bank.html`
- `/clustered.html`
- `/bedtime-storyai.html`
- `/locationdata.html`
- `/diagrams.html`

**Public page (no password):**
- `/index.html` (home page)

## To Change Protected Pages

**Server-Side (middleware.js):**
Edit the `PROTECTED_PAGES` array on lines 11-18 and the `matcher` array on lines 134-151.

**Client-Side:**
Add or remove the `<script>` tag from HTML files.

## Troubleshooting

**"Module not found" error:**
- Make sure `package.json` has `"type": "module"`
- Ensure all files are in the repository root

**Password not working:**
- Server-side: Check environment variable is set correctly
- Client-side: Check password in JavaScript file matches what you're entering

**Page not protected:**
- Server-side: Verify page is listed in both `PROTECTED_PAGES` and `config.matcher`
- Client-side: Verify script tag is present in HTML file

## Need More Help?

Read the full guide: **VERCEL_DEPLOYMENT_GUIDE.md**

## Recommended Next Steps

1. ✅ Choose your protection method (I recommend server-side)
2. ✅ Commit the necessary files
3. ✅ Deploy to Vercel
4. ✅ Set up password (environment variable or in JS file)
5. ✅ Configure custom domain
6. ✅ Test everything
7. ✅ Share password with authorized viewers only

---

**Security Tip:** Never commit passwords directly in code if using server-side protection. Always use environment variables in Vercel.
