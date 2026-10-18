# Engineering Decisions & Architecture Trade-offs
**Challenge:** Newtonite Software Engineering Challenge — *Operations Under Pressure*  
**Author:** Software Engineering Candidate  
**Date:** October 2026  

---

## 1. Concurrency Control: Conditional Atomic UPDATE for Claims & Optimistic Concurrency Control (OCC) for Edits

### Context
In operational triage across fast-moving teams, multiple incidents occur simultaneously. Two critical race conditions occur regularly:
1. **The Double-Claim Race:** Multiple engineers click "Claim" on an unassigned urgent incident at the exact same millisecond.
2. **The Stale Overwrite Collision:** User A opens an item, reads older instructions, and saves an update while User B has already modified the issue state or reassigned priority.

### Options Considered
- **Option A: Pessimistic Row Locking (`SELECT ... FOR UPDATE`).** Locks database rows during read-edit cycles until transactions commit.
- **Option B: Application-level Distributed Lock (Redis Redlock).** Requires managing a Redis cluster, lock leases, TTL expiration, and lock release failure recovery.
- **Option C: Conditional Atomic UPDATEs + Optimistic Concurrency Control (OCC) with Version Counters.** (Selected)

### Decision & Rationale
We chose **Option C**:
1. **For Claims:** An atomic conditional update:
   ```sql
   UPDATE work_items 
   SET assignee_id = :userId, version = version + 1, updated_at = :now 
   WHERE id = :id AND assignee_id IS NULL;
   ```
   If zero rows are modified, the database engine guarantees that another user succeeded. The server immediately returns `HTTP 409 Conflict` with the winner's information.
2. **For General Item Updates & State Transitions:** An integer `version` column is incremented atomically on every mutation (`WHERE id = :id AND version = :clientVersion`). If a mismatch occurs, the server rejects the write with `HTTP 409 Concurrency Conflict` and returns the latest record for client reconciliation.

### Trade-offs
- **Pros:** Zero lock overhead, high throughput, zero risk of deadlocks, works identically across PostgreSQL and SQLite.
- **Cons:** If contention on a single item is extraordinarily high (e.g., hundreds of users modifying the same line item concurrently), rejected requests must be re-fetched by the client rather than queued. In human operational triage, this trade-off is optimal.

---

## 2. Asynchronous Execution: Transactional Outbox Pattern vs Direct Message Publishing

### Context
When operational items transition states, secondary actions must occur reliably (e.g. notifying new assignees, alerting team leads for approvals, audit log replication). If the server updates the database and then directly publishes to an external broker (RabbitMQ/Kafka/Email API), a crash or network partition between those two steps produces permanent data inconsistency (the dual-write problem).

### Options Considered
- **Option A: Synchronous In-Band Processing.** Trigger webhooks and external notifications within the HTTP request lifecycle.
- **Option B: Direct Asynchronous Publishing.** Update DB, then call `queue.publish()` in background without transactional guarantees.
- **Option C: Transactional Outbox Pattern.** (Selected)

### Decision & Rationale
We implemented the **Transactional Outbox Pattern**:
1. Every state mutation writes a job row to `outbox_jobs` *inside the exact same ACID database transaction* as the work item update and activity event.
2. If the transaction rolls back, no outbox job is created. If the transaction commits, the job is guaranteed to be stored durably.
3. A background worker polls runnable jobs (`status = 'PENDING' AND next_run_at <= now`), acquires them atomically with status `'PROCESSING'`, and invokes handlers.
4. On failure, it applies **exponential backoff** (`2^attempts * 1000ms`) with a capped retry ceiling (`max_attempts = 3`), transitioning permanently failing jobs to `'FAILED'` (dead letter).
5. Handlers are structured to be idempotent.

### Trade-offs
- **Pros:** Eliminates lost notifications; guaranteed at-least-once delivery; no distributed two-phase commits required.
- **Cons:** Slight delivery latency equal to the worker poll interval (configured at 3s by default); requires maintaining outbox table cleanup/archiving policies over time.

---

## 3. Authorization Model: Resource-Level Team Scoping (RBAC) vs Global Roles

### Context
Newtonite comprises multiple independent functional teams (Core Engineering, Payments & Risk, Legal & Compliance, Customer Operations). A senior engineer in Engineering should not view or modify confidential compliance audits unless explicitly granted membership. Furthermore, within a team, certain transitions (such as approving production fixes) must be restricted to Leads or Admins.

### Options Considered
- **Option A: Client-Side UI Hiding.** Only hiding buttons in the browser interface while leaving API endpoints un-scoped.
- **Option B: Flat Global Roles (Admin, User).** Simple to implement but violates cross-team isolation and least-privilege principles.
- **Option C: Two-Tier Team Membership RBAC with Resource-Level Enforcement.** (Selected)

### Decision & Rationale
We implemented **Option C**:
- **Memberships Schema:** `memberships(user_id, team_id, role)` where role is one of `VIEWER`, `MEMBER`, `LEAD`, `ADMIN`.
- **Server Enforcement:** Every query and mutation is filtered and validated at the service layer:
  - `VIEWER`: Read-only access to team work items and audit trails.
  - `MEMBER`: Full access to create, claim, edit, transition, and comment on items within their team.
  - `LEAD`: All Member abilities + exclusive authority to pass or reject approval steps (`AWAITING_APPROVAL -> RESOLVED`).
  - `ADMIN`: Global bypass authority across all teams.
- Any attempt to read or mutate items belonging to a team the user is not a member of immediately fails with `HTTP 403 Forbidden`.

### Trade-offs
- **Pros:** Tight security perimeter; prevents accidental data leaks or unauthorized sign-offs; auditable role hierarchy.
- **Cons:** Requires a join with the `memberships` table on queries and additional checks on state transitions.

---

## 4. History and Accountability: Append-Only Immutable Activity Events

### Context
Operational investigations often collapse into finger-pointing when status or ownership changes silently. Management requires an undeniable audit timeline of every state transition, assignment, priority escalation, and comment.

### Options Considered
- **Option A: Update-in-Place with `updated_at` / `updated_by` columns.** Overwrites previous history; only latest change is preserved.
- **Option B: Periodic Table Snapshots / CDC.** Captures changes from external WAL logs asynchronously, but difficult to inspect in real-time UI.
- **Option C: Unified Append-Only `activity_events` Table written transactionally.** (Selected)

### Decision & Rationale
We chose **Option C**:
- Every item mutation (creation, claim, edit, priority update, transition, comment) writes an immutable event into `activity_events` within the *same database transaction*.
- History can **never disagree with the item's current state**: if the transaction commits, both the item update and the history event exist; if it rolls back, neither exists.
- The UI renders this timeline in chronological order with user attribution, relative timestamps, and diff metadata.

### Trade-offs
- **Pros:** Complete audit accountability; zero discrepancy risk; trivial to display full item provenance.
- **Cons:** Storage footprint grows linearly with activity volume. (At 10x scale, this table would be partitioned by date or archived to cold storage).

---

## 5. Performance at Scale: Keyset/Cursor Pagination & Database Indexing vs Client-Side Filtering

### Context
A growing company generates tens of thousands of work items and hundreds of thousands of activity events. Loading the entire dataset into the frontend or processing all rows in application memory fails rapidly as volume grows.

### Options Considered
- **Option A: Client-Side Loading & Filtering.** Fetch all rows in one large JSON payload and filter in browser state.
- **Option B: Offset/Limit Pagination (`OFFSET 10000 LIMIT 20`).** Simple, but causes severe query degradation on large tables because PostgreSQL must scan and discard thousands of rows.
- **Option C: Keyset / Cursor Pagination with Compound Indexes.** (Selected)

### Decision & Rationale
We implemented **Option C**:
- Endpoints accept a base64 encoded cursor representing `(created_at, id)`.
- SQL queries execute:
  ```sql
  WHERE (created_at < :cursorCreatedAt OR (created_at = :cursorCreatedAt AND id < :cursorId))
  ORDER BY created_at DESC, id DESC
  LIMIT :limit + 1;
  ```
- Backed by compound B-tree indexes:
  - `idx_work_items_team_status (team_id, status)`
  - `idx_work_items_created_at (created_at DESC)`
  - `idx_work_items_assignee (assignee_id)`
  - `idx_activity_events_item (work_item_id, created_at ASC)`

### Trade-offs
- **Pros:** Consistent $O(\log N)$ retrieval speed regardless of whether fetching page 1 or page 10,000; avoids missing or duplicated items when new items are added while browsing.
- **Cons:** Does not allow jumping directly to an arbitrary page number (e.g. "jump to page 47"), which is rarely required in operational triage.

---

## 6. Scope Boundaries: What We Intentionally Chose Not to Build & Why

To deliver a reliable, deeply tested vertical slice within the designated time frame, we deliberately excluded:
1. **Real-time WebSockets / SSE:** Short polling (every 5 seconds) and on-demand refetching provides 95% of the operational value with zero WebSocket connection management, socket reconnection state, or load balancer sticky session complexity.
2. **File Attachments / S3 Object Storage:** Blob uploads introduce multipart upload edge cases, presigned URL lifecycles, and virus scanning concerns. External links or snippet pastes in comments fulfill operational needs.
3. **SSO / OAuth2 Provider Integration:** Seeded demo credentials with JWT Bearer tokens and instant 1-click persona switching allow evaluators to test all roles in seconds without external IdP setup.
4. **Arbitrary Complex Form Builders:** Fixed schema with extensible JSON metadata enables strict validation, typed queries, and robust indexing.
