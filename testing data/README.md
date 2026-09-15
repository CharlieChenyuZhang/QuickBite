# Local testing data

This optional folder contains the sample restaurant/menu data, test accounts, sample carts, and local mock implementations. Nothing here connects to the Java backend, RDS, AWS, or a payment service.

## Start localhost

From the repository root, using Node.js 22.12+:

```sh
npm run dev:mock
```

Open [QuickBite](http://localhost:5173/). This starts Vite and a real HTTP mock API at `http://127.0.0.1:8787`. The frontend uses its normal API client and session cookies through `/api`; requests are visible in browser developer tools. No separate backend, database, or environment file is needed.

If a port is already occupied, stop the previous development process or choose explicit ports:

```sh
QUICKBITE_PORT=5176 QUICKBITE_MOCK_API_PORT=8789 npm run dev:mock
```

## Test accounts

These are fictional, local-only credentials:

| Email                 | Password        | Initial cart                             |
| --------------------- | --------------- | ---------------------------------------- |
| `alex@quickbite.test` | `QuickBite123!` | The Green Goddess and Classic Margherita |
| `sam@quickbite.test`  | `QuickBite123!` | Empty                                    |

You can also register an account in the UI. The mock checks account passwords, rejects duplicate registrations, protects the cart with a cookie session, and calculates prices from the catalog. Checkout empties the current cart without processing a payment. Logging out invalidates the mock session, while the account's cart remains available on its next login.

Accounts and cart changes live only in the mock server's memory. Stop the command with Ctrl+C and restart it to restore the seed data and end existing sessions. The JSON files are never rewritten. Changes to the JSON fixtures take effect after restart. Do not put real credentials or personal data in these fixtures.

## Files

| File                                         | Purpose                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `catalog.json`                               | Six restaurants and thirty menu items, including IDs, descriptions, images and prices |
| `users.json`                                 | The two initial test accounts                                                         |
| `carts.json`                                 | Initial cart menu IDs for each test account                                           |
| `server.mjs`                                 | Local HTTP REST API and in-memory cookie sessions                                     |
| `start.mjs`                                  | Starts the mock API and Vite together                                                 |
| `demo-api.ts`, `presentation.ts`, `index.ts` | Optional browser-only demo adapter and display data, using the same catalog           |
| `server.test.mjs`, `browser.spec.ts`         | Mock-specific automated checks                                                        |

`npm run dev:demo` remains available for the original browser-only preview. That mode accepts any nonempty credentials and keeps tab-local state; `dev:mock` uses the HTTP server and the accounts above. To clear the browser-only preview, clear `quickbite.demo.v1` in that tab's session storage.

Run only the HTTP mock API with `node "testing data/server.mjs"`, or its tests with `npm run test:mock`.

## Switch to the real API and remove this folder

1. Stop `dev:mock` or `dev:demo`.
2. Start the existing Spring Boot backend, then run:

   ```sh
   API_PROXY_TARGET=http://localhost:8080 VITE_DEMO_MODE=false npm run dev
   ```

3. Delete the entire `testing data` folder when you no longer need local mocks.

The production build and real API mode do not import this folder. Deleting it does not require changing page components, API URLs in application code, or TypeScript imports. `npm run build` still works; mock-specific automated checks are skipped when their folder is absent. The remaining `dev:mock` and `test:mock` package-script shortcuts can be removed if desired. `dev:demo` reports a clear missing-folder error instead of silently calling the real backend.

See [real backend integration](../docs/live-backend.md) for the existing API's logout, CSRF and session requirements. Successful mock tests validate frontend behavior, not the real Java service or database.
