## Supabase → Local DB → Auto-Booking Flow

This describes the new end-to-end flow you added for taking **scheduled showings in Supabase** and turning them into **ready-to-book addresses** for the `auto-book-dashboard.html` + `auto-book-enhanced.js`.

---

## 1. Supabase showing requests → local SQLite (`processed_showing_requests`)

### Env required

- `SUPABASE_PROJECT_URL` – your Supabase project URL
- `SUPABASE_ANON_KEY` – anon key (or)
- `SUPABASE_SERVICE_ROLE_KEY` – optional; if present, the fetch script prefers this for server-side access

These are read in `fetch-showing-requests.js` via `dotenv`.

### Script: `npm run fetch:showings`

Command:

```bash
npm run fetch:showings
```

What it does:

- Creates (if needed) a local table in `src/data/data.db`:
  - `processed_showing_requests`
    - `id TEXT PRIMARY KEY` (Supabase `showing_requests.id`)
    - `user_id TEXT`
    - `property_id TEXT NOT NULL`
    - `status TEXT`
    - `group_name TEXT`
    - `scheduled_date TEXT`
    - `scheduled_time TEXT`
    - `created_at TEXT`
    - `processed_at TEXT DEFAULT CURRENT_TIMESTAMP`
- Connects to Supabase using `createClient(SUPABASE_PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)`.
- Pages through the remote `showing_requests` table with:
  - `status IN ('pending', 'scheduled', 'rescheduled')`
  - ordered by `created_at` ascending
- For each row from Supabase:
  - If its `id` is **not** already in `processed_showing_requests`, it is appended to a `fresh` array.
  - If its `id` **is** already present, it is skipped.
- At the end of the page loop:
  - Inserts all `fresh` rows into `processed_showing_requests` inside a single transaction.
  - Logs how many new requests were stored and prints the list of `property_id`s.

Effect:

- Each Supabase `showing_requests.id` is recorded **once** locally.
- Re-running `npm run fetch:showings` only pulls **new** requests created since the last run.
- The local DB now has a queue of `property_id`s that represent showings you need to handle.

---

## 2. Property API → addresses in `properties` table

After you have `property_id`s in `processed_showing_requests`, the next step is to resolve each ID into a BrokerBay-searchable address using your external API.

### External API

- Base: `https://property-api-6nkd.onrender.com`
- Endpoint: `/api/properties/{property_id}`
- Example response shape:

```json
{
  "id": "N12279461",
  "images": ["..."],
  "price": 2900,
  "address": "Innisfil, ON, L9S 0G9, CA",
  "added": "2025-07-11",
  "beds": 3,
  "baths": 3,
  "parking": 4,
  "sqft": "",
  "location": "Innisfil",
  "areaCode": "",
  "propertyType": "Residential Freehold",
  "availableDate": "",
  "leaseTerms": "12 Months",
  "description": "..."
}
```

Only the `address` field is used for the booking flow.

### Script: `npm run fetch:addresses`

Command:

```bash
npm run fetch:addresses
```

What it does (`fetch-property-addresses.js`):

1. **Ensures `properties` table exists** in `src/data/data.db` (same schema as `ReadAndSaveData.js`):
   - `property_id TEXT UNIQUE`
   - `address TEXT`
   - plus all the other property metadata columns (price, bedrooms, etc.).

2. **Selects pending property IDs** that still need addresses:

   - Reads from `processed_showing_requests` and left-joins `properties`:
     - `p.property_id IS NULL OR p.address IS NULL OR p.address = ''`
   - Orders by `processed_showing_requests.created_at`
   - Limits the batch size (default `LIMIT 50`).
   - Result is a distinct list of `property_id`s that:
     - came from Supabase, and
     - do **not yet** have a stored address in `properties`.

3. **Calls your external API per property**:

   - For each `property_id`:
     - GET `https://property-api-6nkd.onrender.com/api/properties/{property_id}`
     - Reads `payload.address`.
     - Normalizes it for BrokerBay search:
       - Cuts at the first comma and trims:
         - Example: `"78 A Queen Street 301, Bonnechere Valley, ON K0J 1T0, CA"` → `"78 A Queen Street 301"`.
       - If normalization fails or yields empty string, falls back to the raw `address`.

4. **Upserts into `properties`**:

   - Collects all successfully resolved `{ property_id, address }` rows.
   - Executes:

     ```sql
     INSERT INTO properties (property_id, address)
     VALUES (@property_id, @address)
     ON CONFLICT(property_id) DO UPDATE SET
       address = excluded.address;
     ```

   - This means:
     - If a `property_id` does not exist in `properties`, it is created.
     - If it already exists, its `address` is updated.
   - Failed API calls are logged with their status code and error message, but do not abort the whole batch.

Effect:

- Only property IDs that have **no address yet** are sent to the external API.
- You can re-run `npm run fetch:addresses` as often as you want:
  - Already-resolved properties are skipped by the initial query.
  - New `processed_showing_requests` rows get picked up as they appear.

---

## 3. How this feeds the dashboard and auto-booking UI

Once both scripts have run:

1. `src/data/data.db` contains:
   - `processed_showing_requests` – mapping of Supabase `showing_requests` to `property_id`s.
   - `properties` – property records keyed by `property_id`, including a BrokerBay-searchable `address`.

2. `dashboard-server.js` already exposes:
   - `GET /api/properties` – reads from the local `properties` table.
   - `GET /api/scheduled-properties` – reads joined scheduled requests + properties for the auto-book UI.

3. `auto-book-dashboard.html` and `auto-book-enhanced.js` can:
   - Use the `properties.address` values directly as the **search string** for BrokerBay.
   - Follow the same normalization rules you already use in the UI (street + unit before the first comma).

End result: Supabase **showing requests** turn into a local queue of **MLS-backed properties with clean addresses**, which you can then feed into the auto-booking pipeline without manually copying addresses.

---

## 4. Inspecting local tables (`showing_schedules` and `properties`)

For quick debugging and verification of what data has landed in the local SQLite database, you can use:

```bash
npm run show:tables
```

This runs `show-schedules-and-properties.js`, which:

- Connects to `src/data/data.db`.
- Prints all rows from `showing_schedules`.
- Prints all rows from `properties`.

Use this after running `npm run fetch:showings` and `npm run fetch:addresses` to confirm that:

- Supabase `showing_requests` have produced rows in `showing_schedules` (if you populate that table).
- Your property API calls have produced `properties` rows with the expected `property_id` and `address` values for auto-booking.


