# Vercel Deployment Files

This repository now includes everything you need to deploy your portfolio to Vercel with password protection for project pages.

## 📁 Files Overview

| File | Purpose | Required? |
|------|---------|-----------|
| `VERCEL_DEPLOYMENT_GUIDE.md` | Complete step-by-step deployment guide | 📖 Reference |
| `VERCEL_QUICK_START.md` | Quick start guide (read this first!) | ⚡ Start here |
| `vercel.json` | Vercel configuration | ✅ Server-side |
| `package.json` | Node.js package config | ✅ Server-side |
| `middleware.js` | Server-side password protection | ✅ Server-side |
| `password-protection-simple.js` | Client-side password protection | ✅ Client-side |
| `EXAMPLE_PROTECTED_PAGE.html` | Example protected page | 📖 Reference |

## 🚀 Quick Start (3 Steps)

### 1. Read the Quick Start Guide
Start with **VERCEL_QUICK_START.md** - it has everything you need to get started.

### 2. Choose Your Protection Method

**Option A: Server-Side (Recommended)**
- More secure
- Professional authentication
- Use: `middleware.js` + `package.json` + `vercel.json`

**Option B: Client-Side (Simpler)**
- Easier to set up
- Less secure
- Use: `password-protection-simple.js`

### 3. Deploy to Vercel

1. Sign up at https://vercel.com
2. Import your GitHub repository
3. Click Deploy
4. Configure custom domain (optional)

## 🔐 Password-Protected Pages

Currently configured to protect:
- ai-health-coach.html
- multi-agent-architecture.html
- bank.html
- clustered.html
- bedtime-storyai.html
- locationdata.html
- diagrams.html

**Public page:** index.html

## 🌐 Custom Domain

Your site: **yuliavilensky.com**

After deploying to Vercel:
1. Add domain in Vercel settings
2. Update DNS records at your domain registrar
3. Wait for DNS propagation (5-60 min)

## 📚 Documentation

- **Start here:** VERCEL_QUICK_START.md
- **Full guide:** VERCEL_DEPLOYMENT_GUIDE.md
- **Example:** EXAMPLE_PROTECTED_PAGE.html

## 🆘 Support

If you need help:
1. Check the troubleshooting section in VERCEL_DEPLOYMENT_GUIDE.md
2. Visit Vercel docs: https://vercel.com/docs
3. Ask for help in this repository

## ⚠️ Important Notes

- For server-side protection: Set `PROTECTED_PAGES_PASSWORD` as environment variable in Vercel
- For client-side protection: Change the password in `password-protection-simple.js`
- Never commit real passwords directly in code
- Test on Vercel preview URL before configuring custom domain

## 🎯 Next Steps

1. ✅ Read VERCEL_QUICK_START.md
2. ✅ Choose password protection method
3. ✅ Commit necessary files
4. ✅ Deploy to Vercel
5. ✅ Set up custom domain
6. ✅ Test everything

---

Good luck with your deployment! 🚀
