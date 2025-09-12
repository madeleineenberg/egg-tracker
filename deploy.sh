#!/bin/bash

echo "📦 Building the project..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed. Aborting deployment."
  exit 1
fi

echo "🔄 Deploying to Firebase..."
if command -v firebase &> /dev/null; then
  echo "🔄 Deploying Firestore rules first..."
  firebase deploy --only firestore:rules
  
  echo "🔄 Deploying the rest of the application..."
  firebase deploy --except firestore:rules
else
  echo "⚠️ Firebase CLI not found. Installing..."
  npm install -g firebase-tools
  
  echo "🔑 Logging in to Firebase..."
  firebase login
  
  echo "🔄 Deploying Firestore rules first..."
  firebase deploy --only firestore:rules
  
  echo "🔄 Deploying the rest of the application..."
  firebase deploy --except firestore:rules
  firebase deploy
fi

if [ $? -eq 0 ]; then
  echo "✅ Deployment completed successfully!"
else
  echo "❌ Deployment failed."
  exit 1
fi

echo "🎉 Your app is now live!"
