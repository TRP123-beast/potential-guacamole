# 🚀 Deployment Guide: BrokerBay Auto-Booking System

This guide will help you deploy the BrokerBay auto-booking application to the cloud so your partners can test it without any local setup.

---

## 📋 Table of Contents

1. [Quick Start (Recommended: Railway)](#option-1-railway-recommended)
2. [Alternative: Render](#option-2-render)
3. [Alternative: Docker on VPS](#option-3-docker-on-vps)
4. [Post-Deployment Setup](#post-deployment-setup)
5. [Troubleshooting](#troubleshooting)

---

## Option 1: Railway (Recommended)

**Why Railway?**
- ✅ Easy one-click deployment
- ✅ Built-in volume persistence for SQLite
- ✅ Supports Puppeteer/Chrome out of the box
- ✅ Free tier available ($5 credit/month)
- ✅ Automatic HTTPS
- ✅ Great for testing with partners

### Step 1: Prepare Your Repository

```bash
# Make sure all files are committed
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### Step 2: Deploy to Railway

1. **Sign Up**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Configure Build Settings**
   - Railway will auto-detect the Dockerfile
   - No changes needed!

### Step 3: Add Environment Variables

In Railway dashboard, go to your service → **Variables** tab:

```env
# Required - Copy from your .env file
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

USER_NAME=Your Name
USER_EMAIL=your.email@example.com
USER_ORGANIZATION=Your Brokerage

# Optional - Customize if needed
DASHBOARD_PORT=3000
HEADLESS=true
ENABLE_AUTO_FETCH=true
FETCH_INTERVAL_MINUTES=12
AUTO_CONFIRM_ONLY=false
PREFERRED_DURATION=60
SHOWING_TYPE=Buyer/Broker
```

### Step 4: Add Persistent Volume

1. In Railway dashboard → **Settings** tab
2. Scroll to **Volumes**
3. Click "Add Volume"
4. Set mount path: `/app/src/data`
5. This persists your SQLite database across deployments

### Step 5: Enable Public Access

1. Go to **Settings** → **Networking**
2. Click "Generate Domain"
3. You'll get a URL like: `https://your-app.up.railway.app`

### Step 6: Initial Browser Login

**Important:** For BrokerBay automation to work, you need to log in once:

1. Temporarily set `HEADLESS=false` in environment variables
2. Watch the Railway logs to see what's happening
3. Or use a local setup first to save the browser profile, then upload it

**Better approach:**
```bash
# Run locally once with visible browser
HEADLESS=false node auto-book-enhanced.js "Test Address"
# Log in to BrokerBay when prompted
# The session will be saved to ./chrome-profile

# Then upload the chrome-profile directory to Railway volume
```

### Step 7: Share with Partners

Send your partners this link:
```
https://your-app.up.railway.app
```

They can:
- View all bookings at `/dashboard`
- Create new bookings at `/auto-book`
- No setup required!

---

## Option 2: Render

**Good alternative if Railway doesn't work for you.**

### Step 1: Sign Up

1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Create Web Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name:** brokerbay-auto-booking
   - **Environment:** Docker
   - **Region:** Choose closest to you
   - **Plan:** Free (or Starter for production)

### Step 3: Configure

Render auto-detects your Dockerfile!

Add these **Environment Variables** (in Render dashboard):

```env
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
USER_NAME=Your Name
USER_EMAIL=your.email@example.com
USER_ORGANIZATION=Your Brokerage
DASHBOARD_PORT=3000
HEADLESS=true
ENABLE_AUTO_FETCH=true
FETCH_INTERVAL_MINUTES=12
```

### Step 4: Add Persistent Disk

1. In Render dashboard → **Disks** tab
2. Click "Add Disk"
3. **Mount Path:** `/app/src/data`
4. **Size:** 1 GB (sufficient for SQLite)
5. Click "Save"

### Step 5: Deploy

1. Click "Create Web Service"
2. Wait 5-10 minutes for deployment
3. Your app will be live at `https://your-app.onrender.com`

### Render Limitations

⚠️ **Note:** Render's free tier spins down after 15 minutes of inactivity. Consider:
- Using the Starter plan ($7/month) for always-on service
- Or accepting 30-60 second cold start delays

---

## Option 3: Docker on VPS

**For maximum control and best performance.**

### Step 1: Get a VPS

Choose any provider:
- DigitalOcean ($6/month)
- Linode/Akamai ($5/month)
- Vultr ($6/month)
- AWS Lightsail ($5/month)

**Minimum specs:**
- 1 CPU
- 1 GB RAM
- 25 GB SSD

### Step 2: Initial Server Setup

```bash
# SSH into your server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Create app directory
mkdir -p /opt/brokerbay
cd /opt/brokerbay
```

### Step 3: Clone Your Repository

```bash
# If public repo
git clone https://github.com/yourusername/potential-guacamole.git .

# If private repo (use deploy key or token)
git clone https://YOUR_TOKEN@github.com/yourusername/potential-guacamole.git .
```

### Step 4: Create Environment File

```bash
# Create .env file
nano .env
```

Paste your environment variables (see ENV_TEMPLATE.md), then save (Ctrl+X, Y, Enter).

### Step 5: Deploy with Docker Compose

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Step 6: Setup Reverse Proxy (Optional but Recommended)

Install Nginx for HTTPS:

```bash
# Install Nginx
apt install nginx certbot python3-certbot-nginx -y

# Create Nginx config
nano /etc/nginx/sites-available/brokerbay
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and get SSL:

```bash
# Enable site
ln -s /etc/nginx/sites-available/brokerbay /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Get SSL certificate
certbot --nginx -d your-domain.com
```

### Step 7: Auto-start on Reboot

```bash
# Enable Docker service
systemctl enable docker

# Create systemd service for auto-restart
cat > /etc/systemd/system/brokerbay.service <<EOF
[Unit]
Description=BrokerBay Auto-Booking
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/brokerbay
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down

[Install]
WantedBy=multi-user.target
EOF

systemctl enable brokerbay
systemctl start brokerbay
```

---

## Post-Deployment Setup

### 1. Test the Application

Visit your deployed URL:

```
https://your-app.railway.app
# or
https://your-app.onrender.com
# or
https://your-domain.com
```

**Check these pages:**
- `/` or `/dashboard` - Main bookings dashboard
- `/auto-book` - Auto-booking interface
- `/api/health` - Health check (should return `{"success": true}`)

### 2. Verify Database

The database should auto-initialize on first run. Check by:

```
GET /api/bookings
```

Should return empty array or existing bookings.

### 3. Test Scheduler

Watch the logs for automated fetch cycles:

```bash
# Railway: Check deployment logs
# Render: Check service logs
# Docker: docker-compose logs -f
```

You should see messages like:
```
⏰ Starting automated fetch scheduler...
🔄 Starting automated fetch cycle
📥 Step 1/2: Fetching showing requests from Supabase...
```

### 4. Handle Browser Login

**Important:** The automation needs BrokerBay credentials.

**Option A: Use Browser Profile (Recommended)**

1. Run locally first with `HEADLESS=false`
2. Log in to BrokerBay manually
3. Session is saved to `chrome-profile/`
4. Upload this directory to your hosting platform

**Option B: Login in Production (Tricky)**

Some platforms allow VNC/desktop access to see the browser window. This is complex and not recommended.

**Option C: Accept Manual Login Prompts**

For testing, you can accept that the first few runs might fail until sessions are established.

### 5. Share with Partners

Send them:
- 📱 Dashboard URL: `https://your-app.railway.app/dashboard`
- 🤖 Auto-booking: `https://your-app.railway.app/auto-book`
- 📖 Usage instructions (see below)

---

## Partner Usage Instructions

Share this with your partners:

---

### **How to Use the BrokerBay Auto-Booking System**

#### **View Bookings**
Go to: `https://your-app.railway.app/dashboard`

- See all bookings in real-time
- Filter by status (Confirmed, Pending, etc.)
- Search by property address or client name
- Export to CSV or JSON

#### **Create New Booking**
Go to: `https://your-app.railway.app/auto-book`

1. **Paste property address** from BrokerBay
   - Example: `50 O'Neill Road #1911, Toronto`
   - The system keeps only street number + name + unit

2. **Optional: Set preferred time**
   - Example: `10:00 AM`
   - If taken, system picks next available slot

3. **Optional: Set preferred date**
   - Example: `15` (for 15th of month)

4. **Toggle options if needed:**
   - ☑️ Show browser (for debugging)
   - ☑️ Auto-confirm only (skip manual approval slots)

5. **Click "Launch automation"**

6. **Watch live progress** in the activity log

7. **Done!** Booking appears in dashboard automatically

#### **Scheduled Properties**

Properties from your main app show up automatically at the top of the auto-book page. Just click one to prefill the form.

---

## Troubleshooting

### Issue: "Database error" or "Table not found"

**Solution:**
- The database should auto-initialize
- If not, restart the service
- Check volume is mounted correctly at `/app/src/data`

### Issue: "No showing requests found"

**Solution:**
- Verify `SUPABASE_PROJECT_URL` and keys are correct
- Check your Supabase database has `showing_requests` table
- Ensure service role key has read permissions

### Issue: "Puppeteer error: Browser not found"

**Solution:**
- Make sure you're using the provided Dockerfile
- Check environment variable: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- Verify platform supports Puppeteer (Railway and Render do)

### Issue: "Auto-booking fails - login required"

**Solution:**
- You need to log in to BrokerBay at least once
- Options:
  1. Run locally with `HEADLESS=false` and upload profile
  2. Use a VPS with VNC to see the browser
  3. Contact platform support for interactive session access

### Issue: "Fetch cycle not running"

**Solution:**
- Check `ENABLE_AUTO_FETCH=true` is set
- View logs for scheduler errors
- Verify `scheduler.js` is running (should appear in logs)

### Issue: Platform times out / sleeps

**Railway:** Should stay active
**Render Free Tier:** Spins down after 15 min
- Upgrade to Starter plan ($7/month) for always-on
- Or accept 30-60s cold start delay

### Issue: "Out of memory"

**Solution:**
- Upgrade to plan with more RAM
- Railway: Hobby plan ($5/month)
- Render: Starter plan ($7/month)
- VPS: 2GB RAM recommended for multiple concurrent bookings

### Need More Help?

Check the logs:
```bash
# Railway: Deployment logs tab
# Render: Logs tab
# Docker: docker-compose logs -f
```

Look for error messages and check against this guide.

---

## Monitoring & Maintenance

### Check Application Health

```bash
# Health endpoint
curl https://your-app.railway.app/api/health

# Should return:
# {"success": true, "status": "healthy", "database": "connected"}
```

### View Logs

**Railway:**
- Go to your service → Deployments tab
- Click on active deployment → View logs

**Render:**
- Go to your service → Logs tab
- Real-time streaming

**Docker/VPS:**
```bash
docker-compose logs -f
docker-compose logs -f auto-book  # Specific service
```

### Update the Application

**Railway/Render:**
```bash
# Just push to GitHub
git push origin main

# Railway/Render auto-redeploy
```

**Docker/VPS:**
```bash
cd /opt/brokerbay
git pull
docker-compose down
docker-compose up -d --build
```

### Database Backups

**Important:** Back up your SQLite database regularly!

```bash
# Railway: Download from volume via CLI
railway run sqlite3 /app/src/data/data.db .dump > backup.sql

# Docker/VPS:
docker-compose exec auto-book sqlite3 /app/src/data/data.db .dump > backup.sql

# Or just copy the file
cp src/data/data.db backups/data-$(date +%Y%m%d).db
```

### Update Environment Variables

**Railway:**
1. Go to Variables tab
2. Edit value
3. Service auto-restarts

**Render:**
1. Go to Environment tab
2. Update value
3. Click "Save Changes"
4. Manual restart required

**Docker:**
1. Edit `.env` file
2. Run `docker-compose down && docker-compose up -d`

---

## Cost Estimates

### Railway
- **Free tier:** $5 credit/month (good for testing)
- **Hobby:** $5/month (recommended for production)
- **Pro:** $20/month (multiple apps, teams)

### Render
- **Free:** $0 (sleeps after 15min inactivity)
- **Starter:** $7/month (always-on, recommended)
- **Standard:** $25/month (more resources)

### VPS (Most flexible)
- **DigitalOcean:** $6/month (1GB RAM, 25GB SSD)
- **Linode:** $5/month (1GB RAM, 25GB SSD)
- **Vultr:** $6/month (1GB RAM, 25GB SSD)

**Recommendation for testing with partners:** Railway Hobby ($5/month) or Render Starter ($7/month)

---

## Security Best Practices

1. **Never commit `.env` to git**
   ```bash
   # Already in .gitignore
   .env
   ```

2. **Rotate Supabase keys** if exposed

3. **Use strong passwords** for BrokerBay account

4. **Enable HTTPS** (automatic on Railway/Render)

5. **Restrict API access** if needed:
   ```javascript
   // In dashboard-server.js, add authentication middleware
   ```

6. **Monitor logs** for suspicious activity

7. **Keep dependencies updated**:
   ```bash
   npm audit
   npm update
   ```

---

## Next Steps

✅ Deploy to Railway or Render
✅ Configure environment variables  
✅ Test the dashboard and auto-booking
✅ Share with partners
✅ Monitor and maintain

**Questions?** Check the main README.md or open an issue on GitHub.

---

**Happy Deploying! 🚀**

