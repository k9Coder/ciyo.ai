# Releasing Pretzel-Desktop

## 1. Bump version and trigger CI build

```bash
cd pretzel-desktop
pnpm bump-version   # patch by default
pnpm release         # tags + pushes, triggers CI build (~10-15 min)
```

Wait for CI to go green.

## 2. Publish blobs

```bash
cd ../mykka-web
pnpm publish-blob:staging
pnpm publish-blob:prod
```
