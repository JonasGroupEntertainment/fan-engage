# Launch Readiness Phase 2 Specification

## Scope

- Resolve the five existing frontend lint errors without changing user-visible behavior.
- Run lint and the production build in the existing GitHub Actions frontend gate while preserving its current required-check name.
- Update locked transitive dependencies to patched versions without force-upgrading direct dependencies.
- Protect `main` after the readiness pull request lands, requiring pull requests and the established automated checks while avoiding a mandatory human approval that could lock out a solo maintainer.
- Perform non-destructive production smoke tests for public pages, guest auth boundaries, CAPTCHA rejection, and the Stripe entry point.
- Leave legal policy copy unchanged until the owner supplies counsel-approved information.

## Acceptance Criteria

- `npm run lint` exits successfully.
- `npm run test:types`, `npm test`, and `npm run build` exit successfully.
- `npm audit` reports zero known vulnerabilities.
- The pull request checks and Vercel deployment succeed before merge.
- GitHub reports `main` as protected with required pull requests and status checks.
- Production smoke tests do not create accounts, subscriptions, charges, or other persistent customer records.

