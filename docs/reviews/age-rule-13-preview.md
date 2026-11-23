# Age rule preview

Not applied. Signup behavior is in code. These sentences are what privacy, terms, and help say after the rewrite. `policy_pages` still says 18+ until `docs/reviews/age-rule-13.sql` is run by hand. Rollback: `docs/reviews/age-rule-13-rollback.sql`. Do not run either file from the pull request.

Wording follows Brand Engage Pro's approved age rule (`docs/reviews/age-rule-preview.md` and `docs/reviews/age-rule-policy-copy.sql` on `KevinJonasSr/brand-engage-pro`), with fans in place of members.

## Account rule

Fans must be 13 or older. A fan who is 13, 14, 15, 16, or 17 may join only with a parent or guardian's permission. No one under 13 may use Fan Engage Pro or give us information.

You meet the age rule in AGE REQUIREMENT. If you are 13 to 17, a parent or guardian has said you may join.

Paid memberships and text alerts stay 18 and older. That is existing product code. Brand Engage Pro lets ages 13 to 17 opt into texts with a second parent tick. Fan Engage does not.

## How parent permission is captured

A checkbox on `/signup`, shown for every new account, directly under the date of birth: "I am 13 to 17 and a parent or guardian says I can join."

The tick is required only when the date of birth is 13 to 17. It is sent as signup metadata `parent_consent=true`. Migration `0098_parent_consent.sql` is already applied: it stores `fans.parent_consent_at` and the signup trigger refuses the account without the tick. There is no parent email and no verification. Brand Engage Pro stores the same tick as `members.guardian_consent_at`.

## Left on purpose

Brand Engage Pro also says brand accounts are 18 or older and requires that attestation on the brand application. Fan Engage's artist application does not ask for age. That sentence is not copied into the fan terms.

Text enrollment in the stored terms still says a person under 18 may not enroll. The rewrite does not change that sentence.
