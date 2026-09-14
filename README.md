# QuickBite

A responsive food ordering frontend built with React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, and shadcn/ui. Browse restaurants and menus, search for a meal, create an account, sign in, review your cart, place an order, and log out or switch accounts.

This repository contains the frontend. It integrates with the existing Java and Spring Boot REST API secured by Spring Security, with Spring Data JDBC and PostgreSQL / AWS RDS on the backend. The backend API and database are unchanged by this migration.

## Interface preview

The redesigned interface uses a warm neutral palette, food photography, reusable accessible controls, and layouts for desktop and mobile.

[Desktop preview](docs/screenshots/quickbite-desktop.png) · [Mobile preview](docs/screenshots/quickbite-mobile.png)

Screenshots show the explicitly labeled demo. Sample photography loads from Unsplash and typography from Google Fonts, with local font and image fallbacks when those services are unavailable. Live menus and prices come from the existing API.

## Run locally

Use Node.js 22 (22.12+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. By default, API requests use `/api` and the development proxy forwards them to `http://localhost:8080`, removing the `/api` prefix. Start the existing Spring Boot service separately.

To use a different backend:

```sh
API_PROXY_TARGET=https://your-backend.example.com npm run dev
```

To explore the UI without a running backend:

```sh
npm run dev:demo
```

Demo mode uses sample restaurants and a simulated account, cart, and checkout. It is explicitly enabled by `VITE_DEMO_MODE=true` and never activates as a fallback for a failed API request. Demo orders are not sent to the backend.

## Configuration

| Variable            | When applied            | Default                            | Purpose                                                                                |
| ------------------- | ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `API_PROXY_TARGET`  | Vite development server | `http://localhost:8080`            | Backend origin for the local `/api` proxy.                                             |
| `VITE_API_BASE_URL` | Frontend build          | `/api`                             | Request prefix. Prefer the same-origin proxy for cookie authentication.                |
| `VITE_LOGOUT_PATH`  | Frontend build          | `/logout`                          | Existing backend logout path, relative to the API base, starting with `/`.             |
| `VITE_DEMO_MODE`    | Frontend build          | `false`                            | Enables the explicitly labeled local demo when set to `true`.                          |
| `BACKEND_ORIGIN`    | Container startup       | `http://host.docker.internal:8080` | Backend origin for the production Nginx proxy. Use an origin without a trailing slash. |

Vite exposes `VITE_*` values to the browser bundle. Do not put credentials or secrets in these variables. Changing them requires a rebuild. `BACKEND_ORIGIN` is a server-side runtime setting and does not require rebuilding the frontend.

## Existing API contract

Frontend requests are made with credentials enabled. The same-origin proxy keeps browser routes such as `/login` and `/cart` separate from the backend routes with those names.

| Method | Backend route          | Request                                                                    |
| ------ | ---------------------- | -------------------------------------------------------------------------- |
| `POST` | `/login`               | Form-encoded `username` and `password`.                                    |
| `POST` | `/logout`              | Default Spring Security logout path, configurable with `VITE_LOGOUT_PATH`. |
| `POST` | `/signup`              | JSON containing `email`, `password`, `first_name`, and `last_name`.        |
| `GET`  | `/restaurants/menu`    | Restaurant collection.                                                     |
| `GET`  | `/restaurant/:id/menu` | Menu for one restaurant.                                                   |
| `GET`  | `/cart`                | Current session's cart.                                                    |
| `POST` | `/cart`                | JSON `{ "menu_id": 123 }`.                                                 |
| `POST` | `/cart/checkout`       | Empty body with JSON content type, matching the existing client contract.  |

The client validates a restored session through `/cart`, because the original frontend does not define a `/me` operation. TanStack Query coordinates fetching, cache invalidation after cart changes, and pending and error states. Restaurant and menu search runs against fetched data.

The original frontend contract supports adding items and submitting the cart. It does not provide removal or decrement operations, a payment processor, delivery-address submission, or an order-history endpoint. The interface does not invent these backend capabilities. Checkout submits the existing order operation; it does not charge a card.

The account menu provides **Log out** and **Switch account**. Both first submit a server logout request, then make an uncached `/cart` request to confirm the session is no longer authenticated. Client state is cleared only after logout is confirmed; a failed request or a still-authenticated cart produces an error instead of a success message. Switching accounts then opens the sign-in page.

Confirmed account changes notify other live tabs to discard their old identity and cart caches when `BroadcastChannel` is available. A shared random revision marker also catches missed notifications when a tab returns or restores its session. The marker contains no credentials or account details. Demo sessions remain local to each tab. Order confirmations are bound to a local session generation so signing in again cannot reveal a previous session’s receipt through browser history.

The default logout route is `POST /logout`, following [Spring Security's standard logout behavior](https://docs.spring.io/spring-security/reference/servlet/authentication/logout.html). This is a frontend integration default, not a claim that the unavailable backend configuration has been inspected. Set `VITE_LOGOUT_PATH` if the existing service uses a different route. The client forwards an existing readable `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` when present. The backend's configured logout and CSRF behavior still needs to be validated against the live service; no backend configuration is changed here.

For a cross-origin `VITE_API_BASE_URL`, the existing backend must already support credentialed CORS for the exact frontend origin and appropriate session-cookie settings. The provided same-origin proxy avoids requiring cross-origin browser requests. Host-only session cookies work through the proxy; a backend that explicitly pins cookie `Domain` or a restrictive `Path` requires matching existing deployment configuration.

## Validation

```sh
npm run format:check
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The build includes TypeScript checking and produces `dist/`. GitHub Actions runs formatting checks, lint, unit tests, the production build, a Docker build and Nginx configuration check, and Playwright tests on pull requests and pushes to the default branches. Browser reports are uploaded as workflow artifacts. Run `npm run format` to apply the project's formatting rules.

Automated frontend checks use controlled data and do not establish that a deployed Spring Boot service or AWS environment is healthy. Before releasing against the live service, verify registration, sign-in, session restoration after refresh, restaurant and menu loading, adding items, cart totals, checkout, logout, switching accounts, expired sessions, and direct navigation to nested routes.

## Container and AWS deployment

The multi-stage `Dockerfile` builds static assets and serves them with Nginx on port `8080`. Nginx forwards `/api/*` to `BACKEND_ORIGIN`, strips `/api`, forwards session cookies, and serves the SPA for page routes. `/health` returns a frontend liveness response.

```sh
docker build -t quickbite-frontend .
docker run --rm -p 3000:8080 \
  -e BACKEND_ORIGIN=http://host.docker.internal:8080 \
  quickbite-frontend
```

Open [QuickBite locally](http://localhost:3000). On Linux, add `--add-host=host.docker.internal:host-gateway` when the backend runs on the host. When it runs in another container, connect both containers to a shared Docker network and use that backend container's network name as the origin.

The default Docker build uses the live API. A deliberately isolated demo image can be built with `--build-arg VITE_DEMO_MODE=true`. Do not use that build for live ordering.

For an existing customized logout route, build with `--build-arg VITE_LOGOUT_PATH=/your/logout/path`. This path is appended to `VITE_API_BASE_URL`; it is a build setting, so changing only an App Runner runtime variable will not update the browser bundle.

To deploy this frontend using the requested AWS stack:

1. Build a Linux AMD64 frontend image with `docker build --platform linux/amd64 -t quickbite-frontend .`, then push it to an Amazon ECR repository in your AWS account. Specify the platform when building on Apple Silicon as well.
2. Create or update an AWS App Runner service using that ECR image and the appropriate ECR access role.
3. Configure the service port as `8080` and the HTTP health-check path as `/health`.
4. Set the runtime environment variable `BACKEND_ORIGIN` to the existing, reachable Spring Boot service origin, for example `https://your-backend.awsapprunner.com`. Keep `VITE_API_BASE_URL` at `/api` for the provided proxy.
5. Verify the live user flow over HTTPS, including the session cookie on sign-in and refresh. The frontend health endpoint checks the web server only, so check the backend separately.

The frontend does not connect directly to PostgreSQL or RDS. Database credentials belong in the existing backend configuration. Deployment files and instructions are provided here; this repository does not assert that an AWS deployment has been performed or validated.

References: [Nginx container configuration](https://hub.docker.com/_/nginx), [Nginx proxy URI handling](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), and [App Runner services from ECR images](https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html).
