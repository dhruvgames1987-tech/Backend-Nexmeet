# NexMeet Backend - Server Deployment Guide

## Prerequisites on Your Server

1. **Install Docker and Docker Compose:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   
   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   
   # Verify installations
   docker --version
   docker-compose --version
   ```

2. **Add your user to docker group (optional, to run without sudo):**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

## Deployment Steps

### Step 1: Upload Your Backend to Server

```bash
# On your server, create a directory for the app
mkdir -p ~/nexmeet/backend
cd ~/nexmeet/backend

# Option A: If using Git
git clone YOUR_REPO_URL .

# Option B: If uploading files manually (from your local machine)
# Use SCP to upload the backend folder
scp -r /Users/nishantsolanki/Google\ Voice\ Antigravity/backend/* user@your-server-ip:~/nexmeet/backend/
```

### Step 2: Build and Start the Application

```bash
# Navigate to backend directory
cd ~/nexmeet/backend

# Build and start the Docker container
docker-compose up -d --build

# The -d flag runs it in detached mode (background)
# The --build flag rebuilds the image with latest code
```

### Step 3: Verify the Deployment

```bash
# Check if container is running
docker-compose ps

# View logs
docker-compose logs -f backend

# Test the health endpoint
curl http://localhost:4000/health

# Test from external machine
curl http://YOUR_SERVER_IP:4000/health
```

## Important: Firewall Configuration

### Allow Port 4000 Through Firewall

```bash
# If using UFW (Ubuntu/Debian)
sudo ufw allow 4000/tcp
sudo ufw status

# If using firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload

# Verify port is listening
sudo netstat -tulpn | grep 4000
# OR
sudo lsof -i :4000
```

## Useful Docker Commands

```bash
# View running containers
docker-compose ps

# View logs (live)
docker-compose logs -f

# View logs (last 100 lines)
docker-compose logs --tail=100 backend

# Restart the service
docker-compose restart

# Stop the service
docker-compose down

# Rebuild and restart after code changes
docker-compose up -d --build

# Execute commands inside the container
docker-compose exec backend sh

# View resource usage
docker stats
```

## Production Recommendations

### 1. Use Environment File (More Secure)

Instead of putting credentials in docker-compose.yml, create a `.env` file:

```bash
# Create .env file
nano .env
```

Add this content:
```
PORT=4000
SUPABASE_URL=https://wcrkufjrqpqxicswfdmp.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjcmt1ZmpycXBxeGljc3dmZG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzE2NjMsImV4cCI6MjA3OTMwNzY2M30.escxedCBUTSI-ZGXmW3mkokPL_rVQh8KAgUs02p6PRg
LIVEKIT_URL=wss://meet.dhruvmusic.co.in
LIVEKIT_API_KEY=API4LbQuKxrMYqb
LIVEKIT_API_SECRET=zNdCm0ytVSeZ1tZOG5xbQ7GdKV3SnnEnz49zCROkopE
NODE_ENV=production
```

Then modify docker-compose.yml to use:
```yaml
services:
  backend:
    env_file: .env
```

### 2. Set Up Nginx Reverse Proxy (Recommended)

**Benefits:**
- SSL/TLS support (HTTPS)
- Better security
- Can serve multiple apps on same server
- Standard ports (80/443)

```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/nexmeet
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/nexmeet /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable Nginx on boot
sudo systemctl enable nginx
```

### 3. Enable SSL with Let's Encrypt (Free HTTPS)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
# Test renewal
sudo certbot renew --dry-run
```

### 4. Enable Auto-restart on Server Reboot

Docker containers with `restart: always` in docker-compose.yml will automatically restart when the server reboots.

Enable Docker service:
```bash
sudo systemctl enable docker
```

## Monitoring and Maintenance

### View Application Status
```bash
# Check if backend is healthy
curl http://localhost:4000/health

# View real-time logs
docker-compose logs -f backend

# Check container resource usage
docker stats nexmeet-backend
```

### Update Application
```bash
# Pull latest code (if using Git)
git pull

# Rebuild and restart
docker-compose up -d --build

# View logs to ensure successful restart
docker-compose logs -f backend
```

### Backup Strategy
```bash
# Backup configuration files
tar -czf nexmeet-backup-$(date +%Y%m%d).tar.gz ~/nexmeet/backend
```

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker-compose logs backend

# Remove container and rebuild
docker-compose down
docker-compose up -d --build
```

### Port already in use
```bash
# Find what's using port 4000
sudo lsof -i :4000

# Kill the process if needed
sudo kill -9 PID_NUMBER
```

### Cannot connect from external machine
```bash
# Check firewall
sudo ufw status

# Check if service is listening on all interfaces
netstat -tulpn | grep 4000
```

## Security Best Practices

1. **Never commit `.env` file to Git** - Use `.env.template` instead
2. **Use strong firewall rules** - Only open necessary ports
3. **Keep Docker updated** - Run `sudo apt update && sudo apt upgrade` regularly
4. **Monitor logs** - Check for suspicious activity
5. **Use HTTPS** - Always use SSL in production (via Nginx + Let's Encrypt)
6. **Rotate credentials** - Periodically update API keys and secrets

## Quick Reference

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start in background |
| `docker-compose down` | Stop and remove containers |
| `docker-compose restart` | Restart services |
| `docker-compose logs -f` | View live logs |
| `docker-compose ps` | List running services |
| `docker-compose exec backend sh` | Access container shell |

## Port Information

- **Backend API**: Port `4000`
- **If using Nginx**: Port `80` (HTTP) and `443` (HTTPS)

Your mobile app and admin panel should connect to:
- **Without Nginx**: `http://YOUR_SERVER_IP:4000`
- **With Nginx**: `http://YOUR_DOMAIN` or `https://YOUR_DOMAIN`
