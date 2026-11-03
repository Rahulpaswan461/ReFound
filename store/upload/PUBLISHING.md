# Publishing ReFound on the Chrome Web Store

Everything to upload is in this folder.

| File | Where it goes |
|---|---|
| `refound-0.1.1.zip` | Package upload |
| `store-icon-128.png` | Store Listing: store icon |
| `screenshots/1-today.png` to `5-settings-background.png` (1280×800) | Store Listing: screenshots |
| `promo-small-440x280.png` | Store Listing: small promo tile |
| `promo-marquee-1400x560.png` | Store Listing: marquee promo tile (optional) |
| `listing.md` | Text for the Store Listing, Privacy and Test instructions tabs |
| `privacy-policy.html` | Host it publicly, then paste its link in the Privacy tab |

## Before you start

1. The privacy policy is published from the repository's `site/` folder by `.github/workflows/pages.yml`, at https://rahulpaswan461.github.io/ReFound/privacy/. After changing `docs/PRIVACY.md`, copy the change into `site/privacy/index.html` and push. Open the link in a private window to check it loads.
2. Search "ReFound" in the Chrome Web Store to confirm the name is still free.

## Publish

1. Go to https://chrome.google.com/webstore/devconsole and sign in. Use an email you check often; it can't be changed later.
2. First time only: accept the developer agreement and pay the one-time registration fee.
3. Click **Add new item** and upload `refound-0.1.1.zip`.
4. **Store Listing** tab:
   - Description: paste the "Detailed description" from `listing.md`.
   - Category: Productivity (Tools / Workflow).
   - Language: English.
   - Store icon: `store-icon-128.png`.
   - Screenshots: all five from `screenshots/`, in number order.
   - Small promo tile: `promo-small-440x280.png`. Marquee: `promo-marquee-1400x560.png`.
5. **Privacy** tab:
   - Single purpose: paste it from `listing.md`.
   - Permission justifications: paste one line for each permission from `listing.md`.
   - Remote code: No.
   - Data usage: answer to match `privacy-policy.html`. ReFound reads bookmarks, keeps everything on the device, and sends nothing to any server.
   - Tick the three certification boxes, which say you don't sell data, don't use it for unrelated purposes and don't use it for credit decisions.
   - Privacy policy URL: https://rahulpaswan461.github.io/ReFound/privacy/
6. **Distribution** tab: Free, all regions (or choose), visibility **Public**. Pick **Unlisted** if you want to test with friends first.
7. **Test instructions** tab: paste "Test instructions" from `listing.md`.
8. Click **Submit for review**. To choose your launch moment, untick "Publish automatically after review"; you then have 30 days to publish.
9. Turn on email notifications on the Account page and wait for review.

## After it's live

- Copy the store link into the X post in `listing.md`.
- For an update: raise `version` in both `package.json` and `public/manifest.json`, run `npm run package`, and upload the new zip on the item's **Package** tab.
