# C2C eCommerce

[![Server CI](https://github.com/henokwon/C2C-eCommerce/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/henokwon/C2C-eCommerce/actions/workflows/ci.yml)

## Server continuous integration

The workflow uses Node.js 22 and the server's npm lockfile to check JavaScript
syntax and run isolated HTTP security regressions on pull requests and pushes
to `main`. The badge reports the default branch workflow status and becomes
available after the workflow runs there.

```bash
cd post-to-sell-server
npm ci --ignore-scripts --no-audit --no-fund
find controllers middleware models routes security tests -name '*.js' -print0 | xargs -0 -n 1 node --check
npm run test:security
```

The syntax command uses a POSIX shell. Tests exercise real routes, controllers,
authentication and JWT handling with isolated database and filesystem adapters.
Password hashing is mocked; dependency lifecycle scripts are disabled, so this
workflow does not build native bcrypt or verify signup, a live database,
payment-provider integration, or the admin/client/mobile applications.

Deployment authorization and manual payment requirements are documented in
[server SECURITY.md](post-to-sell-server/SECURITY.md).
