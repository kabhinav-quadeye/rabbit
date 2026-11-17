# Goals: UX design and HLD (issue #13)

Status: implemented on `feat/13-goals`. Visual mockup: [`goals-ux-mockup.html`](./goals-ux-mockup.html). Section 9 lists where the build differs from the original proposal.

## 1. Problem and outcome

People want to break large life goals into small, achievable tasks and see steady progress. Rabbit adds a private **Goals** space. Each goal holds a task tree. The main screen always shows the next few actionable tasks for each goal and a short summary of recent progress.

Success means a person can:

- create a goal and break it down into several tasks in under a minute,
- open Goals and know immediately what to do next for each goal,
- see recent progress stated plainly (“You completed 10 tasks across 3 goals in the last 7 days”).

## 2. Decisions confirmed with the product owner

| Topic             | Decision                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placement         | **Fourth primary tab** “Goals”, between Recent posts and Profile, in both the desktop rail and the phone bottom nav. This amends the three-tab rule in `PRODUCT.md` and `DESIGN.md`.                                 |
| Privacy           | **Private by default, shareable with friends** (§10). v1 was owner-only; sharing was added later. Goals are never searchable.                                                                                        |
| Refresh           | **Rows stay until refresh.** Completing a task from Goals home strikes it through in place, with Undo. The list re-ranks only when the person taps Refresh. Refresh then shows a count badge of pending completions. |
| Parent completion | **Confirm, then complete the branch.** Completing a task with open descendants asks “Also complete N open sub-tasks?” and completes the whole branch. Reopening a task also reopens its completed ancestors.         |

## 3. UX design

### 3.1 Information architecture

```
Goals (tab)
├─ Goals home ......... momentum panel · "Up next" per goal · Refresh · New goal
│   └─ Goal page ...... header (why, target, progress) · task tree · add bar
│       └─ Task detail  description · priority · due · sub-tasks · notes · complete/delete
└─ Goal form (sheet) .. create / edit goal
```

Navigation follows the existing circle-feed pattern. A goal page opens inside the Goals tab with a back affordance (“Goals” / “All goals”). Tapping the Goals tab again returns home.

### 3.2 Visual language (stays within Rabbit's system)

- **Surfaces:** paper cards on the ivory ground, 16px radius and a 1px border, with no shadows.
- **Action color:** the forest primary is used only for “Goal” and “Mark complete”, filled checkboxes and progress fill.
- **Goal identity:** goals reuse the five identity tone pairs and the rounded-square “mark” used for circles. The glyph set is `run`, `book`, `leaf`, `language`, `flag` and `heart` (stroked Lucide icons at 46% scale). The tone pair always appears together, as the Audience Agreement Rule requires.
- **Nav glyph:** Lucide `Sprout`. It fits the garden direction, and the “Goals” label carries the meaning.
- **Momentum panel:** pale-foliage fill, like the existing “Good things grow in small circles” card. It contains a single sentence-first card-title line and a 7-day mini bar row. It does not show dashboard KPI tiles.
- **Priority:** shown as a text label plus a small signal glyph, never color alone. High uses the peach ink, Medium the sand ink and Low muted. A task with no priority shows nothing. The error red stays reserved for errors, so overdue dates use peach ink with the word “Overdue”.
- **Progress:** a 6px bar with a forest fill on a sage track, plus the text “8 of 15 done”.
- **Motion:** checkbox fill and strike-through use the existing 180ms ease-out and are disabled under reduced motion. No confetti. Achieving a goal is marked with a calm “Goal reached” state on its card (§3.7).

### 3.3 Goals home

Top to bottom (mockup frame 1):

1. **Title:** “What are you working toward?” / “Big ambitions, one small step at a time.” This follows the question-style page titles used elsewhere.
2. **Momentum panel:**
   - Lead: “You completed **{n} tasks** across **{g} goals** in the last 7 days.” Singular/plural forms are handled.
   - Seven day columns, oldest to newest, with today labeled “Today”. Bar height is proportional to that day's completions, with a 4px minimum.
   - Secondary line, chosen in order:
     - more than the previous 7 days: “{d} more than the week before. Keep it going.”
     - equal and above 0: “Same pace as last week. Steady wins.”
     - fewer: “Your next step is below.”
   - Zero state: “A fresh week. Finish one small task to get moving.”
   - If no goals exist, the panel is replaced by the empty state (§3.7).
3. **“Up next” row:** the section title, plus a **Refresh** button and a primary **+ Goal** button.
   - Refresh is a quiet secondary button by default.
   - Once the person completes or undoes something, Refresh switches to the selected-chip treatment (pale foliage, forest ink) and shows a count badge. Its accessible label becomes “Refresh, 2 changes”.
4. **Goal cards**, ordered by most recent activity. The tie-breaker is the earliest target date, then creation order. Each card shows:
   - the goal mark, title, “{done} of {total} done · by {target}” and a chevron that opens the goal page,
   - the progress bar,
   - the **top 3 next tasks** (§4), each with a checkbox, description and a meta line (priority, due date, “in {parent}” for nested tasks),
   - an inline **Add a task** row, which expands into an input in place and adds a top-level task to this goal.

**Completion on home (refresh semantics):**

- Tapping a checkbox persists immediately. The row stays where it is: it strikes through, its checkbox fills and Undo appears.
- The card counter and progress update immediately, because they are factual.
- The ranked list and the momentum panel update when the person taps Refresh, and also when the tab is re-entered or the app is reloaded.
- If the write fails, the row reverts and shows an inline “Couldn't save. Try again”. This reuses the persistent interaction feedback pattern from #10.
- If a task has open descendants, the confirmation dialog appears before any write.

### 3.4 Goal page

Mockup frame 2 (phone) and frame 4 (desktop).

- **Header:** goal mark, title, “Target {date} · {n} days left”, the optional “Why it matters” line, and a progress bar with “8 / 15”. The overflow menu holds Edit goal, Mark goal reached, Archive and Delete.
- **Segmented switch:** **All tasks** (the default tree) or **Up next** (the full ranked leaf list for this goal, not capped at 3).
- **Tree:**
  - Rows appear in creation order within each parent.
  - Each level indents 26px, up to a maximum depth of 4.
  - A row with children has a disclosure chevron and a “1 of 3” child counter.
  - Parents start expanded when they have fewer than 6 open children, otherwise collapsed. Expanded state is remembered per goal for the session.
  - Completed tasks are **hidden by default**. A “Show done · 8” toggle reveals them inline, struck through.
  - Tapping a row selects it and opens task detail. Tapping its checkbox completes it.
- **Add task:**
  - Phone: an input bar docked at the bottom, above the nav, that rises with the keyboard.
  - Desktop: an always-visible field at the end of the tree card.
  - Enter or Send creates a top-level task, clears the field and **keeps focus** so the person can add several tasks in a row.
  - Empty input is ignored. A description over 500 characters shows inline error text.

### 3.5 Task detail

Mockup frame 3 (phone bottom sheet) and frame 4 (desktop side panel).

- **Container:**
  - Below 960px: a bottom sheet that slides up, has a grab handle and stops about 90% of the viewport high.
  - 960 to 1229px: a right-anchored sheet.
  - 1230px and wider: an inline 360px panel that takes the support column's place, so the tree stays visible.
- **Breadcrumb:** “{goal} › {parent}”. Each part is tappable.
- **Description:** large editable text in the card-title style. It saves on blur or Enter.
- **Priority:** chips None / Low / Medium / High. Selecting one saves immediately.
- **Due date:** quick chips Today and Tomorrow, a date chip that opens a compact in-house month grid (no new native dependency), and Clear. Dates are stored as calendar dates with no time component.
- **Sub-tasks:** direct children of this task with checkboxes, a “0 of 2” counter and an inline **Add a sub-task** input. This is the issue's “add below another task when it's selected”. Tapping a sub-task moves the sheet to that task, and the breadcrumb lets the person go back up.
- **Notes:** a multiline field with the placeholder “Anything that helps you finish this: links, numbers, who to call.” It saves automatically after 800ms of inactivity and on blur, with a quiet “Saving… / Saved” label.
- **Footer:**
  - **Mark complete** (primary). For a completed task it becomes **Reopen** (secondary).
  - **Delete task** (quiet text). It asks for confirmation and states the effect when relevant: “Delete this task and its 2 sub-tasks?”

### 3.6 Goal form

A standard `Sheet` with these fields:

- Title (required, up to 120 characters).
- “Why it matters” (optional, up to 500).
- Target date (optional).
- Tone and glyph picker, reusing the circle form's swatch pattern.

On create, the app opens the new goal page with the add bar focused.

### 3.7 States and microcopy

| State                              | Treatment                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No goals                           | `Empty` with the Sprout glyph. “Plant your first goal.” / “Write down something you want to achieve, then break it into small steps.” Action: **Create a goal**. |
| Goal with no open tasks, some done | Card body: “All clear. What's the next step?” plus Add a task. On the goal page, a pale-foliage banner offers **Mark goal reached**.                             |
| Goal reached                       | Card moves to a collapsed “Reached · 2” section at the end of home. Its mark gains a small check. The full tree stays visible read-only (it can be reopened).    |
| Loading                            | The previous data stays on screen and Refresh shows a spinner. On first load only, skeleton card outlines appear.                                                |
| Network error                      | An inline error inside the section with **Try again**. The app never shows a blank screen.                                                                       |
| Archived                           | Hidden from home. A “Show archived” link at the end of home lets the person restore it.                                                                          |

### 3.8 Accessibility and responsive rules

- Checkboxes are 44×44 hit targets with `accessibilityRole="checkbox"` and checked state. Labels include context: “Complete: Book a gait analysis, High priority, due Friday”.
- Tree rows expose their level (`aria-level` on web) and expanded state.
- Sheets trap focus and restore it to the originating row. Escape closes them on web.
- Colour is never the only signal. Priority, overdue and done states each carry text or a strike-through.
- At 390px: no horizontal overflow. The bottom nav keeps four items at a minimum of 80px each, and long descriptions wrap. On phones the depth-4 indent is capped at 78px.

## 4. “Up next” ordering

For one goal, from the issue:

1. **Candidates:** open tasks with **no open children**. A parent whose children are all done becomes actionable again.
2. **Sort:**
   1. priority, High > Medium > Low > None,
   2. due date, earliest first, with undated tasks last,
   3. `createdAt`, oldest first,
   4. `id`, for stability.
3. Home takes the first 3. The goal page's “Up next” view shows all of them.

This is implemented as one pure function shared by every client and test:

```ts
nextTasks(tasks: Task[], goalId: string, limit = Infinity): Task[]
```

## 5. High-level design

### 5.1 Architecture

The feature follows Rabbit's existing layering.

```
UI (src/goals/*.tsx)
   │  request("/goals…")           ← same request() transport as posts
   ▼
src/api.ts ── firebaseService? ──► src/firebase-service.ts ─► Firestore (goals, goalTasks)
          └── fetch /api ────────► server/api.ts (SQLite app_state JSON)
                                   │
              both call ──────────►src/domain.ts createService(): validation, ownership, cascades
              both use  ──────────►src/goals.ts pure selectors: nextTasks, progress, momentum, tree
```

- **The domain service is the single source of business rules**, as it already is for posts and circles. The SQLite API persists the whole state after each change. The Firebase service hydrates a scoped state, calls the same domain method, then writes the resulting documents in a transaction or batch.
- **Pure selectors live in `src/goals.ts`.** They have no I/O, so ordering, progress and momentum are unit-testable and identical on every backend.
- **Goals load separately from `/bootstrap`.** Opening the Goals tab or tapping Refresh calls `GET /goals`. This keeps post bootstrap reads unchanged, and the post screens never pay for goal data.

### 5.2 Data model

New types in `src/types.ts`:

```ts
type Tone = "sage" | "peach" | "lavender" | "blue" | "sand";
type Goal = {
  id: string; ownerId: string;
  title: string;              // 1–120
  why: string;                // 0–500
  color: Tone; icon: "run" | "book" | "leaf" | "language" | "flag" | "heart";
  targetDate: string | null;  // "YYYY-MM-DD"
  status: "active" | "reached" | "archived";
  createdAt: string; updatedAt: string; reachedAt: string | null;
};
type Task = {
  id: string; ownerId: string; goalId: string;
  parentId: string | null;    // null = directly under the goal
  depth: number;              // 0–3 (4 visual levels); parent.depth + 1
  description: string;        // 1–500
  notes: string;              // 0–10000
  priority: "none" | "low" | "medium" | "high";
  dueDate: string | null;     // "YYYY-MM-DD", calendar date: no timezone drift
  status: "open" | "done";
  createdAt: string; updatedAt: string; completedAt: string | null;
};
State += { goals?: Goal[]; goalTasks?: Task[] }   // optional → existing SQLite state needs no migration
```

Why tasks are stored this way:

- **Flat tasks with a `parentId`**, not a nested tree. Each task is its own document, which avoids Firestore's 1 MB document limit (notes can be large) and conflicts when two devices edit the same goal.
- **A top-level `goalTasks` collection with `ownerId`**, not a subcollection. One owner query loads every goal's tasks for home. Rules stay simple.
- **A stored `depth`.** Rules can enforce the depth limit with a single `get()` of the parent.
- **`parentId` and `goalId` are immutable** in v1 (no drag-to-reparent). This removes cycle checks entirely.

### 5.3 API (identical paths on both backends; local adds `/api`)

| Method & path              | Domain method        | Notes                                                                                                                                                                |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /goals`               | `goalsOverview(uid)` | Returns `{ goals, tasks }`: all of the owner's goals (any status) and all their tasks. Progress, momentum and “Show done” all derive from this one payload.          |
| `POST /goals`              | `createGoal`         |                                                                                                                                                                      |
| `PATCH /goals/:id`         | `updateGoal`         | Title, why, tone, icon, target, status.                                                                                                                              |
| `DELETE /goals/:id`        | `deleteGoal`         | Deletes the goal and all its tasks.                                                                                                                                  |
| `POST /goals/:id/tasks`    | `createTask`         | Body `{ description, parentId?, priority?, dueDate? }`.                                                                                                              |
| `PATCH /tasks/:id`         | `updateTask`         | Description, notes, priority, due date only.                                                                                                                         |
| `POST /tasks/:id/complete` | `completeTask`       | Body `{ cascade: boolean }`. Returns 409 `{ openDescendants: n }` when there are open descendants and `cascade` is false. The UI uses this to show the confirmation. |
| `POST /tasks/:id/reopen`   | `reopenTask`         | Reopens the task and any completed ancestors.                                                                                                                        |
| `DELETE /tasks/:id`        | `deleteTask`         | Deletes the subtree.                                                                                                                                                 |

Mutations return the changed `Task[]` or `Goal`, so the client can patch its local cache without refetching.

### 5.4 Domain rules (`src/domain.ts`)

- **Ownership:** every method checks `goal.ownerId === uid`, and fails with 404 “Goal not found.” for foreign goals so their existence isn't revealed. Tasks inherit ownership from their goal.
- **Validation:** text limits as in §5.2, an enumerated priority, `YYYY-MM-DD` dates, and tones and icons from fixed lists.
- **Structure on create:** the parent must belong to the same goal, and `depth = parent.depth + 1 ≤ 3`.
- **Invariant:** _a done task has no open descendants._
  - `completeTask` with cascade sets the task and every open descendant to done, sharing one `completedAt`.
  - `reopenTask` sets the task and any done ancestors to open, clearing `completedAt`.
  - `createTask` under a done parent reopens that parent and its ancestors, because adding work reopens the branch.
- **Clocks:** IDs and the clock are injected, as they already are, so tests are deterministic.

### 5.5 Firebase

**Load:** goal requests are handled before the shared post `load()`, so they never read posts or circles.

```ts
query(goals, where("ownerId", "==", uid));
query(goalTasks, where("ownerId", "==", uid)); // GET /goals
query(goalTasks, where("ownerId", "==", uid), where("goalId", "==", id)); // mutations on one goal
```

**Writes:**

- Single-document creates and updates use `setDoc` / `updateDoc`.
- Every mutation loads that goal's tasks, applies the domain method to that scoped state, and writes all changed documents in one atomic `writeBatch`, chunked at 450 writes. The domain caps a goal at 500 tasks. Goal deletion removes tasks first, then the goal, so a partial failure never orphans tasks. Batches rather than transactions are acceptable because the data is private: the only concurrent writer is the same person on another device, and selectors tolerate a briefly inconsistent tree.

**Indexes:** none needed. Every query uses equality filters only, which Firestore serves by merging single-field indexes.

**Rules** (`firestore.rules`):

```
function validGoal(g, id) { keys hasAll/hasOnly; g.id == id; text limits; enums; date pattern }
match /goals/{goalId} {
  allow read:   if signedIn() && resource.data.ownerId == me();
  allow create: if signedIn() && request.resource.data.ownerId == me() && validGoal(request.resource.data, goalId);
  allow update: if signedIn() && resource.data.ownerId == me() && validGoal(request.resource.data, goalId)
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title','why','color','icon','targetDate','status','updatedAt','reachedAt']);
  allow delete: if signedIn() && resource.data.ownerId == me();
}
function ownGoal(goalId) { return get(/databases/$(database)/documents/goals/$(goalId)).data.ownerId == me(); }
function validParent(t) {
  return (t.parentId == null && t.depth == 0)
    || (getAfter(/databases/$(database)/documents/goalTasks/$(t.parentId)).data.goalId == t.goalId
        && getAfter(...parent).data.ownerId == me()
        && t.depth == getAfter(...parent).data.depth + 1 && t.depth <= 3);
}
match /goalTasks/{taskId} {
  allow read:   if signedIn() && resource.data.ownerId == me();
  allow create: if signedIn() && request.resource.data.ownerId == me() && validTask(request.resource.data, taskId)
                && ownGoal(request.resource.data.goalId) && validParent(request.resource.data);
  allow update: if signedIn() && resource.data.ownerId == me() && validTask(request.resource.data, taskId)
                && request.resource.data.diff(resource.data).affectedKeys()
                     .hasOnly(['description','notes','priority','dueDate','status','updatedAt','completedAt']);
  allow delete: if signedIn() && resource.data.ownerId == me();
}
```

`getAfter` lets a batch create a parent and child together.

Rules can't enforce the cascade invariant (“a done task has no open descendants”) without unbounded reads. Because data is private, a bypassing client can only make its own tree inconsistent. Selectors therefore treat any open descendant as making its parent non-actionable, so a malformed tree degrades safely. All cross-user access, cross-goal parents and changes to immutable fields **are** enforced by the rules.

### 5.6 Client structure

| File                                    | Responsibility                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/goals.ts`                          | Pure selectors and date helpers: `nextTasks`, `childrenOf`, `descendants`, `ancestors`, `goalProgress`, `momentum(tasks, now)` (7 local-day buckets plus the previous-7 total), `orderGoals`, `dueLabel`, `formatDate`. |
| `src/useGoals.ts`                       | Hook holding `{ goals, tasks }`: `refresh()`, `resnapshot()`, mutations that patch the cache, `pending` changes and the home snapshot.                                                                                  |
| `src/GoalsScreen.tsx`                   | The Goals tab: home (momentum, Up next, goal cards, reached and archived sections), routing to a goal page, task sheets, the goal form and confirmations.                                                               |
| `src/GoalPage.tsx`                      | Header, options menu, segmented switch, task tree and add field.                                                                                                                                                        |
| `src/TaskDetail.tsx`                    | Shared task editor, mounted in a bottom sheet, side sheet or inline panel, plus the breadcrumb.                                                                                                                         |
| `src/GoalForm.tsx`, `src/GoalParts.tsx` | Goal form; goal mark, checkbox, progress bar, task meta, `QuickAdd`, `DatePicker` and `Confirm`.                                                                                                                        |
| `src/Sheet.tsx`                         | Gains `placement: "center" \| "bottom" \| "side"`. `bottom` uses the native slide animation and anchors to the bottom edge with top-only radius.                                                                        |
| `App.tsx`                               | Adds a `"goals"` `Tab` to `navItems` and the render branch. All goal state lives in `useGoals`, so `App.tsx` (already 1,700+ lines) doesn't grow.                                                                       |

**Refresh model:**

- On refresh, `useGoals` stores `homeSnapshot = Map<goalId, taskId[]>`, the top 3 IDs per goal from `nextTasks`.
- Home renders tasks from the snapshot, with live data merged in for status, so done rows show struck through.
- Every completion or undo is added to `pendingChanges`. That set drives the Refresh badge.
- Refresh, or re-entering the tab, refetches `GET /goals`, recomputes the snapshot and clears `pendingChanges`.
- The goal page and task detail always render live, because there is no finger-under-row problem there.
- Returning from a goal page to home re-ranks from local data (`resnapshot`), because it counts as re-entering home.

## 6. Test plan (TDD, per AGENTS.md)

- **`tests/goals.test.ts` (pure):**
  - `nextTasks` includes leaves only, re-includes a parent whose children are all done, and orders by priority, then due date (undated last), then created date, then ID, with a cap of 3.
  - `momentum` covers the 7-day window boundaries, local-day buckets, distinct goal count, week-over-week delta and the zero state.
  - `progress` counts are correct.
- **`tests/domain.test.ts`:**
  - Create, update and delete a goal.
  - Task under a goal and under a parent. Parent in another goal is rejected. Depth above 3 is rejected.
  - Another user's goal returns 404 for read and write.
  - Complete without cascade returns 409 with the open count. Cascade completes the branch. Reopen reopens ancestors. Adding under a done parent reopens it.
  - Deleting a subtree removes all descendants.
  - Field limits are enforced. Legacy state without `goals` still loads.
- **`tests/api.test.ts`:** each route through HTTP, plus persistence across an SQLite restart.
- **`tests/firebase-friends.test.ts` (or a new rules test file) via `npm run test:rules`:**
  - Owner-only read.
  - Creating a task in someone else's goal is denied. A parent from a different goal is denied. A depth mismatch is denied.
  - Changing `ownerId`, `goalId` or `parentId` is denied. Unknown keys are denied.
  - A batch can create a parent and child together.
- **`tests/e2e/goals.spec.ts` at 390 and 1440px:**
  - Empty state, create a goal, quick-add 3 tasks while focus stays in the field.
  - Add a sub-task from task detail.
  - Set priority and a due date, then check Up next order on home.
  - Complete on home: the row stays struck through, the badge shows, Refresh brings in the next task and the momentum sentence updates.
  - Undo works. The cascade confirmation appears.
  - Completed tasks are hidden by default, and the toggle shows them.
  - Retry after a simulated failure.
  - No horizontal overflow at 390px.
- **Manual:** native iOS/Android check of the bottom sheet, keyboard docking and date grid. This is reported separately from responsive web verification.

## 7. Delivery plan

1. **Domain and selectors:** types, `src/goals.ts`, domain methods and unit tests.
2. **Backends:** local API routes and tests, then the Firebase service, rules, indexes and emulator rules tests.
3. **UI core:** Goals tab, home, goal page, quick add, task detail, and the `Sheet` placement variants.
4. **Momentum and polish:** momentum panel, refresh snapshot, date grid, the goal-reached state, the e2e suite, and phone and desktop visual review.
5. **Docs:**
   - `PRODUCT.md`: capabilities, and four primary destinations.
   - `DESIGN.md`: navigation section, and new goal card / task row / momentum / bottom sheet components.
   - `README.md`: the “What works” section.

**Release note:** deploy the new rules and indexes before or with the client, because current rules deny the new collections. This work does not deploy rules or touch live sample data. Seeding a sample goal for Alex would be a separate, explicitly requested step.

## 8. Assumptions (change any before implementation)

- **Momentum counts:** every task that becomes done counts, including cascaded children. The goal count is the number of distinct goals among those tasks. Days use the device's local timezone.
- **Priority levels:** four levels (None, Low, Medium, High). A new task defaults to None.
- **Limits:** a maximum of 50 active goals and 500 tasks per goal.
- **Out of scope for v1:** recurring tasks, reminders and notifications, drag-to-reorder or reparent, search integration, and live multi-device sync. (Sharing has since been added; see §10.) The app already refreshes on action and reload.

## 9. Implementation notes (differences from the proposal)

- **One load for all tasks.** “8 of 15 done” needs counts that include old completed tasks, so `GET /goals` returns all of the owner's tasks. This removed the separate `GET /goals/:id/tasks` call and any need for composite indexes.
- **Batches, not transactions,** for Firebase multi-document writes (see §5.5).
- **Domain clock.** `createService` takes an optional `now()` as its fourth argument, so tests are deterministic.
- **Domain errors.** Foreign goals and tasks return 404 (“Goal not found.” / “Task not found.”). Completing with open descendants and no cascade returns 409 with “This task has N open sub-tasks.” The UI counts open descendants locally and confirms before calling, so it never hits that 409.
- **Nested modals.** iOS presents one modal at a time, so a confirmation raised from the task sheet renders inside that sheet.
- **Tests:**
  - `tests/goals.test.ts` (selectors and date labels)
  - `tests/goals-domain.test.ts`
  - `tests/goals-api.test.ts` (HTTP routes and SQLite restart)
  - `tests/firebase-goals.test.ts` (emulator rules and direct writes; part of `npm run test:rules`)
  - `tests/e2e/goals.spec.ts` (390 and 1440px flows, plus failure and retry)
- **Not verified:** native iOS and Android appearance and behavior (bottom sheet, keyboard docking, date grid, nested modal), and the live Firebase project. Rules have not been deployed.

## 10. Shared goals

Goals work like circles: a goal can be shared with accepted friends, who then collaborate on it.

**Behaviour**

- **When:** while creating a goal (optional “Share with friends” section in the form) or later from the goal page (the person-plus button, the audience line under the header, or Goal options › Share goal).
- **What is shared:** the whole goal, with every task old and new, done and open, so results are visible to everyone in it.
- **Who can do what:**

  | Action                                         | Owner | Member |
  | ---------------------------------------------- | ----- | ------ |
  | See the goal and all its tasks                 | yes   | yes    |
  | Add, edit, complete, reopen and delete tasks   | yes   | yes    |
  | Invite their own accepted friends              | yes   | yes    |
  | Edit settings, mark reached, archive or delete | yes   | no     |
  | Remove other people                            | yes   | no     |
  | Leave the goal                                 | no    | yes    |

- **Objections:** anyone who no longer wants a shared goal can leave it, and the owner can remove anyone. Their earlier work stays with the goal.
- **Attribution:** completing a task records `completedBy`. Others see “Done by {Name}”. Momentum (“You completed …”) counts only the viewer's own completions. Tasks completed before sharing count for the goal owner.
- **Limit:** up to 50 people per goal.

**Data model**

- `Goal.memberIds?: string[]` lists everyone in the goal, owner included. Goals from before sharing have no list and are treated as owner-only (`goalMembers()` in `src/goals.ts`), so they need no migration.
- `GoalTask.ownerId` stays the **goal owner's** id whoever adds the task. The owner still loads every task with one `ownerId` query. `GoalTask.completedBy?: string | null` is set on completion and cleared on reopen.

**API** (both backends; local adds `/api`)

| Method & path                    | Domain method      | Notes                                                                                              |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `POST /goals`                    | `createGoal`       | Optional `memberIds` (accepted friends).                                                           |
| `POST /goals/:id/members`        | `shareGoal`        | Body `{ memberIds }`. Any member; new people must be the caller's accepted friends.                |
| `DELETE /goals/:id/members/:uid` | `removeGoalMember` | The owner removes anyone else; a member removes themself (leave). The owner can't remove themself. |

`GET /goals` returns every goal the person owns or belongs to, with all of their tasks. People outside a goal get 404s, so they can't tell it exists. A member trying an owner-only action gets 403.

**Firebase**

- **Load:** owned goals (`ownerId ==`) plus shared goals (`memberIds array-contains`). Tasks come from the owner query plus one `goalId ==` query per goal shared with the person.
- **Writes:**
  - Membership changes run in a transaction that rereads the goal.
  - Settings updates write only settings fields, so a concurrent invite is never overwritten.
- **Rules:**
  - Goal reads require membership.
  - Goal updates are either an owner settings edit or a membership-only edit. A membership edit can add the editor's accepted friends, remove the editor, or (owner only) remove others. It can never drop the owner.
  - Task reads and writes require membership of the task's goal, checked with a `get()` of the goal. A new task must carry the goal owner's id, and `completedBy` can only name the caller.
- **Release:** deploy the updated rules before or with the client. The old rules reject `memberIds` and `completedBy`.

**Tests:** `tests/goals-sharing.test.ts` (domain), `tests/goals-api.test.ts` (HTTP), `tests/firebase-goal-sharing.test.ts` (emulator rules and direct writes, part of `npm run test:rules`) and `tests/e2e/goal-sharing.spec.ts` (390 and 1440px).
