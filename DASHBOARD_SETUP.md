# HTN252 Multi-Dashboard Setup

This project now has three separate Next.js dashboards, each running on different ports and targeting different user types.

## Architecture

- **Backend API**: Flask app (`src/app.py`) - `http://localhost:8000`
- **NGO Dashboard**: Next.js app (`src/NGO-dashboard/`) - `http://localhost:3000`
- **Donor Dashboard**: Next.js app (`src/donor-dashboard/`) - `http://localhost:3001`
- **Store Dashboard**: Next.js app (`src/store-dashboard/`) - `http://localhost:3002`

## Running the Applications

### Backend API
```bash
cd /Users/joshz/repos/HTN252
python src/app.py
```

### NGO Dashboard
```bash
cd /Users/joshz/repos/HTN252/src/NGO-dashboard
npm run dev
# Runs on http://localhost:3000
```

### Donor Dashboard
```bash
cd /Users/joshz/repos/HTN252/src/donor-dashboard
npm run dev
# Runs on http://localhost:3001
```

### Store Dashboard
```bash
cd /Users/joshz/repos/HTN252/src/store-dashboard
npm run dev
# Runs on http://localhost:3002
```

## Running All Dashboards Simultaneously

You can run all dashboards at once using separate terminal windows/tabs, or use a process manager like `concurrently`:

```bash
# Install concurrently globally (one time setup)
npm install -g concurrently

# Run all dashboards from project root
concurrently \
  "cd src/NGO-dashboard && npm run dev" \
  "cd src/donor-dashboard && npm run dev" \
  "cd src/store-dashboard && npm run dev" \
  "python src/app.py"
```

## Development Notes

- Each dashboard is a completely self-contained Next.js application
- All dashboards share the same backend API endpoints
- Port configuration is set in each dashboard's `package.json`
- Each dashboard can have its own unique UI, components, and functionality
- Node modules are separate for each dashboard (allows for different dependency versions if needed)

## Next Steps

1. Customize each dashboard for its specific user type
2. Create unique components and pages for each dashboard
3. Implement role-based authentication
4. Configure API endpoints for each dashboard type
