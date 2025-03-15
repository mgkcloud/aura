#!/bin/bash

# Script to deploy the Ultravox model to Replicate

echo "Deploying Ultravox model to Replicate..."

# Check if cog is installed
if ! command -v cog &> /dev/null; then
    echo "Error: cog is not installed. Installing now..."
    pip install cog
fi

# Check if the ultravox-backend directory exists
if [ ! -d "ultravox-backend" ]; then
    echo "Error: ultravox-backend directory not found."
    exit 1
fi

# Prompt for Replicate username
read -p "Enter your Replicate username: " REPLICATE_USERNAME

# Login to Replicate
echo "Logging in to Replicate..."
cog login

# Navigate to the ultravox-backend directory
cd ultravox-backend

# Push the model to Replicate
echo "Pushing model to Replicate..."
cog push r8.im/$REPLICATE_USERNAME/ultravox-shopify

# Get and store the model version
echo "Please copy the Model Version ID from above and add it to your .env file as ULTRAVOX_MODEL_VERSION"
echo "Also make sure your Replicate API token is set as REPLICATE_API_TOKEN in your .env file"

echo "Deployment complete!"