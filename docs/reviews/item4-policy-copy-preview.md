# Item 4 policy copy preview

Not applied. The public pages read `policy_pages` and then `applyItem4PolicyCopy`. Privacy is unchanged. This file does not change `monthly_credit_cents`.

## Premium billing

Premium includes an eligible seven-day free trial, then monthly or yearly billing.

Removed when present:

- `Billing cycles are set on a monthly basis`
- `We will begin billing your payment method for the Services on the day that you sign up for such Services, regardless of whether you have fully completed your account as of that date.`
- `Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.`

## Store credit

Removed from help, terms, rewards terms, and cancellation. No replacement sentence.

Also removed when stored:

- `Premium includes a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens.`
- `a $5.00 monthly credit applied to the User's account each billing cycle, redeemable toward marketplace items within that Artist's community.`
- `a $5.00 monthly credit applied to the User's account each billing cycle`
- `a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens`

## Entity and governing law

`a North Carolina limited liability company` becomes `a Colorado limited liability company` on terms, rewards terms, and cancellation.

Governing law stays `laws of the State of North Carolina`. The entity is a Colorado LLC. Kevin and counsel still need to decide whether that split is what they want.

The terms loader still rewrites the arbitration place from North Carolina to Colorado. That venue sentence is separate from governing law.

## Rewards placeholders

| Stored token | Replacement | Route file |
| --- | --- | --- |
| Terms of Use `[here, provide link]` | `[Terms of Use](/terms)` | `frontend/app/terms/page.tsx` |
| Premium `[link]` and `[/cancellation-refund]` | `[Premium](/premium)` and `[cancellation and refund policy](/cancellation-refund)` | `frontend/app/premium/page.tsx`, `frontend/app/cancellation-refund/page.tsx` |
| `Privacy Policy [link]` | `[Privacy Policy](/privacy)` | `frontend/app/privacy/page.tsx` |
| `and the Fan Engage Pro Rules for Use and User Content [link]` | deleted | No rules page |
| A whole Rules for Use sentence | deleted | No `frontend/app/rules/page.tsx` |
| `(no public page is published)` | deleted | Not used |
| `example.com`, `{{...}}`, `](#)`, leftover `[link]` | token removed, label kept when there is one | No invented URL |

`The Fan Engage Pro Terms of Use [here, provide link] and the Fan Engage Pro Rules for Use and User Content [link] also apply.` becomes `The Fan Engage Pro [Terms of Use](/terms) also apply.`

Help states the trial and the Colorado entity. It does not mention store credit. `frontend/app/help/page.tsx`.
