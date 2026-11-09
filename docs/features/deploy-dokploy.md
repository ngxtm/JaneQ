# Deploy JaneQ with Dokploy

JaneQ runs as two services defined in [`compose.yaml`](../../compose.yaml). Caddy serves the built React app and falls back to `index.html` for direct links. It forwards `/api` requests to FastAPI with the path intact so the browser uses the same origin for both the app and its session cookie. FastAPI seeds and writes `/data/janeq.sqlite3` in the `janeq-data` named volume. [Database reference](../database.md)

## Set up the deployment

1. Push the branch you want Dokploy to deploy. On the server, use Docker Compose 2.23.1 or later for the inline configuration. [Docker Compose config reference](https://docs.docker.com/reference/compose-file/configs/)
2. For direct ingress to Dokploy, add a Cloudflare `A` record named `janeq` in the `ngxtm.site` zone. Point it at the VPS public IPv4 address and set it to **DNS only**. Make ports 80 and 443 reachable on the VPS for Traefik. [Cloudflare DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
3. In the Dokploy project, create a **Docker Compose** service. Select the JaneQ repo and your branch, set **Compose Path** to `./compose.yaml`, and enable **Isolated Deployments**. [Dokploy isolated deployments](https://docs.dokploy.com/docs/core/docker-compose/utilities#isolated-deployments)
4. Set `JANEQ_DEMO_USERNAME` (defaults to `demo`), `JANEQ_DEMO_PASSWORD`, and `JANEQ_SESSION_SECRET` in **Environment**. Generate the secret from the repo root with the command below. Keep the configured username, secret, and named volume across redeploys to preserve ownership, sessions, and data.
5. Under **Domains**, add `janeq.ngxtm.site` for service `janeq-web` on container port `8080`. Set path `/`, leave **Strip Path** off, and enable **HTTPS** with **Let's Encrypt**. Select **Deploy**. [Dokploy Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains)

```sh
uv run --project backend --locked python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Verify the deployment

- Open `https://janeq.ngxtm.site/api/health` and expect `{"status":"ok"}`.
- Open the home page, sign in, and open a built-in set. Reload its URL to check direct navigation.
- Create a study set, redeploy the same Compose service, and reopen the set to check that its data survived.

## Local verification

Set the three environment variables to disposable values and start a local Compose project with `docker compose up -d --build`. Run the HTTP checks from the Compose network against `http://janeq-web:8080`. The checks below used an isolated project and a fresh named volume.

| Check | Expected result | Observed |
| --- | --- | --- |
| Run `docker compose config --quiet` and build both images. | Compose validates and both images build from locked dependencies. | Pass · Docker |
| Fetch `/`, `/my-sets`, the generated JavaScript asset, and `/api/health`. | The app shell and asset are served, and FastAPI returns `{"status":"ok"}` through Caddy. | Pass · HTTP |
| Request `/api/auth/me` before and after signing in through `/api/auth/login`. | The unsigned request returns `401`. The sign-in response sets a `Secure` cookie that authenticates the next request. | Pass · API |
| Create a study set through `POST /api/study-sets`, run `docker compose up -d --force-recreate`, and reopen the set through the API. | Both containers are recreated and the study set is still in SQLite. | Pass · API |
| Open `https://janeq.ngxtm.site/` after configuring the domain. | Traefik serves the app with a valid TLS certificate. | Pending · VPS |
