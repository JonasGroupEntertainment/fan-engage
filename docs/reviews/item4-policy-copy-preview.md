# Item 4 policy copy preview

Not applied. The public pages read `policy_pages` and then `applyItem4PolicyCopy`. This is the wording that rewrite uses. Privacy is unchanged.

## Premium billing

Premium includes an eligible seven-day free trial, then monthly or yearly billing.

Removed when present:

- `Billing cycles are set on a monthly basis`
- `We will begin billing your payment method for the Services on the day that you sign up for such Services, regardless of whether you have fully completed your account as of that date.`
- `Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.`

## Store credit

[CONFIRM WITH RAYMOND]

Premium includes a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens.

`monthly_credit_cents` is set to 500. No code spends that balance. `/marketplace` stays behind `NEXT_PUBLIC_MARKETPLACE_LIVE`. The sentence does not say the credit can be spent today.

Replaces `a $5.00 monthly credit applied to the User's account each billing cycle, redeemable toward marketplace items within that Artist's community.`

## Entity

`a North Carolina limited liability company` becomes `a Colorado limited liability company` on terms, rewards terms, and cancellation only.

Rewards terms keep `laws of the State of North Carolina` if that sentence is stored. This preview does not change governing law.

## Rewards placeholders

| Stored token | Replacement | Route file |
| --- | --- | --- |
| Terms of Use `[here, provide link]` | `[Terms of Use](/terms)` | `frontend/app/terms/page.tsx` |
| Premium `[link]` and `[/cancellation-refund]` | `[Premium](/premium)` and `[cancellation and refund policy](/cancellation-refund)` | `frontend/app/premium/page.tsx`, `frontend/app/cancellation-refund/page.tsx` |
| `Privacy Policy [link]` | `[Privacy Policy](/privacy)` | `frontend/app/privacy/page.tsx` |
| Rules for Use `[link]` | `(no public page is published)` | No `frontend/app/rules/page.tsx` |
| `example.com`, `{{...}}`, `](#)` | `(no public page is published)` | No invented URL |

Help states the same trial, credit, and Colorado entity in `frontend/app/help/page.tsx`.
