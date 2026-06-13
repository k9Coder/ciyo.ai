# Admin Console Design

**Date:** 2026-05-17  
**Status:** Approved

## Overview

React SPA admin console for PromptShield. Replaces the current stub (`admin/`) with a fully functional interface for managing subjects/rules, org structure, destination groups, site configs, policy publishing, and settings. Talks to the existing Fastify backend at `http://localhost:3000` (configurable via `VITE_API_BASE`).

Auth: `ps_adm_` token stored in `localStorage`, sent as `Authorization: Bearer` on every request. 401 clears token and redirects to `/login`.

---

## Navigation

Left dark sidebar (always visible, fixed width ~200px), content area takes remaining width.

Sidebar items (top to bottom):
1. Subjects & Rules (`/subjects`) — default route
2. Org Structure (`/org`)
3. Destination Groups (`/destinations`)
4. Site Configs (`/sites`)
5. Publish (`/publish`)
6. Settings (`/settings`)

Active item highlighted. Logo/product name at top. No sub-navigation — each sidebar item maps directly to a page.

---

## Component Library (`admin/src/components/ui/`)

Generic primitives with zero page-specific logic. Every page composes from these.

### `SplitPane`
Fixed-width left panel + flexible right panel. Props: `left: ReactNode`, `right: ReactNode`, `leftWidth?: number` (default 260px). Used by Subjects & Rules.

### `MillerColumns`
Generic N-column drill-down (Miller/cascade columns). Props:
```ts
interface MillerColumnDef {
  title: string;
  items: { id: string; label: string; sublabel?: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
}
columns: MillerColumnDef[]
```
Each column scrolls independently. Selected item highlighted in blue. Columns after the last selection show an empty state.

### `EntityModal`
Modal shell for all CRUD forms. Props: `title`, `open`, `onClose`, `onSave`, `saving`, `children`. Save button shows spinner when `saving=true`. Cancel always closes without saving. Children render the form body.

### `ConfirmModal`
Delete confirmation dialog. Props: `open`, `onClose`, `onConfirm`, `confirming`, `message`. Renders a red "Delete" button and a "Cancel" button.

### `Badge`
Colored pill label.
```ts
variant: "keyword" | "pattern" | "entropy" | "score" | "warn" | "block"
```
Color map: keyword=amber, pattern=red, entropy=violet, score=blue, warn=yellow, block=red (darker).

### `EmptyState`
Centered placeholder. Props: `icon`, `title`, `description`, `action?: { label, onClick }`.

### `PageHeader`
`<h1>` title + right-aligned primary action slot. Props: `title`, `action?: ReactNode`.

### `Toggle`
Accessible on/off switch. Props: `checked`, `onChange`, `disabled?`. Uses native `<button role="switch">`.

---

## Data Layer

### `admin/src/api.ts`
Typed fetch wrapper. Base URL from `import.meta.env.VITE_API_BASE`. Auth token injected from `localStorage`. Throws `ApiError` (with `status` and `message`) on non-2xx.

One function per operation:
```ts
// Subjects
getSubjects(): Promise<Subject[]>
createSubject(data): Promise<Subject>
updateSubject(id, data): Promise<Subject>
deleteSubject(id): Promise<void>

// Rules
getRules(subjectId): Promise<Rule[]>
createRule(subjectId, data): Promise<Rule>
updateRule(id, data): Promise<Rule>
deleteRule(id): Promise<void>

// Divisions
getDivisions(): Promise<Division[]>
createDivision(data): Promise<Division>
updateDivision(id, data): Promise<Division>
deleteDivision(id): Promise<void>

// Teams
getTeams(divisionId): Promise<Team[]>
createTeam(divisionId, data): Promise<Team>
updateTeam(id, data): Promise<Team>
deleteTeam(id): Promise<void>

// Members
getMembers(teamId): Promise<Member[]>
createMember(teamId, data): Promise<Member>
updateMember(id, data): Promise<Member>
deleteMember(id): Promise<void>

// Destination Groups
getDestinationGroups(): Promise<DestinationGroup[]>
createDestinationGroup(data): Promise<DestinationGroup>
updateDestinationGroup(id, data): Promise<DestinationGroup>
deleteDestinationGroup(id): Promise<void>

// Site Configs
getSiteConfigs(): Promise<SiteConfig[]>
createSiteConfig(data): Promise<SiteConfig>
updateSiteConfig(id, data): Promise<SiteConfig>
deleteSiteConfig(id): Promise<void>

// Policy
getPolicy(): Promise<PolicyDoc>
publishPolicy(): Promise<{ version: number }>
getPolicyHistory(): Promise<PolicyVersion[]>

// Settings
getTenant(): Promise<Tenant>
updateTenant(data): Promise<Tenant>
regenerateAdminToken(): Promise<{ token: string }>
```

### `admin/src/hooks/`
One TanStack Query hook file per resource. Each exposes a `use<Resource>` query hook and `use<Resource>Mutations` hook (create/update/delete, each invalidates relevant query keys on success). Example:

```ts
// hooks/useSubjects.ts
export function useSubjects() { return useQuery({ queryKey: ['subjects'], queryFn: api.getSubjects }) }
export function useSubjectMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['subjects'] });
  return {
    create: useMutation({ mutationFn: api.createSubject, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => api.updateSubject(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: api.deleteSubject, onSuccess: invalidate }),
  }
}
```

### `admin/src/hooks/useToast.ts`
Simple toast system. `useToast()` returns `{ toast }` where `toast({ message, variant: 'success'|'error' })` shows a fixed-position notification that auto-dismisses after 3s. A `<ToastContainer>` renders active toasts.

---

## Pages

### Subjects & Rules (`/subjects`)

`SplitPane`:
- **Left — SubjectList:** List of subjects. Each item shows name + scope badge. Active item highlighted. "+ New Subject" button at bottom → `EntityModal<SubjectForm>`.
- **Right — RulesPanel:** Header "Rules — {subject name}" + "+ Add Rule". If no subject selected, `EmptyState`. Rules rendered as cards: `<Badge variant={kind}>` + value summary + action (`warn`/`block` badge) + edit/delete icons.

**SubjectForm fields:** name (text), scope (select: global / division / team), scopeId (shown when scope ≠ global; dependent select populated from divisions/teams).

**RuleForm fields:** kind (select: keyword / pattern / entropy / score). Then dynamic fields:
- `keyword`: keywords (textarea, comma-separated → stored as `string[]`), action (warn/block), optional destinationGroupIds (multi-select)
- `pattern`: regex (text, monospace), action (warn/block), message (optional), optional destinationGroupIds
- `entropy`: action (warn/block), config JSON field (textarea, advanced — backend stores as JSONB `config`)
- `score`: action (warn/block), config JSON field (textarea, advanced — backend stores as JSONB `config`)

### Org Structure (`/org`)

`MillerColumns` with 3 columns:
1. **Divisions** — list of divisions + "+ New Division"
2. **Teams** — teams in selected division + "+ New Team" (empty state if no division selected)
3. **Members** — members of selected team + "+ Add Member" (empty state if no team selected)

Each item has edit (pencil) and delete (trash) icon buttons on hover. Add/edit uses `EntityModal`. Delete uses `ConfirmModal`.

**DivisionForm:** name only.  
**TeamForm:** name only.  
**MemberForm:** name, email, externalId (optional).

### Destination Groups (`/destinations`)

`PageHeader` title "Destination Groups" + "+ New Group" button.

Card grid (or table) — each card: group name (bold), description (muted), created date. Edit and delete icon buttons. `EntityModal<DestinationGroupForm>` for add/edit.

**DestinationGroupForm fields:** name (text), domains (textarea, one domain per line — stored as `string[]`), divisionId (optional select), teamId (optional select).

### Site Configs (`/sites`)

`PageHeader` title "Site Configs" + "+ New Site" button.

Table: domain | inputSelector | sendButtonSelector | Edit | Delete.  
`EntityModal<SiteConfigForm>` for add/edit. PATCH keyed by domain (URL segment).

**SiteConfigForm fields:** domain (text), inputSelector (text, CSS selector for the chat input), sendButtonSelector (text, CSS selector for the send button).

### Policy / Publish (`/publish`)

Two sections:
1. **Current draft** — summary of subjects/rules counts, "Publish" button. On click: `publishPolicy()` with loading state, success toast "Policy published (v{N})".
2. **Published versions** — table of past publishes: version number, timestamp, "View" to see the raw JSON in a read-only modal.

### Settings (`/settings`)

Two sections:
1. **Organization** — tenant name (editable inline or via form + Save button), plan name (read-only).
2. **Admin Token** — masked token (`ps_adm_••••••••`), copy-to-clipboard button, "Regenerate" button → `ConfirmModal` warning then `regenerateAdminToken()`, shows new token once in a dismissable alert.

---

## Auth / Login

`/login` — simple centered card: "Admin Token" text input + "Sign in" button. On submit: `GET /v1/subjects` with the token as probe; if 200, save token to `localStorage` and redirect to `/subjects`. If 401, show "Invalid token" error.

Route guard: `<RequireAuth>` wrapper checks `localStorage` for token. If absent, redirects to `/login`.

---

## Error Handling

- TanStack Query `onError` in mutation hooks → call `toast({ message: err.message, variant: 'error' })`
- Page-level `isError` states show `EmptyState` with retry button
- 401 from any API call → clear token + redirect to `/login`

---

## File Structure

```
admin/src/
  components/
    ui/
      SplitPane.tsx
      MillerColumns.tsx
      EntityModal.tsx
      ConfirmModal.tsx
      Badge.tsx
      EmptyState.tsx
      PageHeader.tsx
      Toggle.tsx
      ToastContainer.tsx
    layout/
      AppLayout.tsx       ← sidebar + outlet
      RequireAuth.tsx     ← route guard
  hooks/
    useToast.ts
    useSubjects.ts
    useRules.ts
    useDivisions.ts
    useTeams.ts
    useMembers.ts
    useDestinationGroups.ts
    useSiteConfigs.ts
    usePolicy.ts
    useTenant.ts
  pages/
    SubjectsPage.tsx
    OrgPage.tsx
    DestinationsPage.tsx
    SitesPage.tsx
    PublishPage.tsx
    SettingsPage.tsx
    LoginPage.tsx
  api.ts
  types.ts               ← shared TS types mirroring backend shapes
  App.tsx                ← router setup
  main.tsx
```

---

## Testing

- Unit tests for `api.ts` (mock fetch, verify headers/URLs/error throwing)
- Unit tests for `MillerColumns` (column population, selection state)
- Unit tests for `RuleForm` (dynamic fields render correctly per kind)
- Integration-style tests for `SubjectsPage` (mock hooks, verify CRUD flow)
