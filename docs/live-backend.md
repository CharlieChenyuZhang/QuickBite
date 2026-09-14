# Connect the existing backend

The frontend uses the original QuickBite REST contract. Java, Spring Boot, Spring Security, Spring Data JDBC, and PostgreSQL / RDS remain in the existing backend project. No replacement service, database, or new backend endpoint is introduced here.

## Required environment information

- The running backend origin, such as a localhost port or the existing HTTPS service address.
- The backend source repository or API specification, particularly its logout path and CSRF configuration.
- A designated test account and test environment for authenticated verification. Configure account credentials locally rather than committing them.

The only backend address in the original frontend was `http://localhost:8080`. The backend must be started separately. A successful demo does not establish real API connectivity.

## Start the real API mode

After starting the existing backend on port 8080:

```sh
VITE_DEMO_MODE=false npm run dev
```

For a remote backend, replace the example origin with the actual service address:

```sh
API_PROXY_TARGET=https://your-existing-backend.example.com VITE_DEMO_MODE=false npm run dev
```

Browser requests remain under `/api`. Vite forwards them to the chosen backend, removes the `/api` prefix, and supports session cookies. Use `VITE_LOGOUT_PATH` only if the existing backend uses a custom logout route. Restart Vite after changing configuration.

The frontend sends the login fields `username` and `password` in a form-encoded request body. The original client used the same fields in the query string, so the actual backend's request parsing must be verified during integration. Logout defaults to `POST /logout`; the original client did not expose a logout operation. The frontend forwards a readable `XSRF-TOKEN` cookie when available, but does not assume a CSRF endpoint that the existing service has not defined.

## Check connectivity without changing data

Run against the backend directly:

```sh
npm run check:backend -- http://localhost:8080
```

Or check the running frontend proxy:

```sh
npm run check:backend -- http://localhost:5173/api
```

The command sends only anonymous GET requests. It checks restaurant and menu response shapes when discovery is public, and checks that the cart requires sign-in through HTTP 401 or a login redirect. A cart returning HTTP 403 is reachable but requires further configuration verification, because the frontend does not use 403 to confirm an anonymous session. Restaurant IDs are taken from the returned data. It never registers an account, signs in, logs out, adds an item, or places an order. Response bodies and cookies are not printed.

| Exit code | Meaning                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `0`       | The available read-only checks passed. This is not a full authenticated integration test.                                   |
| `1`       | Connection, HTTP response, or contract mismatch. HTML from the SPA or a login page is not accepted as API data.             |
| `2`       | The server is reachable, but discovery requires authentication, or the cart's HTTP 403 requires configuration verification. |

The original frontend loaded discovery only after login. A protected restaurant endpoint is therefore reported as incomplete, rather than incorrectly classified as a connection failure. An anonymous cart success is reported as a compatibility issue because the current frontend uses the protected cart to validate a session.

## Verify the authenticated flow

Use the actual test backend and a designated test account to verify registration, login, refresh/session restoration, restaurant and menu loading, adding items, server-computed cart totals, checkout, logout, account switching, and expired sessions. Registration, cart changes, and checkout create real backend data, so use a test environment intended for this validation.

Confirm the server ends its session after logout, including its configured CSRF requirements. Verify persistence and the JDBC/PostgreSQL connection from the backend project or its existing infrastructure. The frontend does not have database credentials or direct database access.

The existing Playwright `live-api-chromium` project exercises the non-demo client against intercepted API responses. Its name describes the frontend code path, not a connection to a deployed Java service. Both those browser tests and the read-only probe have narrower scope than real end-to-end validation.
