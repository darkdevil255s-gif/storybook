# Deploy the protected book

The frontend remains HTML/CSS/JavaScript. Vercel Routing Middleware checks the book session before serving any book page, chapter script, photo, video, song or font. Chapter questions remain inside this separate book login.

## Local preview

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8766. Use the generated book password from [local-only/book-access.txt](local-only/book-access.txt), then answer the individual chapter question.

Credentials have already been generated locally. `npm run setup-auth` refuses to overwrite existing credentials. Never commit or upload `.env.local`, `local-only/` or `source-material/`.

The plain static `site/` folder and `Start.vbs` are offline previews only. They do not provide server-side protection. Use the Node preview above to test authentication.

## GitHub

Use a **private repository**. Keep this structure:

```text
package.json
package-lock.json
vercel.json
proxy.js
api/
server/
scripts/
site/
.gitignore
.vercelignore
```

`tests/` and this guide may be committed but are not included in the Vercel upload. `.gitignore` excludes private originals, credentials and local tooling. Do not select ignored files manually for commit.

## Vercel project settings

Import the repository. **Root Directory must be the repository root**, not `site`. Server code will be omitted if Root Directory is set to `site`.

- Framework Preset: **Other**
- Root Directory: empty/default repository root
- Build Command: **npm run build**
- Output Directory: **site**
- Node.js: **24.x**

`vercel.json` sets the output directory and all-route middleware. Do not add asset exclusions to the middleware matcher or create alternate unprotected deployments of `site/`.

## Server-only environment variables

Open [local-only/book-access.txt](local-only/book-access.txt) locally. Copy these three values into Vercel Project Settings → Environment Variables, without surrounding quotes:

- `BOOK_PASSWORD_HASH`
- `BOOK_SESSION_SECRET`
- `BOOK_AUTH_RATE_LIMIT_ID` (value: `book-login`)

Apply them to **Production and Preview**. Do **not** add `BOOK_DEV_MODE` to Vercel. Never prefix these variables with `NEXT_PUBLIC_` or put them in HTML/browser JS. The build refuses a Vercel deployment with missing/invalid secrets or a development-mode flag.

Share the separate book password privately with the intended reader. It is not a chapter answer such as “stay”.

## Required login rate limit

In the Vercel project, open **Firewall → Configure → New Rule**:

1. Condition: **@vercel/firewall**.
2. Rate limit ID: **book-login**.
3. Limit: **10 requests per 5 minutes**.
4. Action: **Rate Limit**.
5. Save, review and publish the firewall configuration.

Do not add a filter that excludes login requests. The application supplies a per-client key and checks this rule on every password attempt. Missing rules, blocked traffic or rate-limit service errors deny login instead of allowing unlimited attempts. Vercel rate-limit buckets are per region, not a global single counter.

Firewall provisioning and actual Vercel route/caching behavior must be verified on the first protected deployment. Local tests do not replace this check. Do not enable an unprotected preview merely to test the SDK; configure protection deliberately for both environments.

## Deployment smoke check

Before sharing the URL:

1. In a private browser window, open a chapter URL. It must show the book login, not the chapter.
2. Open a direct photo, MP3 and MP4 URL without signing in. They must deny access and return no media. Verify MP4 HEAD and Range requests too.
3. Sign in, answer a chapter question, and confirm music/photos work. Chapter IV images load sequentially after its unlock.
4. Select **Lock**. Direct media requests must now be denied. Browser Back must not restore usable access.
5. Test an incorrect password and rate-limit failures. Confirm no content is served when auth variables are missing.
6. Check response headers: private/no-store cache policy. Use HTTPS only.

## Media and photos

Deployment media was reduced from approximately **269 MiB to 35 MiB**. All 38 originals were preserved under `source-material/media-originals/`, outside the deployment and Git uploads. Existing active asset filenames were retained.

Chapter IV's six images are listed in [backgrounds.js](site/chapters/04-one-last-time-perhaps/backgrounds.js). Add new JPG/WebP images to `site/chapters/04-one-last-time-perhaps/assets/photos/`, then add the exact filename to that list. Prefer about 1920px on the long edge, remove EXIF/GPS metadata, and keep images below 500KB when practical. Do not upload original camera files to a public repository.

The existing `site/chapters/02-remember/assets/r_2_growing.png` is truncated. It was retained unchanged because reconstructing missing pixels would fabricate content. Replace it with a complete image using the same filename.

## Security limits

A private GitHub repository does not make a deployed website private. The server gate is required.

Sessions expire after eight hours, are bound to the current origin and use Secure/HttpOnly/SameSite=Strict cookies in production. **Lock** clears the current browser's cookies. Rotating the password hash or session secret invalidates all existing sessions, including copied cookies. Logout alone does not revoke a stolen stateless session token before expiry.

An authorised reader can still save content they can view. This is access control, not DRM. Only share images and songs you have permission to distribute.

## Verification run locally

- `npm test`: server-boundary, session/cookie, CSRF, rate-limit failure and route tests.
- `npm run build`: output-directory and required-file checks; validates production auth environment when running on Vercel.
- Protected-browser checks: real login, logout, all four chapter riddles/audio, six actual sequential photos, authenticated video ranges and mobile layouts (320-1366px).
- Static link/prose check: 86 local references; original Chapters I-III prose unchanged.
- Dependencies: `npm audit --omit=dev` found no known vulnerabilities.
- Local tests ran on Node 26.13.1. Vercel is configured for Node 24.x; the actual Vercel build/runtime and WAF rule remain unverified until deployment.
- Lighthouse/Core Web Vitals and real-device iOS/Android playback were not measured. Browser mobile emulation passed, but a device can still block audio and show the Play fallback.

No deployment or Git push is performed by these commands.
