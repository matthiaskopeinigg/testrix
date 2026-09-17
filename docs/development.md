# Development

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Useful flags:

- `TESTRIX_NO_SPLASH=1` — skip splash
- `TESTRIX_DEV_URL` — override Angular origin (default `http://localhost:4200`)
- `TESTRIX_COMPARE=1` — force a separate userData / AppUserModelID so this build can run next to another Testrix install
- `npm run preview:splash` — hold the splash window open
- `npm run preview:boot-error` — startup failure card
- `npm run preview:app-error` — workbench crash card
- `npm run preview:installer` — installer UI without a release payload
- `npm run preview:uninstaller` — uninstaller UI

### Test databases

Docker Desktop (Linux containers) is required.

```bash
npm run db:up          # start engines
npm run db:ps          # status
npm run db:down        # stop
npm run db:reset       # wipe volumes and start again
```

`npm run db:up` brings up every server engine except Oracle. Add Oracle with:

```bash
docker compose --profile oracle up -d
```

SQLite is a file path in the connection tab, not a container.

Wait until `npm run db:ps` shows healthy, then Test from a New Connection tab. Leave TLS off.

| Type | Port | User | Password | Database |
| --- | --- | --- | --- | --- |
| PostgreSQL | 5432 | testrix | testrix | testrix |
| MySQL | 3306 | testrix | testrix | testrix |
| MariaDB | **3307** | testrix | testrix | testrix |
| SQL Server | 1433 | sa | `Testrix_Dev1!` | testrix |
| Redis | 6379 | | | |
| MongoDB | 27017 | | | testrix |
| Oracle | 1521 | testrix | testrix1 | FREEPDB1 |

Host is `localhost` for all of them. Oracle uses a service name (`FREEPDB1`); leave **Use SID** unchecked. Each SQL engine seeds related sample tables (`categories`, `customers`, `orders`, `order_items`, `sample_items`) plus indexes, a view, a routine, and a trigger where the engine allows it. MongoDB seeds `sample_items` and `categories`.

### Side-by-side with an older Testrix install

`npm start` / `npm run dev` already use a separate profile (`%APPDATA%/Testrix-2.0-dev`) and Windows AppUserModelID, so the installed app and this repo can stay open together. The title bar chip shows `2.0 · Local` so you can tell them apart.
