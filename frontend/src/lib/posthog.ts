import { posthog } from 'posthog-js'

export const initPostHog = () => {
  if (typeof window !== 'undefined') {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
    
    if (apiKey) {
      posthog.init(apiKey, {
        api_host: apiHost,
        person_profiles: 'identified_only',
        capture_pageview: false, // Disable automatic pageview capture, as we capture manually
        capture_pageleave: true, // Enable pageleave capture
      })
    }
  }
}

export { posthog }