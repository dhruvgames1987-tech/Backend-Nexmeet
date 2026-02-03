#!/bin/bash

# Deploy Backend Changes to Production Server
# This script commits changes and redeploys the backend

set -e  # Exit on error

echo "🚀 NexMeet Backend Deployment Script"
echo "====================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Navigate to backend directory
cd "$(dirname "$0")"

echo -e "${BLUE}📂 Current directory: $(pwd)${NC}"
echo ""

# Check git status
echo -e "${BLUE}📋 Checking git status...${NC}"
git status
echo ""

# Commit changes
echo -e "${YELLOW}💾 Committing changes...${NC}"
git add src/index.ts RATE_LIMITING_FIX.md
git commit -m "Fix: Rate limiting per username instead of per IP

- Changed from per-IP to per-username rate limiting
- Increased max attempts from 5 to 10
- Only count failed login attempts (skipSuccessfulRequests: true)
- Prevents one user from locking out all users at same IP
- Added documentation in RATE_LIMITING_FIX.md
"

echo ""
echo -e "${GREEN}✅ Changes committed${NC}"
echo ""

# Push to git
echo -e "${YELLOW}📤 Pushing to git repository...${NC}"
git push origin main

echo ""
echo -e "${GREEN}✅ Changes pushed to git${NC}"
echo ""

# Instructions for server deployment
echo -e "${YELLOW}📖 Next Steps - Deploy on Server:${NC}"
echo ""
echo "1️⃣ SSH into your server:"
echo "   ssh user@103.174.102.177"
echo ""
echo "2️⃣ Navigate to backend directory:"
echo "   cd /path/to/backend"
echo ""
echo "3️⃣ Pull latest changes:"
echo "   git pull origin main"
echo ""
echo "4️⃣ Rebuild and restart Docker:"
echo "   docker-compose down"
echo "   docker-compose up -d --build"
echo ""
echo "5️⃣ Check logs:"
echo "   docker-compose logs -f backend"
echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}✅ Local deployment complete!${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${BLUE}After deploying on server, you can test with:${NC}"
echo "   curl https://api.dhruvmusic.co.in/health"
echo ""
