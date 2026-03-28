---
phase: 03-code-review-diff-editing
plan: 02
subsystem: api
tags: [httpx, anthropic, github-api, gitlab-api, code-review, abc, factory-pattern]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "config.py settings (llm_api_key, llm_api_url, llm_model)"
  - phase: 02-repository-management-work-feed
    provides: "feed_service.py Anthropic API pattern (httpx + headers)"
provides:
  - "ReviewProvider ABC with 7 abstract methods for MR/PR operations"
  - "GitHubReviewProvider for atomic PR reviews via GitHub REST API"
  - "GitLabReviewProvider for discussion-based MR reviews via GitLab API v4"
  - "get_review_provider factory function routing by source_type"
  - "review_diff() for AI-powered diff annotation via Anthropic API"
  - "chat_about_review() for contextual review conversation"
affects: [03-code-review-diff-editing, 04-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns: [ReviewProvider ABC with factory pattern, GitLab position-based inline comments, GitHub atomic review POST]

key-files:
  created:
    - backend/app/services/review_service.py
    - backend/app/services/github_review.py
    - backend/app/services/gitlab_review.py
    - backend/app/services/ai_review_service.py
  modified: []

key-decisions:
  - "Providers receive pre-decrypted tokens; credential lookup deferred to API layer (Plan 05)"
  - "GitHub uses line+side API (not deprecated position field) for review comments"
  - "GitLab post_review loops individual discussions then handles event separately"
  - "AI review uses system prompt for structured JSON output, 120s timeout for large diffs"

patterns-established:
  - "ReviewProvider ABC: abstract interface for git provider review operations"
  - "Factory pattern: get_review_provider() routes by source_type string"
  - "GitLab position object: base_sha/head_sha/start_sha/position_type for inline comments"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 03 Plan 02: Review Service Abstraction Summary

**ReviewProvider ABC with GitHub atomic reviews, GitLab discussion threads, and Claude-powered diff annotation service**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T11:17:58Z
- **Completed:** 2026-03-28T11:21:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ReviewProvider ABC with 7 abstract methods normalizing GitHub/GitLab review differences
- GitHubReviewProvider using atomic review POST (all comments + event in one request)
- GitLabReviewProvider creating individual discussion threads with position objects, separate approve/unapprove
- AI review service sending diffs to Claude for structured annotations with chat support

## Task Commits

Each task was committed atomically:

1. **Task 1: Review provider abstraction + GitHub/GitLab implementations** - `632abd1` (feat)
2. **Task 2: AI review service** - `ae600b9` (feat)

## Files Created/Modified
- `backend/app/services/review_service.py` - ReviewProvider ABC and get_review_provider factory
- `backend/app/services/github_review.py` - GitHubReviewProvider with atomic review support
- `backend/app/services/gitlab_review.py` - GitLabReviewProvider with discussion-based reviews
- `backend/app/services/ai_review_service.py` - review_diff() and chat_about_review() using Anthropic API

## Decisions Made
- Providers receive pre-decrypted tokens; the API layer (Plan 05) handles credential lookup and decryption
- GitHub comments use the newer line+side API instead of the deprecated position field
- GitLab post_review creates individual discussion threads in a loop, then handles approve/request_changes event separately
- AI review service uses 120s timeout (vs 10s in feed_service) because large diff reviews can be slow
- review_diff returns empty list on parse failures (graceful degradation with logged warning)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions are fully implemented against live APIs. Actual API calls require valid tokens but code paths are complete.

## Next Phase Readiness
- Review provider layer ready for API endpoints (Plan 05)
- AI review service ready for frontend integration
- Factory pattern supports adding new providers (e.g., Bitbucket) in the future

## Self-Check: PASSED

All 4 created files verified present. Both task commits (632abd1, ae600b9) verified in git log.

---
*Phase: 03-code-review-diff-editing*
*Completed: 2026-03-28*
