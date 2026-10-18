<!-- HYPRGATE NAPPLET MIRROR NOTICE:START -->
> This repository is a read-only mirror of the `profile` napplet from `hyprgate/gui`.
> Open issues and pull requests in https://github.com/hyprgate/gui.
> Do not push commits to this standalone napplet repository; direct changes are overwritten by Hyprgate's mirror workflow.
<!-- HYPRGATE NAPPLET MIRROR NOTICE:END -->

# napplet-profile

[![CI](https://github.com/hyprgate/napplet-profile/actions/workflows/ci.yml/badge.svg)](https://github.com/hyprgate/napplet-profile/actions/workflows/ci.yml)

This app is tracked directly in the Hyprgate workspace at `napplets/profile`.
Standalone repositories are generated read-only mirrors; make changes and run
workspace checks in the existing Hyprgate checkout.

## Parent checkout

```bash
pnpm install --frozen-lockfile
pnpm --filter @hyprgate/napp-profile build
```

## Paja runtime

```bash
pnpm --filter @hyprgate/napp-profile paja
```

This starts Kehto Paja and the napplet's Vite dev server together, using
the port configured in `vite.config.ts`.

## Testing

Run these checks from a Hyprgate parent checkout so workspace dependencies resolve:

```bash
pnpm install --frozen-lockfile
pnpm --filter @hyprgate/napp-profile conformance
pnpm --filter @hyprgate/napp-profile test
pnpm --filter @hyprgate/napp-profile build
```

The `conformance` script builds the napplet and runs `@napplet/conformance-cli` against `dist/`. CI runs the same conformance, unit test, and build checks for every push and pull request.

Workspace dependencies resolve in the Hyprgate checkout. The mirror workflow
rewrites workspace dependency pins for standalone source distribution.

## Intent delivery

The app receives `napplet:profile/open` through the host-injected
`intent.onDelivery` subscription and validates the contract and payload before
applying it. The binding buffers delivery until subscription; no app-specific
INC readiness topic is required. Existing persisted/default startup behavior remains the fallback when no valid intent arrives.

The shell target-controller migration is still in progress; see
[package migration status](../../docs/napplet-package-migration.md).
