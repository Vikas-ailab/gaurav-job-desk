# Gaurav Job Desk

Mobile-first personal job discovery and application workspace for Gaurav Rathore.

## Features in this build
- Candidate profile and preliminary role-fit scoring.
- Public feed collector for Greenhouse, Lever, Arbeitnow and Remotive.
- Location filter: Bengaluru office/hybrid/remote; outside Bengaluru remote India or worldwide only.
- 30-day freshness filter, duplicate suppression, source link, matched skills and missing must-have flags.
- GitHub Actions feed refresh schedule every 15 minutes. Remotive is deliberately cached for at least six hours because its public API advises no more than four requests per day.
- Role-specific CV draft generator that reorders supplied skills and uses only profile facts; review before export.
- Optional Supabase email authentication and private workspace sync with row-level security.
- Application approval only. This app never submits an application, sends a recruiter message or uploads a CV.

## Job feed setup
1. Review `job-sources.json`. The Brillio Lever board slug is preconfigured from a live Brillio careers posting; add only other employer board slugs confirmed from official careers URLs.
2. In GitHub, open Actions and enable workflows if disabled.
3. Run **Refresh job feeds** manually once. The schedule then runs every 15 minutes (GitHub scheduling is best-effort and can be delayed).
4. The collector publishes `jobs.json` at repository root. Listings are source-API checked when collected; always open the original posting to confirm that applications remain open.

## Cloud sync setup
1. Create a Supabase project.
2. Copy the project URL and anon/publishable key into `supabase-config.js`.
3. Run `supabase/schema.sql` in Supabase SQL Editor.
4. Enable email authentication and configure the deployed site's redirect URL.
5. Use **Cloud sync** in the app to create an account or sign in.

Never place a Supabase service-role key or database password in the browser. Row-level security restricts each account to its own workspace.

## Deploy
This repository includes a GitHub Pages workflow. In repository Settings -> Pages, select **GitHub Actions** as the build/deployment source. The next push or workflow completion deploys the app to:
`https://vikas-ailab.github.io/gaurav-job-desk/`

## Limitations and safeguards
- Feed coverage depends on the employer ATS board IDs configured in `job-sources.json`; no public API indexes every employer.
- Some sources do not expose a definitive application closing state. The app labels API-returned posts as source-checked, not guaranteed open.
- Remotive's public API is delayed and is polled at most four times daily in line with its published guidance; it is attributed and links to the original Remotive listing.
- CV tailoring is a draft, not a claim of new qualifications. Review every generated line.
- No automatic applications, candidate profile submissions, CV uploads, recruiter outreach or messages.
- Local browser storage remains a fallback if cloud sync is not configured.
