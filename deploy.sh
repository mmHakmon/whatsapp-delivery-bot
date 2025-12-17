#!/bin/bash

# M.M.H Delivery - Auto Deploy Script for Render
# This script helps deploy Phase 1 & 2 to your existing Render project

set -e  # Exit on error

echo "🚀 M.M.H Delivery - Auto Deploy to Render"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    print_error "server.js not found. Please run this script from your project root."
    exit 1
fi

print_info "Found server.js. Continuing..."
echo ""

# Step 1: Backup
echo "📦 Step 1: Creating backup..."
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp server.js "$BACKUP_DIR/" 2>/dev/null || true
cp package.json "$BACKUP_DIR/" 2>/dev/null || true
print_success "Backup created at: $BACKUP_DIR"
echo ""

# Step 2: Copy new files
echo "📁 Step 2: Copying new files..."

# Check if files exist in outputs folder
if [ ! -f "migrate-phase1-2.js" ]; then
    print_warning "migrate-phase1-2.js not found. Please copy from outputs folder."
    read -p "Press Enter after you copy the file..."
fi

if [ ! -f "push-notification-service.js" ]; then
    print_warning "push-notification-service.js not found. Please copy from outputs folder."
    read -p "Press Enter after you copy the file..."
fi

# Create public directory if it doesn't exist
mkdir -p public

# Check HTML files
if [ ! -f "public/courier-dashboard.html" ]; then
    print_warning "courier-dashboard.html not found in public/. Please copy from outputs folder."
    read -p "Press Enter after you copy the file..."
fi

if [ ! -f "public/customer-dashboard.html" ]; then
    print_warning "customer-dashboard.html not found in public/. Please copy from outputs folder."
    read -p "Press Enter after you copy the file..."
fi

print_success "Files checked"
echo ""

# Step 3: Update package.json
echo "📝 Step 3: Updating package.json..."

# Check if migrate script exists
if ! grep -q '"migrate"' package.json; then
    print_info "Adding migrate scripts to package.json..."
    
    # Backup package.json
    cp package.json package.json.bak
    
    # Add scripts (this is a simplified version, manual editing might be needed)
    print_warning "Please add these scripts to your package.json manually:"
    echo '  "migrate": "node migrate-phase1-2.js",'
    echo '  "migrate:full": "node init-db.js && node migrate-phase1-2.js"'
    echo ""
    read -p "Press Enter after you've added the scripts..."
else
    print_success "Migrate scripts already exist"
fi
echo ""

# Step 4: Create/Update .gitignore
echo "🚫 Step 4: Updating .gitignore..."
if [ ! -f ".gitignore" ]; then
    cat > .gitignore << 'EOF'
node_modules/
.env
.DS_Store
logs/
*.log
.vscode/
.idea/
backup_*/
EOF
    print_success ".gitignore created"
else
    # Add to existing .gitignore if needed
    if ! grep -q "backup_" .gitignore; then
        echo "backup_*/" >> .gitignore
        print_success "Updated .gitignore"
    else
        print_success ".gitignore already up to date"
    fi
fi
echo ""

# Step 5: Git operations
echo "📤 Step 5: Git operations..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    print_info "Initializing git repository..."
    git init
    print_success "Git initialized"
fi

# Check if remote exists
if ! git remote | grep -q origin; then
    print_warning "No git remote 'origin' found."
    echo "Please enter your GitHub repository URL (e.g., https://github.com/username/repo.git):"
    read REPO_URL
    git remote add origin "$REPO_URL"
    print_success "Remote added"
fi

# Add files
print_info "Adding files to git..."
git add migrate-phase1-2.js push-notification-service.js
git add public/courier-dashboard.html public/customer-dashboard.html 2>/dev/null || true
git add .gitignore package.json

# Check for changes
if git diff --staged --quiet; then
    print_warning "No changes to commit"
else
    print_info "Committing changes..."
    git commit -m "Add Phase 1 & 2: Courier & Customer Dashboards

- Added courier dashboard with real-time tracking
- Added customer dashboard with live order tracking
- Added push notification service
- Added 10 new database tables
- Added 15+ new API endpoints"
    
    print_success "Changes committed"
fi
echo ""

# Step 6: Push to GitHub
echo "🚀 Step 6: Pushing to GitHub..."
print_info "Current branch: $(git branch --show-current)"
echo ""
print_warning "Before pushing, make sure:"
echo "  1. You've updated server.js with new routes"
echo "  2. All sensitive data is in .env (not committed)"
echo "  3. Your Render service is connected to this repo"
echo ""
read -p "Ready to push? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BRANCH=$(git branch --show-current)
    git push origin "$BRANCH" || {
        print_error "Push failed. You may need to pull first or resolve conflicts."
        exit 1
    }
    print_success "Pushed to GitHub!"
else
    print_warning "Skipped push. Don't forget to push manually!"
fi
echo ""

# Step 7: Instructions for Render
echo "🎯 Step 7: Next steps in Render..."
echo ""
print_info "Now go to your Render dashboard and:"
echo ""
echo "1. 📊 Check deployment logs:"
echo "   https://dashboard.render.com/web/YOUR_SERVICE"
echo ""
echo "2. 🗄️  Run migration in Shell:"
echo "   Click 'Shell' and run:"
echo "   $ node migrate-phase1-2.js"
echo ""
echo "3. ⚙️  Verify environment variables are set:"
echo "   - DATABASE_URL"
echo "   - JWT_SECRET"
echo "   - WHAPI_TOKEN"
echo "   - GOOGLE_MAPS_KEY (optional)"
echo ""
echo "4. 🌐 Test the dashboards:"
echo "   Courier: https://YOUR_APP.onrender.com/courier/login"
echo "   Customer: https://YOUR_APP.onrender.com/customer/dashboard"
echo ""

# Step 8: Post-deployment checklist
echo "✅ Post-Deployment Checklist:"
echo ""
echo "After deployment completes, verify:"
echo "  [ ] Service shows 'Live' status in Render"
echo "  [ ] No errors in deployment logs"
echo "  [ ] Migration ran successfully (10 new tables)"
echo "  [ ] Courier dashboard loads"
echo "  [ ] Customer dashboard loads"
echo "  [ ] API endpoints respond"
echo "  [ ] WebSocket connects"
echo ""

# Summary
echo "========================================"
echo "🎉 Deployment preparation complete!"
echo "========================================"
echo ""
print_success "Files are ready and pushed to GitHub"
print_info "Render will auto-deploy from your GitHub push"
print_warning "Remember to run migration in Render Shell!"
echo ""
echo "📚 For detailed instructions, see:"
echo "   - RENDER-DEPLOYMENT.md"
echo "   - INSTALLATION-GUIDE.md"
echo ""
echo "💬 Need help? Check the deployment guide for troubleshooting."
echo ""

# Offer to open browser
read -p "Open Render dashboard in browser? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v xdg-open > /dev/null; then
        xdg-open "https://dashboard.render.com"
    elif command -v open > /dev/null; then
        open "https://dashboard.render.com"
    else
        print_info "Please open: https://dashboard.render.com"
    fi
fi

echo ""
print_success "Good luck! 🚀"
