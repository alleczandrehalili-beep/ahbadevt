# FieldFlow Operations

A responsive field-service operations prototype for a Sky Cable managed service provider. It includes:

- Central operations dashboard
- Dispatch board and team assignment recommendations
- Monitoring for 20 technician teams
- Work-order intake for sales agents
- Daily expense recording and budget visibility
- Persistent local demo data using browser storage

## Run

Open `index.html` directly, or serve the folder locally:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

This is a frontend prototype. Production deployment will require authentication, a backend database, mobile GPS permissions, file storage for receipts/photos, and mapping/SMS services.
