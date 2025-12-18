# HIT BY HUMA POS - Deployment Guide

This guide will help you deploy the POS system so your client can access it online.

## 🏗️ Architecture Overview

| Component | Deployment Platform | Purpose |
|-----------|---------------------|---------|
| Frontend (React) | **Vercel** | User Interface |
| Backend (Express) | **Railway** | API Server |
| Database | **Railway PostgreSQL** | Data Storage |

---

## 📋 Prerequisites

1. **GitHub Account** - Push your code to GitHub first
2. **Vercel Account** - Free at [vercel.com](https://vercel.com)
3. **Railway Account** - Free at [railway.app](https://railway.app)

---

## 🗄️ Step 1: Database Setup (Railway PostgreSQL)

Railway provides a free PostgreSQL database that's perfect for this app.

### 1.1 Create PostgreSQL on Railway
1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Provision PostgreSQL"**
3. Click on the PostgreSQL service
4. Go to **"Variables"** tab - you'll see `DATABASE_URL` automatically created
5. Go to **"Data"** tab to access the database console

### 1.2 Run Schema
1. In Railway PostgreSQL, go to **"Data"** → **"Query"**
2. Copy the contents of `server/src/database/schema.postgres.sql`
3. Paste and run to create all tables

---

## 🖥️ Step 2: Deploy Backend to Railway

### 2.1 Push Code to GitHub
```bash
cd server
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pos-server.git
git push -u origin main
```

### 2.2 Deploy on Railway
1. In the same Railway project, click **"New"** → **"GitHub Repo"**
2. Select your `pos-server` repository
3. Railway will auto-detect Node.js and deploy

### 2.3 Link Database
1. Click on your backend service
2. Go to **"Variables"**
3. Click **"Add Reference"** → Select the PostgreSQL service
4. This automatically adds `DATABASE_URL`

### 2.4 Add Environment Variables
In Railway dashboard, go to **Variables** and add:

```
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-app.vercel.app

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# API
API_PREFIX=/api/v1
```

> **Note**: `DATABASE_URL` is automatically added when you link the PostgreSQL service!

### 2.5 Get Your Backend URL
After deployment, Railway will give you a URL like:
`https://pos-server-production.up.railway.app`

**Save this URL - you'll need it for the frontend!**

---

## 🌐 Step 3: Deploy Frontend to Vercel

### 3.1 Push Client to GitHub
```bash
cd client
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pos-client.git
git push -u origin main
```

### 3.2 Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New"** → **"Project"**
3. Import your `pos-client` repository
4. Vercel will auto-detect Vite

### 3.3 Configure Environment Variables
In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```
VITE_API_URL=https://pos-server-production.up.railway.app
VITE_SOCKET_URL=https://pos-server-production.up.railway.app
```

*(Replace with your actual Railway backend URL)*

### 3.4 Redeploy
After adding environment variables, trigger a new deployment:
- Go to **Deployments** → Click the **...** menu → **Redeploy**

---

## 4️⃣ Step 4: Update CORS Settings

After deploying the frontend, update the backend's `CLIENT_URL` environment variable in Railway:

```
CLIENT_URL=https://your-app.vercel.app
```

---

## ✅ Step 5: Verify Deployment

1. **Test Backend Health**
   ```
   curl https://your-backend.up.railway.app/health
   ```
   Should return: `{"status":"healthy","database":"connected"}`

2. **Test Frontend**
   - Visit your Vercel URL
   - Try logging in with your credentials

---

## 🔧 Troubleshooting

### CORS Errors
- Make sure `CLIENT_URL` in Railway matches your Vercel URL exactly
- Check for trailing slashes (don't include them)

### Database Connection Failed
- Check Railway PostgreSQL logs for errors
- Ensure `DATABASE_URL` is properly linked to your backend service
- Verify the schema was run successfully

### Socket.IO Not Connecting
- Verify `VITE_SOCKET_URL` is set correctly
- Check Railway logs for connection errors

### Build Failed on Vercel
- Check that all dependencies are in `package.json`
- Review build logs for specific errors

---

## 💰 Cost Overview

| Service | Free Tier |
|---------|-----------|
| Vercel | 100GB bandwidth/month |
| Railway | $5 credit/month (enough for small apps) |
| Railway PostgreSQL | Included in Railway credits |

---

## 📱 Share With Client

Once deployed, share these URLs with your client:

- **App URL**: `https://your-app.vercel.app`
- **Login Credentials**: (whatever you set up)

---

## 🔄 Updating the App

When you make changes:

1. **Frontend**: Push to GitHub → Vercel auto-deploys
2. **Backend**: Push to GitHub → Railway auto-deploys

```bash
git add .
git commit -m "Your changes"
git push
```

---

## 📞 Need Help?

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Azure SQL Docs](https://docs.microsoft.com/azure/azure-sql)
