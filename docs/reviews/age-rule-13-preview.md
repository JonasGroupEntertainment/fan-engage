# Age rule preview

Not applied. Signup behavior is in code. These sentences are what privacy, terms, and help say after the rewrite. `policy_pages` still wins until `docs/reviews/age-rule-13.sql` is run. Rollback: `docs/reviews/age-rule-13-rollback.sql`.

## Account rule

Fans must be 13 or older. No one under 13 may create an account. Fans ages 13 to 17 may join only with a parent or guardian's OK.

Paid memberships and text alerts stay 18 and older. That is existing product code, not this age rule.

## How parent OK is captured

A checkbox on `/signup`, only when the date of birth is 13–17: "A parent or guardian says I can create this account."

The tick is sent as signup metadata `parent_consent=true`. Migration `0098_parent_consent.sql` stores `fans.parent_consent_at` and refuses the account without the tick. There is no parent email and no verification.

## Entity

`FEP, Inc.` and `FEP Inc.` become `Fan Engage Pro LLC` on privacy and terms when those strings are present. They were not found in the repo.

## Brand accounts

`/for-artists/apply` does not ask for age. FEP has no 18+ brand-account rule. That rule is Brand Engage Pro only.
