# ✅ Deployment Checklist

Use this checklist to ensure smooth deployment of your BrokerBay Auto-Booking System.

---

## Pre-Deployment

### 📋 Information Gathering

- [ ] Have Supabase project URL
- [ ] Have Supabase anon key
- [ ] Have Supabase service role key
- [ ] Know your BrokerBay user details (name, email, organization)
- [ ] Have existing `data.db` ready (if migrating data)
- [ ] Have chosen deployment platform (Railway/Render/VPS)

### 🔐 Security Check

- [ ] `.env` file is in `.gitignore`
- [ ] No credentials committed to git history
- [ ] Supabase keys are valid and not expired
- [ ] Service role key has appropriate permissions

### 📦 Code Preparation

- [ ] All changes committed to git
- [ ] Pushed to GitHub/GitLab
- [ ] Repository is accessible (public or connected to platform)
- [ ] `Dockerfile` is in project root
- [ ] `docker-compose.yml` is configured
- [ ] `docker-entrypoint.sh` is executable

---

## Railway Deployment

### 🚂 Initial Setup

- [ ] Created Railway account
- [ ] Connected GitHub account
- [ ] Created new project
- [ ] Selected correct repository
- [ ] Railway detected Dockerfile

### ⚙️ Configuration

- [ ] Added `SUPABASE_PROJECT_URL` environment variable
- [ ] Added `SUPABASE_ANON_KEY` environment variable
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` environment variable
- [ ] Added `USER_NAME` environment variable
- [ ] Added `USER_EMAIL` environment variable
- [ ] Added `USER_ORGANIZATION` environment variable
- [ ] Set `DASHBOARD_PORT=3000`
- [ ] Set `HEADLESS=true`
- [ ] Set `ENABLE_AUTO_FETCH=true`
- [ ] Set `FETCH_INTERVAL_MINUTES=12`

### 💾 Storage

- [ ] Created volume
- [ ] Set mount path to `/app/src/data`
- [ ] Volume is 1GB or larger
- [ ] (Optional) Uploaded existing `data.db` to volume

### 🌐 Networking

- [ ] Generated public domain
- [ ] Copied URL for sharing
- [ ] (Optional) Added custom domain

### 🏗️ Build & Deploy

- [ ] Initial build started
- [ ] Build completed successfully
- [ ] Service is running (check dashboard)
- [ ] No error logs

---

## Render Deployment

### 🎨 Initial Setup

- [ ] Created Render account
- [ ] Connected GitHub account
- [ ] Created new Web Service
- [ ] Selected correct repository
- [ ] Set environment to "Docker"
- [ ] Selected region
- [ ] Chose plan (Starter recommended)

### ⚙️ Configuration

- [ ] Added all required environment variables (same as Railway)
- [ ] Set port to 3000

### 💾 Storage

- [ ] Added disk
- [ ] Set mount path to `/app/src/data`
- [ ] Set size to 1GB
- [ ] (Optional) Uploaded existing `data.db`

### 🏗️ Build & Deploy

- [ ] Clicked "Create Web Service"
- [ ] Build started
- [ ] Build completed (10-15 minutes)
- [ ] Service is live
- [ ] No build errors

---

## VPS Deployment

### 🖥️ Server Setup

- [ ] Provisioned VPS (1GB RAM minimum)
- [ ] Can SSH into server
- [ ] Updated system packages (`apt update && apt upgrade`)
- [ ] Installed Docker
- [ ] Installed Docker Compose
- [ ] Created app directory (`/opt/brokerbay`)

### 📥 Code Deployment

- [ ] Cloned repository to server
- [ ] Created `.env` file with all variables
- [ ] Verified file permissions
- [ ] Made `docker-entrypoint.sh` executable

### 🐳 Docker Setup

- [ ] Ran `docker-compose build`
- [ ] Ran `docker-compose up -d`
- [ ] Services are running (`docker-compose ps`)
- [ ] No container errors (`docker-compose logs`)

### 🌐 Networking (Optional)

- [ ] Installed Nginx
- [ ] Created Nginx config
- [ ] Enabled site
- [ ] Tested Nginx config (`nginx -t`)
- [ ] Restarted Nginx
- [ ] Obtained SSL certificate (Certbot)
- [ ] HTTPS working

### 🔄 Auto-Start

- [ ] Created systemd service
- [ ] Enabled service
- [ ] Tested service start/stop
- [ ] Verified auto-start on reboot

---

## Post-Deployment Testing

### 🔍 Health Checks

- [ ] `/api/health` returns `{"success": true}`
- [ ] Dashboard loads at `/` or `/dashboard`
- [ ] Auto-book page loads at `/auto-book`
- [ ] No JavaScript errors in browser console

### 📊 API Endpoints

- [ ] `GET /api/bookings` works
- [ ] `GET /api/stats` works
- [ ] `GET /api/scheduled-properties` works
- [ ] `GET /api/properties` works

### 🤖 Scheduler

- [ ] Check logs for scheduler startup
- [ ] See "⏰ Starting automated fetch scheduler..."
- [ ] See fetch cycles running every 12 minutes
- [ ] No errors in scheduler logs

### 💾 Database

- [ ] `data.db` file exists in volume
- [ ] `bookings` table exists
- [ ] `processed_showing_requests` table exists
- [ ] `properties` table exists
- [ ] Can query tables via API

### 🎭 Automation Testing

- [ ] Can access auto-book page
- [ ] Scheduled properties show up (if any)
- [ ] Can enter test address
- [ ] Can click "Launch automation"
- [ ] Live logs stream correctly
- [ ] (If HEADLESS=false) Can see browser actions
- [ ] Test booking completes or fails gracefully
- [ ] Booking appears in dashboard
- [ ] Screenshots saved

---

## Browser Login Setup

### 🔐 BrokerBay Authentication

**Option A: Local Profile Upload**
- [ ] Ran locally with `HEADLESS=false`
- [ ] Logged into BrokerBay manually
- [ ] Session saved to `chrome-profile/`
- [ ] Uploaded `chrome-profile/` to server
- [ ] Set `BROWSER_PROFILE_USERDATA` environment variable
- [ ] Tested booking works without login prompt

**Option B: VNC Access**
- [ ] Set up VNC on VPS
- [ ] Connected via VNC client
- [ ] Ran automation with visible browser
- [ ] Logged in via VNC
- [ ] Session persisted

**Option C: Accept First-Run Failure**
- [ ] Aware first bookings may fail
- [ ] Monitoring for login prompts
- [ ] Plan to handle authentication

---

## Monitoring Setup

### 📈 Logging

- [ ] Know how to access platform logs
  - Railway: Deployments tab
  - Render: Logs tab
  - VPS: `docker-compose logs -f`
- [ ] Logs are readable and understandable
- [ ] Can filter logs by service (dashboard vs scheduler)

### 🔔 Alerts (Optional)

- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure alert email/SMS
- [ ] Set up error notification webhook
- [ ] Test alerts working

### 💾 Backups

- [ ] Created backup script
- [ ] Tested backup/restore process
- [ ] Scheduled automatic backups (daily/weekly)
- [ ] Verified backup integrity
- [ ] Stored backups off-server

---

## Partner Sharing

### 📱 URLs

- [ ] Dashboard URL works: `https://your-app.railway.app/dashboard`
- [ ] Auto-book URL works: `https://your-app.railway.app/auto-book`
- [ ] Tested on desktop browser
- [ ] Tested on mobile browser
- [ ] Tested on different browsers (Chrome, Firefox, Safari)

### 📖 Documentation

- [ ] Prepared usage guide for partners
- [ ] Created video walkthrough (optional but helpful)
- [ ] Documented common issues
- [ ] Set up support channel (Slack, email, etc.)

### 👥 Beta Testing

- [ ] Shared with 1-2 trusted partners
- [ ] Collected feedback
- [ ] Fixed any reported issues
- [ ] Confirmed everything works for them

---

## Production Readiness

### ⚡ Performance

- [ ] Dashboard loads in < 3 seconds
- [ ] API responses are fast (< 500ms)
- [ ] Auto-booking completes in reasonable time (2-5 minutes)
- [ ] No memory leaks (monitor over 24 hours)
- [ ] Scheduler runs reliably

### 🔒 Security

- [ ] HTTPS enabled (automatic on Railway/Render)
- [ ] Environment variables not exposed in logs
- [ ] No sensitive data in git history
- [ ] Database access restricted
- [ ] Service role key has minimal permissions

### 💰 Billing

- [ ] Understand platform pricing
- [ ] Set up payment method
- [ ] Configured spending limits (if available)
- [ ] Know when bills are due
- [ ] Monitoring resource usage

### 📊 Monitoring

- [ ] Service uptime tracking enabled
- [ ] Error rate monitoring
- [ ] Database size monitoring
- [ ] API usage tracking
- [ ] Regular log reviews scheduled

---

## Launch

### 🚀 Go Live

- [ ] All checklist items above completed
- [ ] Beta testing successful
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Documentation ready

### 📢 Communication

- [ ] Sent dashboard URL to all partners
- [ ] Sent auto-book URL to all partners
- [ ] Provided usage instructions
- [ ] Explained support channels
- [ ] Set expectations for response times

### 📅 Post-Launch

- [ ] Monitor logs for first 24 hours
- [ ] Check for any errors or issues
- [ ] Respond to partner questions
- [ ] Collect usage feedback
- [ ] Plan improvements based on feedback

---

## Maintenance Schedule

### Daily

- [ ] Check error logs
- [ ] Verify scheduler running
- [ ] Monitor service uptime

### Weekly

- [ ] Review booking statistics
- [ ] Check database size
- [ ] Review partner feedback
- [ ] Update documentation if needed

### Monthly

- [ ] Update Node.js dependencies (`npm update`)
- [ ] Run security audit (`npm audit`)
- [ ] Review and optimize performance
- [ ] Backup database
- [ ] Review and analyze usage patterns

### Quarterly

- [ ] Review hosting costs vs usage
- [ ] Consider platform alternatives if needed
- [ ] Major feature updates
- [ ] Security review

---

## Emergency Contacts

**Platform Support:**
- Railway: https://railway.app/help
- Render: https://render.com/support
- VPS Provider: [Your provider's support]

**Internal Team:**
- Technical Lead: [Name/Email]
- DevOps: [Name/Email]
- Partner Support: [Name/Email]

**External Services:**
- Supabase Support: support@supabase.io
- BrokerBay Support: [Contact info]

---

## Rollback Plan

### If Deployment Fails

**Railway/Render:**
1. [ ] Revert to previous deployment in dashboard
2. [ ] Or: Roll back git commit
3. [ ] Push to trigger redeploy
4. [ ] Verify old version working

**VPS:**
1. [ ] `docker-compose down`
2. [ ] `git checkout <previous-commit>`
3. [ ] `docker-compose up -d --build`
4. [ ] Verify working

### If Database Corrupted

1. [ ] Stop service
2. [ ] Restore from latest backup
3. [ ] Restart service
4. [ ] Verify data integrity

---

## Success Criteria

✅ Service is live and accessible
✅ All API endpoints working
✅ Scheduler running automatically
✅ Database persisting correctly
✅ Partners can access without issues
✅ No critical errors in logs
✅ Bookings complete successfully
✅ Data syncs from Supabase correctly

---

## Notes

*Use this space for deployment-specific notes, issues encountered, or lessons learned:*

```
Date: ___________
Deployed to: ___________
Issues encountered:
- 
- 
- 

Resolutions:
- 
- 
- 

Additional notes:
- 
- 
- 
```

---

**Ready to deploy? Start from the top and work your way down! 🚀**

