# Studyboard

A real-time collaborative whiteboard for study groups. Built with React, TypeScript, Vite, React Konva, and Supabase.

---

## 1. Required software

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| npm | 9 or later |

No other global tools are required. Supabase is used as a hosted service.

---

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project** and choose an organisation.
3. Give it a name (e.g. `studyboard`), set a strong database password, choose a region, then click **Create new project**.
4. Wait ~2 minutes for provisioning to finish.

---

## 3. Enable anonymous sign-ins

Anonymous auth lets users join without an email or password.

1. In your Supabase project dashboard, go to **Authentication → Providers**.
2. Find **Anonymous sign-ins** and toggle it **on**.
3. Click **Save**.

---

## 4. Run the SQL migrations

All migrations live in `supabase/migrations/`. Run them **in order** using the Supabase SQL editor:

1. In the dashboard, go to **SQL Editor → New query**.
2. Paste the contents of `20240001_initial_schema.sql` and click **Run**.
3. Paste the contents of `20240002_realtime.sql` and click **Run**.
4. Paste the contents of `20240003_invite_rpc.sql` and click **Run**.

> **Tip:** If you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed you can run `supabase db push` instead, pointing at your project.

---

## 5. Configure `.env.local`

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the two values. Find them in **Supabase → Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

Never commit `.env.local` — it is already in `.gitignore`.

---

## 6. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 7. Test two people collaborating

1. Open [http://localhost:5173](http://localhost:5173) in **Browser A**.
2. Click **Create a room**, enter a room name and your display name, then click **Create room**.
3. Once in the room, click **Invite** in the top bar. The invite link is copied to your clipboard.
4. Open a **new private/incognito window** (or a second browser) as **Browser B**.
5. Paste the invite link. Enter a different display name and click **Join room**.
6. Both windows should be in the same room. Draw on one — the stroke appears on the other in real time.
7. Move your mouse — the other participant sees your named, colored cursor.

---

## 8. Deploy the frontend

Studyboard is a static SPA. Any static host works.

### Vercel (recommended)

```bash
npm install -g vercel
vercel --prod
```

Set the two `VITE_` environment variables in the Vercel project settings.

### Netlify

```bash
npm run build
# Drag the dist/ folder to app.netlify.com/drop
```

Or connect your repo and set:
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Any static host

```bash
npm run build
# Upload the dist/ directory to your host
```

Configure your host to serve `index.html` for all routes (SPA fallback).

---

## 9. Architecture overview

```
Browser
  └── React + Vite SPA
        ├── react-router-dom  — client-side routing (/, /join/:code, /room/:id)
        ├── react-konva       — canvas rendering (strokes, sticky notes, cursors)
        └── @supabase/supabase-js
              ├── Auth         — anonymous sign-in, session persistence
              ├── PostgREST    — CRUD for rooms, members, board items
              ├── Realtime
              │     ├── postgres_changes  — durable board item sync (INSERT/UPDATE/DELETE)
              │     ├── Presence          — who is online (display name + color)
              │     └── Broadcast         — live cursors (throttled, ephemeral)
              └── Row Level Security
                    — only room members can read/write board items and access channels

Supabase (hosted Postgres + Realtime + Auth)
  ├── study_rooms           — room id, name, invite_code
  ├── study_room_members    — room_id, user_id, display_name, color
  └── study_board_items     — room_id, type ('stroke'|'sticky'), data (jsonb)
```

**Data flow for a stroke:**
1. User draws → optimistic local item with a `tmp-` id is added to React state.
2. On pointer-up, `createBoardItem` inserts the stroke into Supabase.
3. The saved row replaces the temporary one locally.
4. All other clients receive the `INSERT` via `postgres_changes` and add it to their state.

**Data flow for cursors:**
1. On `pointermove`, the position is throttled to ≤25fps and sent via `channel.send()` (Broadcast).
2. Remote clients receive the `cursor` event and update a separate `remoteCursors` map.
3. Cursors are removed from the map after 5 seconds of inactivity.

---

## 10. Known tradeoffs

| Tradeoff | Detail |
|----------|--------|
| **Latest-write-wins** | When two people edit the same sticky note simultaneously, the last `UPDATE` to reach the database wins. The loser's change is silently overwritten. For study-group use this is acceptable; a production app would use operational transforms or CRDTs. |
| **Undo is local-only** | Undo only reverses items you created in the current session. It will not undo a teammate's actions, and it skips deletion if a teammate has since edited the item (`updated_by ≠ your id`). |
| **Board items are not paginated** | All items for a room are loaded on join. For very large boards (thousands of strokes) this could be slow — a cursor-based pagination or spatial indexing strategy would be needed. |
| **Anonymous users** | Anonymous Supabase sessions persist in `localStorage`. If the user clears their browser storage they get a new identity and must re-join any rooms via an invite link. |
| **No canvas pan/zoom** | The canvas is fixed at the container size. Panning and zooming (Stage scale/position) could be added as a future enhancement. |
| **Realtime channel auth** | Presence and Broadcast channels are scoped by room id in the channel name (`room:<roomId>`). Supabase does not enforce RLS on Broadcast messages directly — the RLS on `study_board_items` and `study_room_members` is the primary access control. A malicious client with a valid anon token could subscribe to any channel name if they know the room id. For stronger isolation, use Supabase's [channel-level auth policies](https://supabase.com/docs/guides/realtime/authorization) (beta). |
