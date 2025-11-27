# This script will install dependencies, run tests, and start the application.

# Install dependencies
Write-Host "Installing dependencies..."
npm install

# Run tests
Write-Host "Running tests..."
npm test -- --watchAll=false

# Start the application
Write-Host "Starting the application..."
npm start
