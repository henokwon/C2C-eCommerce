# Authorization and manual payment confirmation

Profile updates are restricted to the authenticated account and explicitly
allowed fields. Product owners cannot change ownership, moderation or payment
fields through the ordinary product update endpoint. Product deletion requires
ownership or the authenticated account's current administrator role.
The same rules protect advert edits/deletion. Uploaded-file deletion is confined
to the matching product, advert, banner or category storage directory; product
image replacement must reference an image already attached to the owned product.

The legacy `PUT /api/products/payment/update_status/:id` endpoint is now an
administrator-only **manual confirmation** operation. An administrator must verify
payment through the trusted payment process before calling it with numeric
`payFor` (1–12 months). Ordinary customer/mobile tokens can no longer mark a post
paid. Repeated confirmation cannot extend a paid post. No payment-provider
verification is implemented by this patch; a future automated flow must verify
signed provider events and use a unique provider transaction ID.

Before deployment, audit existing privileged accounts and product payment/
moderation records: previously exploited account changes are not undone by these
source fixes. Rotate access/refresh signing secrets to invalidate existing tokens
if the previous deployment was exposed or compromise is suspected.
