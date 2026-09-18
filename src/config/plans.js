// Plan definitions. The spec is explicit that limits and pricing must not
// be hardcoded throughout the app — everything reads from here, and this
// file is the single thing that moves to a `plans` database table when
// billing lands in Phase 7.
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    aiRequestsPerMonth: 100,
    maxDocumentSizeMb: 50,
    maxDocuments: 20,
    features: {
      ocr: false,
      advancedContext: false
    }
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    aiRequestsPerMonth: 2000,
    maxDocumentSizeMb: 200,
    maxDocuments: Infinity,
    features: {
      ocr: true,
      advancedContext: true
    }
  }
}

// Until authentication exists (Phase 7), everyone is on the free plan and
// the plan is resolved locally. After Phase 7 this reads from the server —
// never from client state, per the spec's "never trust isPremium from the
// frontend" rule.
export function getCurrentPlan() {
  return PLANS.free
}
