# Andy's Daily Factoids

Fun project to get a random factoid every day: https://andys-daily-factoids.com/

## Features

- Get a random factoid every ~~day~~ hour.
- Vote 🤯 or 😒 for factoids.
- Shuffle to see more.
- Button to google those truly mind blowing factoids you must research right now.
- Copy button to copy text and share the joy with someone.
- **NEW**: Generate factoids using multiple AI models (OpenAI, Anthropic, Google, Meta, Mistral)
- **NEW**: Random model selection for variety in factoid generation
- **NEW**: Manual model and parameter selection for custom generation
- **NEW**: View generation metadata (model, parameters, cost) for each factoid
- **NEW**: Pay-per-factoid generation with Stripe integration

### Coming Soon

1. Daily email subscription.
2. Dark mode.
3. Model performance analytics.

## How it works

- Netlify for hosting.
- Netlify Functions for the backend.
- GitHub Actions for scheduling the daily factoid.
- React for the frontend.
- Firebase for the database.
- OpenRouter API for multi-model AI access.
- Stripe for payment processing.

## Environment Variables

### Backend (Netlify Functions)
- `OPENROUTER_API_KEY` - Your OpenRouter API key for accessing multiple AI models
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `FUNCTIONS_API_KEY` - API key for securing function endpoints
- `STRIPE_SECRET_KEY` - Stripe secret key for payment processing

### Frontend
- `REACT_APP_API_BASE_URL` - Base URL for API calls (defaults to production URL)
- `REACT_APP_FUNCTIONS_API_KEY` - API key for frontend requests
- `REACT_APP_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for payments

![Screenshot](./frontend/public/home-screenshot.png)
