# Bluesky License - driver's-license-style card maker

Reads a Bluesky profile by **handle or DID** and generates a driver's-license-style card you can download as a PNG. Single-page, build-free vanilla HTML/CSS/JS.

## Live demo

**https://apexdevelopment.github.io/bluesky-license/**

## Usage

Serve locally. ES modules need HTTP, not `file://`.

```bash
cd bluesky-license
python3 -m http.server 8899   # or npx serve
```

- **Issue**: enter a handle (`user.bsky.social` or a custom domain) or a `did:...`, press Issue.
- Designs: Bluesky (blue) / Cyberpunk / Gold license.

## On the card

- NAME (display name) + `@handle`, **DID**, **HANDLE** with green ✓ when verified
  (custom-domain handle, or Bluesky trusted-verifier / verified status).
- ISSUED (today) · CREATED (account creation) · VALID THRU (last seen + 3y) · LICENSE CLASS (rank).
- Stat panel (5 real metrics): Communication (posts) / Followers / Following / Engagement / Veteran (account age).
- Avatar photo, QR to `bsky.app/profile/<handle>`, holographic security-paper background.

This is a fan-made card for fun, not an official ID.
