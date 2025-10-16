# 🚀 Render Deployment Guide

## Why Render > Vercel for This Project

✅ **Persistent file storage** - Uploads, game saves, and exports persist
✅ **No timeout limits** - SSE connections work without limits
✅ **Full server environment** - Not serverless, real file system
✅ **Free tier** - 750 hours/month free
✅ **Better for long-running processes** - PDF processing, game sessions

---

## Quick Deployment Steps

### Method 1: Via Render Dashboard (Recommended)

1. **Go to Render**
   - Visit: https://render.com
   - Sign up or log in (use GitHub account for easy integration)

2. **Create New Web Service**
   - Click **"New +"** → **"Web Service"**

3. **Connect Repository**
   - Choose **"Connect a repository"**
   - Select your GitHub repository
   - Or use **"Public Git repository"** and paste your repo URL

4. **Configure Service**
   - **Name:** `interactive-fiction-backend` (or your choice)
   - **Region:** Singapore (closest to you) or any region
   - **Branch:** `main`
   - **Root Directory:** (leave empty)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`

5. **Add Environment Variables**
   Click **"Advanced"** → **"Add Environment Variable"**

   Add these:
   ```
   CLAUDE_API_KEY=sk-tAfN4n17IW98QsQP9SgOW0pWtLI3JSgVESjYPlzJBifA3sDJ
   CLAUDE_BASE_URL=https://epone.ggb.today/v1
   NODE_ENV=production
   ENABLE_LLM_PARSING=true
   ```

6. **Choose Plan**
   - Select **"Free"** plan
   - Free plan includes:
     - 750 hours/month
     - 512 MB RAM
     - Automatic SSL
     - Custom domains

7. **Create Web Service**
   - Click **"Create Web Service"**
   - Render will automatically deploy your app
   - Wait 2-5 minutes for build to complete

8. **Get Your URL**
   - Once deployed, you'll get a URL like: `https://your-app-name.onrender.com`

---

### Method 2: Using render.yaml (Automated)

Your project already has `render.yaml` configured!

1. **Push to GitHub** (if not already)
   ```bash
   git add .
   git commit -m "Prepare for Render deployment"
   git push
   ```

2. **Connect to Render**
   - Go to https://render.com/dashboard
   - Click **"New +"** → **"Blueprint"**
   - Select your repository
   - Render will automatically read `render.yaml`

3. **Add Environment Variables**
   - In the Render dashboard, add the secret environment variables:
     - `CLAUDE_API_KEY`
     - `CLAUDE_BASE_URL`

4. **Deploy**
   - Click **"Apply"**
   - Render will build and deploy automatically

---

## After Deployment

### Test Your Deployment

1. **Health Check**
   ```
   https://your-app.onrender.com/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "message": "Server is running",
     "environment": "Render",
     "nodeVersion": "v20.x.x"
   }
   ```

2. **Frontend**
   ```
   https://your-app.onrender.com/index.html
   ```

3. **API Manifest**
   ```
   https://your-app.onrender.com/api/game/manifest
   ```

---

## Important Render Features

### Persistent Disk

Your app has a **1GB persistent disk** configured in `render.yaml`:
```yaml
disk:
  name: persistent-storage
  mountPath: /opt/render/project/src
  sizeGB: 1
```

This means:
- ✅ Uploaded PDFs persist
- ✅ Game saves persist
- ✅ Generated JSON files persist
- ✅ No data loss between deploys

### Auto-Deploy

Render automatically redeploys when you push to your GitHub branch:
```bash
git push
```
→ Render detects changes and redeploys (takes ~2-3 minutes)

### Custom Domain (Optional)

Free plan includes custom domains:
1. Go to Settings → Custom Domain
2. Add your domain
3. Update DNS records as instructed

---

## Environment Variables

Set these in Render Dashboard → Settings → Environment Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `CLAUDE_API_KEY` | `sk-tAfN4n17IW98QsQP9SgOW0pWtLI3JSgVESjYPlzJBifA3sDJ` | Required |
| `CLAUDE_BASE_URL` | `https://epone.ggb.today/v1` | Required |
| `NODE_ENV` | `production` | Auto-set |
| `ENABLE_LLM_PARSING` | `true` | Optional |
| `UPLOAD_DIR` | `uploads` | Optional |
| `MAX_FILE_SIZE` | `10485760` | Optional |

---

## Monitoring & Logs

### View Logs
1. Go to your service in Render dashboard
2. Click **"Logs"** tab
3. See real-time logs

### Or use CLI:
```bash
# Install Render CLI
npm install -g @render/cli

# Login
render login

# View logs
render logs
```

---

## Free Tier Limits

✅ **Included:**
- 750 hours/month (enough for 24/7 with spare)
- 512 MB RAM
- Automatic SSL
- Custom domains
- GitHub auto-deploy
- 1GB persistent storage

⚠️ **Limitations:**
- App spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds (cold start)
- 512 MB RAM (should be enough for this app)

💡 **Tip:** Keep your app alive with a cron job that pings `/health` every 10 minutes

---

## Upgrading (If Needed)

If you hit limits, upgrade to Starter plan ($7/month):
- No spin-down (always on)
- 512 MB → 2 GB RAM
- Priority support

---

## Troubleshooting

### Build Fails
- Check build logs in dashboard
- Ensure `package.json` is correct
- Verify all dependencies are in `dependencies`, not `devDependencies`

### Can't Access Files
- Check disk is mounted correctly in `render.yaml`
- Verify paths use absolute paths

### Environment Variables Not Working
- Ensure variables are set in dashboard
- Restart service after adding variables

---

## Comparison: Render vs Vercel

| Feature | Render | Vercel |
|---------|--------|--------|
| **File Storage** | ✅ Persistent | ❌ Ephemeral |
| **SSE Support** | ✅ Unlimited | ⚠️ 25s timeout |
| **Timeouts** | ✅ None | ❌ 10-60s |
| **Server Type** | ✅ Traditional | Serverless |
| **Free Tier** | 750 hrs/month | Unlimited |
| **Best For** | This project! | Static/short functions |

---

## Next Steps

1. ✅ Vercel files removed
2. ✅ Server.js restored to normal mode
3. ✅ render.yaml created
4. ✅ Ready to deploy

**Just connect your repo to Render and you're live!** 🚀

---

## Quick Start Command

```bash
# Commit changes
git add .
git commit -m "Migrate to Render"
git push

# Then go to https://render.com and connect your repo
```

That's it! Your app will be live in ~3 minutes.
