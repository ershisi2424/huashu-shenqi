# Anchor Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow a new主播 to choose an active运营 during registration, remain pending until that运营 approves, and then log in with the assigned account.

**Architecture:** Keep the existing `users` table and session model. Add a public, privacy-safe active-operator directory; create pending anchor users with `operator_id`; expose operator-only pending-anchor approval actions; extend the mobile login page with a role switch and operator selector.

**Tech Stack:** Next.js Pages Router API routes, React, CSS Modules, better-sqlite3, Node `assert` contract tests.

---

### Task 1: Define the data and API contracts with failing tests

**Files:**
- Modify: `test-auth-store.cjs`
- Modify: `test-auth-api.cjs`
- Modify: `test-auth-ui.cjs`
- Modify: `test-admin-ui.cjs`
- Modify: `package.json`

- [x] **Step 1: Add store assertions for active-operator directory and pending anchor approval**

Add a pending anchor registration under an approved operator, assert it cannot authenticate, assert the operator can approve it, and assert a different operator cannot approve it.

- [x] **Step 2: Add handler assertions for public operator options and anchor registration**

Exercise `GET /api/auth/operators`, `POST /api/auth/register` with `{ role: "anchor", operatorId }`, and the operator-only pending-anchor approval route.

- [x] **Step 3: Add UI contract tokens**

Require the login page to contain主播注册,运营选择, `/api/auth/operators/`, and pending-approval copy; require the admin page to contain pending主播 approval copy.

- [x] **Step 4: Add the new tests to `npm test`**

Run `npm test` and confirm the new tests fail because the behavior and routes do not exist yet.

### Task 2: Implement SQLite registration and approval rules

**Files:**
- Modify: `lib/auth-store.cjs`
- Modify: `pages/api/auth/register.js`
- Create: `pages/api/auth/operators.js`
- Create: `pages/api/auth/anchor-approvals.js`

- [x] **Step 1: Add safe operator listing**

Return only active operators with id, name, and a masked phone; never return password hashes, pending operators, or full phone numbers.

- [x] **Step 2: Add pending anchor application**

Validate phone/name/password/operatorId, require the selected operator to be active, create role `anchor` with status `pending` and that operator as `operator_id`, and audit the request.

- [x] **Step 3: Add operator-scoped approval**

Allow only the assigned active operator to approve or reject its pending anchors. Approving changes status to active; rejecting changes status to disabled. Return explicit error codes for missing, wrong-owner, and non-pending cases.

- [x] **Step 4: Preserve existing operator registration and direct operator-created anchor behavior**

Do not change the current operator pending/super-admin approval flow or the existing direct `POST /api/auth/anchors` flow.

- [x] **Step 5: Run focused store and API tests**

Run `node test-auth-store.cjs && node test-auth-api.cjs` and confirm green.

### Task 3: Build the mobile registration experience

**Files:**
- Modify: `components/auth/LoginWorkspace.js`
- Modify: `components/auth/auth.module.css`

- [x] **Step 1: Add role tabs**

Keep login as the first tab, add `运营注册` and `主播注册`, and make the selected role explicit in the form heading and submit button.

- [x] **Step 2: Load active operators only for主播注册**

Fetch `/api/auth/operators/` on entering主播注册, show a loading state and an empty/error state, and require the user to choose an operator before submitting.

- [x] **Step 3: Submit the correct payload and explain pending state**

Send `{ role: "anchor", operatorId, phone, name, password }`; show that the selected运营 must approve before login; keep return-to behavior for successful login.

- [x] **Step 4: Preserve phone-friendly touch targets and feedback**

Use the existing CSS Module, add focus/disabled/loading/empty/error styles only where needed, and avoid exposing complete operator phone numbers.

- [x] **Step 5: Run UI contract tests and production build**

Run `node test-auth-ui.cjs && npm run build`.

### Task 4: Add operator approval controls to the management page

**Files:**
- Modify: `components/admin/AdminWorkspace.js`
- Modify: `components/admin/admin.module.css`

- [x] **Step 1: Load operator-scoped pending anchors**

For operator accounts, fetch `/api/auth/anchor-approvals/`; for super-admin accounts, keep the existing operator approval workflow unchanged.

- [x] **Step 2: Add approve/reject actions with immediate feedback**

Render pending主播 cards with name, masked phone, registration time, and approve/reject actions; update the list after success and show an error on failure.

- [x] **Step 3: Add mobile layout and empty states**

Keep the existing responsive layout, ensuring the pending-anchor section is readable on a phone and buttons expose loading/disabled feedback.

- [x] **Step 4: Run admin UI and full tests**

Run `node test-admin-ui.cjs && npm test`.

### Task 5: Verify and document the flow

**Files:**
- Modify: `README.md`
- Modify: `/Users/a24/Documents/ChatGPT/ai大哥维护系统/task_plan.md`
- Modify: `/Users/a24/Documents/ChatGPT/ai大哥维护系统/progress.md`

- [x] **Step 1: Document the end-to-end flow**

Document: active运营 directory →主播申请 → assigned运营 approve/reject →主播 login; clarify that pending accounts cannot enter chat and that super-admin approval is still only for运营 registration.

- [x] **Step 2: Run final verification**

Run `npm test`, `npm run build`, `git diff --check`, and a real temporary HTTP flow using an isolated SQLite file.

- [x] **Step 3: Confirm the local page remains available**

Keep the main production server on port `3102` running and verify `/login/`, `/chat/`, `/admin/`, and `/api/health/` respond.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| UI workflow could not load `/Users/a24/.agents/skills/ui-assets/assets/style-presets.json` | UI起手包 | Continued with the existing mobile login visual system and ran static/runtime UI checks. |
| Temporary HTTP verification parsed a file path as JSON input | First isolated approval flow | Restarted with a new isolated port/database and read the response file with `fs.readFileSync`. |
