# mykka.ai — System Architecture

## 0. Real-Time & Polling Update Flow (Detailed)

Two parallel paths — **Console** (SSE, instant) and **Extension** (poll every 2 min):

```mermaid
sequenceDiagram
    autonumber

    participant ADMIN  as Admin<br/>(pretzel-console)
    participant HOOK   as usePolicyRealtime<br/>React hook
    participant SSE_AD as SSESubscriber<br/>sse.adapter.ts
    participant BE     as Backend<br/>(Fastify)
    participant DB     as PostgreSQL<br/>(policies table)
    participant BUS    as policyBus<br/>EventEmitter
    participant EXT_SW as Extension<br/>service-worker.ts
    participant EXT_UC as checkForUpdates()<br/>update-check.ts
    participant EXT_SY as syncPolicy()<br/>sync.ts
    participant EXT_ST as chrome.storage.local

    rect rgb(220, 235, 255)
        Note over HOOK,BE: ── Console SSE connection lifecycle ──
        HOOK->>SSE_AD: realtimeSubscriber.subscribe(getToken, onUpdate)<br/>called once on component mount (useEffect)
        SSE_AD->>BE: GET /v1/events?token={clerkJWT}<br/>EventSource opened (persistent HTTP connection)
        BE->>BE: resolveClerkJwt(token)<br/>validates Clerk JWT → resolves member → tenantId
        BE->>BUS: policyBus.on("policy:updated:{tenantId}", send)
        BE-->>SSE_AD: HTTP 200 + headers:<br/>Content-Type: text/event-stream<br/>X-Accel-Buffering: no<br/>": connected\n\n" (comment frame)
        Note over BE: heartbeat: setInterval 25 s<br/>writes ": ping\n\n" to keep connection alive
    end

    rect rgb(255, 245, 220)
        Note over EXT_SW,EXT_ST: ── Extension alarm registration (on install) ──
        EXT_SW->>EXT_SY: syncPolicy()  ← full sync immediately on install
        EXT_SW->>EXT_SW: chrome.alarms.create("policy-sync", { periodInMinutes: 2 })
    end

    Note over ADMIN,EXT_ST: ════════ Admin clicks Publish ════════

    ADMIN->>BE: POST /v1/policy/publish<br/>Authorization: Bearer {clerkJWT or ps_adm_*}
    BE->>BE: compilePolicy(tenantId)<br/>fetch all subjects + rules + siteConfigs
    BE->>DB: INSERT INTO policies<br/>{ tenantId, version: current+1, policyJson: JSONB }
    DB-->>BE: row inserted (publishedAt = NOW())
    BE->>BUS: policyBus.emit("policy:updated:{tenantId}")
    BE-->>ADMIN: { version: N }

    rect rgb(220, 255, 220)
        Note over BUS,HOOK: ── SSE push path (instant) ──
        BUS->>SSE_AD: send() fires<br/>writes "data: {}\n\n" to HTTP stream
        SSE_AD->>HOOK: EventSource fires 'message' event → onUpdate()
        HOOK->>HOOK: qc.invalidateQueries(['policy'])<br/>qc.invalidateQueries(['policy-history'])<br/>qc.invalidateQueries(['subjects'])
        HOOK->>BE: GET /v1/policy  (React Query auto-refetch)
        BE->>DB: SELECT * FROM policies WHERE tenantId=? ORDER BY version DESC LIMIT 1
        DB-->>BE: latest PolicyRow (policyJson JSONB)
        BE->>BE: resolveMemberPolicy() if req.member present
        BE-->>HOOK: { version, policy, tenantName, plan, expiresAt }
        Note over HOOK: Console UI updates immediately
    end

    rect rgb(255, 220, 220)
        Note over EXT_SW,EXT_ST: ── Extension poll path (up to 2 min delay) ──
        EXT_SW->>EXT_UC: chrome.alarms.onAlarm fires ("policy-sync")<br/>every 2 minutes
        EXT_UC->>BE: GET /v1/policy/last-updates<br/>Authorization: Bearer {ps_live_* token}
        BE->>DB: SELECT MAX(publishedAt) FROM policies WHERE tenantId=?
        DB-->>BE: { publishedAt: timestamp }
        BE-->>EXT_UC: { ts: epoch_ms }  (0 if no policy ever published)

        EXT_UC->>EXT_ST: chrome.storage.local.get('syncedAt')
        EXT_ST-->>EXT_UC: { syncedAt: epoch_ms }  (0 if never synced)

        alt remoteTs <= localTs  →  no change
            EXT_UC->>EXT_UC: return  (no fetch)
        else remoteTs > localTs  →  stale, sync needed
            EXT_UC->>EXT_SY: syncPolicy()

            EXT_SY->>BE: GET /v1/policy/version<br/>Authorization: Bearer {token}
            BE->>DB: SELECT MAX(version) FROM policies WHERE tenantId=?
            DB-->>BE: { version: N }
            BE-->>EXT_SY: { version: N }

            EXT_SY->>EXT_ST: chrome.storage.local.get('cachedPolicyVersion')
            EXT_ST-->>EXT_SY: { cachedPolicyVersion: M }

            alt version N == M  →  already up to date
                EXT_SY->>EXT_SY: return  (skip full fetch)
            else version N != M  →  fetch full policy
                EXT_SY->>BE: GET /v1/policy<br/>Authorization: Bearer {token}
                BE->>DB: SELECT * FROM policies ORDER BY version DESC LIMIT 1
                DB-->>BE: PolicyRow (policyJson JSONB)
                BE->>BE: resolveMemberPolicy() — filter by member team/division
                BE-->>EXT_SY: { version, policy: PolicyDoc, tenantName, plan, expiresAt }

                EXT_SY->>EXT_SY: PolicyDocSchema.safeParse(raw.policy)
                Note over EXT_SY: Zod validation — drops malformed responses

                EXT_SY->>EXT_ST: chrome.storage.local.set({<br/>  policyDoc: parsed,<br/>  cachedPolicyVersion: N,<br/>  subscriptionExpired: false,<br/>  syncedAt: Date.now()<br/>})
            end

            EXT_UC->>EXT_ST: chrome.storage.local.set({ syncedAt: remoteTs })
        end

        alt any fetch returns 402
            EXT_SY->>EXT_ST: chrome.storage.local.set({ subscriptionExpired: true })
            Note over EXT_ST: extension disables enforcement<br/>shows upgrade prompt
        end
    end

    rect rgb(240, 220, 255)
        Note over SSE_AD: ── SSE error / reconnect ──
        SSE_AD->>SSE_AD: EventSource fires 'error'
        alt readyState === CLOSED (non-2xx, e.g. token expired)
            SSE_AD->>SSE_AD: es.close()
            SSE_AD->>SSE_AD: await sleep(1000ms)
            SSE_AD->>BE: GET /v1/events?token={freshClerkJWT}  (reconnect)
        else readyState === CONNECTING (network hiccup)
            SSE_AD->>SSE_AD: EventSource auto-reconnects (browser built-in)
        end

        Note over BE: req.raw.on('close'):<br/>policyBus.off(event, send)<br/>clearInterval(heartbeat)
    end
```

### Key constants from code

| Value | Source | Where |
|---|---|---|
| Alarm period | `periodInMinutes: 2` | [service-worker.ts:27](pretzel/src/background/service-worker.ts#L27) |
| SSE heartbeat | `setInterval(25_000)` | [router.ts:81](backend/src/policy/router.ts#L81) |
| Reconnect delay | `setTimeout(1000)` | [sse.adapter.ts:21](pretzel-console/src/realtime/sse.adapter.ts#L21) |
| policyBus max listeners | `setMaxListeners(1000)` | [policy-bus.ts:4](backend/src/events/policy-bus.ts#L4) |
| SSE event key | `policy:updated:{tenantId}` | [policy-bus.ts:7](backend/src/events/policy-bus.ts#L7) |
| last-updates DB query | `MAX(policies.publishedAt)` | [router.ts:52](backend/src/policy/router.ts#L52) |
| Full sync guard | `cachedPolicyVersion === contentVersion` → skip | [sync.ts:25](pretzel/src/policy/sync.ts#L25) |
| Invalidated queries | `['policy']`, `['policy-history']`, `['subjects']` | [usePolicyRealtime.ts:14](pretzel-console/src/hooks/usePolicyRealtime.ts#L14) |



## 1. High-Level System Overview

```mermaid
graph TB
    subgraph Browser["Browser (End User)"]
        CS[Content Script<br/>intercepts prompts]
        BG[Background<br/>Service Worker]
        POP[Extension Popup]
        CS -->|DETECT message| BG
        POP -->|SYNC_NOW / GET_POLICY| BG
    end

    subgraph AI["AI Sites"]
        GPT[ChatGPT]
        CLA[Claude]
        GEM[Gemini]
    end

    subgraph Console["pretzel-console (Admin SPA)"]
        DASH[Dashboard / Analytics]
        SUBJ[Subjects & Rules Editor]
        ASST[AI Assistant Chat]
        PUB[Publish / History]
        SSE_C[SSE Subscriber<br/>usePolicyRealtime]
    end

    subgraph Backend["backend (Fastify API + PostgreSQL)"]
        AUTH[Auth Middleware<br/>Clerk JWT / ps_* tokens]
        POLICY_R[Policy Router<br/>GET /v1/policy<br/>POST /v1/policy/publish]
        COMPILER[Policy Compiler<br/>compilePolicy]
        RESOLVER[Policy Resolver<br/>resolveMemberPolicy]
        ASSISTANT_SVC[Assistant Service<br/>LLM → actions]
        APPLY[Apply Service<br/>executeActions]
        BUS[policyBus<br/>EventEmitter]
        SSE_S[SSE Stream<br/>GET /v1/events]
        DB[(PostgreSQL<br/>policies / subjects<br/>rules / members<br/>tenants / events)]
        CLERK_WH[Clerk Webhook<br/>user.created/updated]
    end

    subgraph Clerk["Clerk (Auth)"]
        CLERK[Clerk Auth Service]
    end

    subgraph LLM["LLM Providers"]
        ANT[Anthropic]
        OAI[OpenAI]
        GROQ[Groq]
    end

    CS -->|monitors send intent| GPT & CLA & GEM
    BG -->|GET /v1/policy/last-updates<br/>every 2 min| POLICY_R
    BG -->|GET /v1/policy<br/>on version change| POLICY_R
    BG -->|POST /v1/events<br/>scan results| POLICY_R

    Console -->|Clerk JWT Bearer| AUTH
    Browser -->|ps_live_* token| AUTH
    AUTH --> POLICY_R
    POLICY_R --> COMPILER --> DB
    POLICY_R --> RESOLVER --> DB
    POLICY_R -->|publishPolicy| BUS
    BUS -->|emit policy:updated| SSE_S
    SSE_S -->|event stream| SSE_C
    SSE_C -->|invalidate React Query| SUBJ & PUB

    ASST -->|POST /v1/assistant/chat| ASSISTANT_SVC
    ASSISTANT_SVC -->|API call| ANT & OAI & GROQ
    ASSISTANT_SVC --> DB
    ASST -->|POST /v1/assistant/apply| APPLY
    APPLY --> DB

    CLERK -->|webhook| CLERK_WH --> DB
    Console -->|Clerk session| CLERK
    Browser -.->|optional login| CLERK
```

---

## 2. Policy Publish Flow

```mermaid
sequenceDiagram
    participant Admin as Admin (Console)
    participant BE as Backend
    participant DB as PostgreSQL
    participant BUS as policyBus
    participant SSE as SSE /v1/events
    participant CON as Console SSE hook
    participant EXT as Extension (bg)

    Admin->>BE: POST /v1/policy/publish
    BE->>DB: compilePolicy() — fetch subjects, rules, siteConfigs
    DB-->>BE: compiled PolicyDoc
    BE->>DB: INSERT policies (new version, JSONB)
    BE->>BUS: emit policy:updated:{tenantId}
    BUS-->>SSE: broadcast {} to all clients
    SSE-->>CON: message event
    CON->>CON: invalidate React Query caches
    CON->>BE: GET /v1/policy (refetch)
    BE-->>CON: updated PolicyDoc

    Note over EXT: alarm fires every 2 min
    EXT->>BE: GET /v1/policy/last-updates
    BE-->>EXT: { lastUpdatedAt: timestamp }
    EXT->>EXT: compare to cached syncedAt
    EXT->>BE: GET /v1/policy (version changed)
    BE->>DB: resolveMemberPolicy() — scope by team/division
    DB-->>BE: scoped PolicyDoc
    BE-->>EXT: PolicyDoc
    EXT->>EXT: chrome.storage.local.policyDoc = …
```

---

## 3. Prompt Detection Flow

```mermaid
sequenceDiagram
    participant User
    participant Page as AI Site (ChatGPT etc)
    participant CS as Content Script
    participant BG as Background Script
    participant STOR as chrome.storage.local
    participant BE as Backend

    User->>Page: types prompt, clicks Send
    Page->>CS: onSendIntent fires (adapter hook)
    CS->>CS: readPromptText() via adapter
    CS->>BG: DETECT { promptText, url, pasteDetected }
    BG->>STOR: loadPolicy()
    STOR-->>BG: PolicyDoc (cached)
    BG->>BG: detectPrompt(text, policy)
    Note over BG: 1. Regex (PII, entropy, keys)<br/>2. Keyword fuzzy match<br/>3. Score rules (paste, length…)
    BG-->>CS: DetectionResult { findings, highestAction }

    alt highestAction = warn | block
        CS->>User: show modal (warn/block/edit)
        User->>CS: confirm / edit / cancel
        CS->>BG: dispatchScan + dispatchEvent
        BG->>BE: POST /v1/events (audit)
        BE-->>BG: 200
    else no findings
        CS->>Page: allow send
    end
```

---

## 4. AI-Assisted Rule Creation Flow

```mermaid
sequenceDiagram
    participant Admin
    participant CON as Console
    participant BE as Backend
    participant DB as PostgreSQL
    participant LLM as LLM (Anthropic/OpenAI)

    Admin->>CON: types in assistant: "block API keys"
    CON->>BE: POST /v1/assistant/chat { message, sessionId }
    BE->>DB: fetchOrgSnapshot() — divisions, teams, subjects, rules
    DB-->>BE: full org state
    BE->>LLM: system prompt (org state) + user message
    LLM-->>BE: reply + actions [ create_subject, create_rule, … ]
    BE->>DB: INSERT chatMessages (reply + actions JSON)
    BE-->>CON: { reply, actions, messageId }
    CON->>Admin: show suggested rules preview

    Admin->>CON: clicks Apply
    CON->>BE: POST /v1/assistant/apply { messageId }
    BE->>DB: executeActions() — create/update/delete subjects+rules
    DB-->>BE: applied[] + errors[]
    BE-->>CON: { applied, errors }

    Note over Admin,CON: Policy NOT auto-published!
    Admin->>CON: reviews changes, clicks Publish
    CON->>BE: POST /v1/policy/publish
    Note over BE,DB: → same as Policy Publish flow above
```

---

## 5. Backend Internals

```mermaid
graph TD
    subgraph Routes["API Routes (/v1/*)"]
        R_POL[policy/router.ts<br/>GET /policy<br/>GET /policy/version<br/>GET /policy/last-updates<br/>POST /policy/publish<br/>GET /policy/history<br/>POST /policy/rollback/:v<br/>GET /events SSE]
        R_SUBJ[subjects/router.ts<br/>CRUD subjects + rules]
        R_MEMBERS[members / teams /<br/>divisions / invites]
        R_ASST[assistant/router.ts<br/>POST /chat, /apply]
        R_ANALY[analytics + audit-log]
        R_SITE[site-configs/router.ts]
        R_BILL[billing/router.ts]
    end

    subgraph AuthLayer["Auth Middleware"]
        AM_ORG[requireOrgTokenOrClerkAuth<br/>ps_live_* OR Clerk JWT]
        AM_ADM[requireAdminTokenOrClerkAdmin<br/>ps_adm_* OR Clerk super_admin]
        AM_SUB[requireActiveSubscription<br/>blocks if expired]
        TOK[tokens.ts<br/>parse + bcrypt compare]
        CLERK_V[resolveClerkJwt<br/>clerkId → user → member]
    end

    subgraph PolicyEngine["Policy Engine"]
        COMP[compiler.ts<br/>compilePolicy<br/>subjects+rules+siteConfigs → PolicyDoc]
        RES[resolver.ts<br/>resolveMemberPolicy<br/>filter by team/division scope<br/>dedup rules, expand destGroups]
        PUB[publishPolicy<br/>INSERT + emit policyBus]
        BUS2[policyBus<br/>EventEmitter<br/>policy:updated:{tenantId}]
    end

    subgraph AssistantEngine["Assistant Engine"]
        CHAT[service.ts<br/>buildSystemPrompt<br/>call LLM<br/>store messages]
        APPL[apply.ts<br/>executeActions<br/>batch create/update/delete]
        SVR[subject-versions.ts<br/>snapshot for rollback]
    end

    subgraph DBSchema["PostgreSQL Schema (Drizzle)"]
        T_TEN[tenants<br/>subscription, tokens]
        T_USR[users + members<br/>roles: super_admin<br/>division_admin, member]
        T_SUBJ[subjects<br/>scope: global/division/team]
        T_RULES[rules<br/>kind: keyword/pattern/entropy/score<br/>action: warn/block]
        T_POL[policies<br/>version, JSONB snapshot]
        T_DEST[destinationGroups<br/>domain arrays]
        T_SITE[siteConfigs<br/>CSS selectors per AI site]
        T_SESS[chatSessions + chatMessages<br/>LLM conversation history]
        T_AUDIT[events + scans<br/>analytics]
        T_VERS[subjectVersions<br/>rollback snapshots]
    end

    R_POL --> AM_ORG --> PolicyEngine
    R_POL --> AM_ADM --> PolicyEngine
    R_SUBJ --> AM_ADM --> DBSchema
    R_ASST --> AM_ADM --> AssistantEngine
    R_MEMBERS --> AM_ADM --> DBSchema
    AM_ORG --> TOK & CLERK_V
    AM_ADM --> TOK & CLERK_V
    AM_ORG --> AM_SUB

    COMP --> T_SUBJ & T_RULES & T_SITE & T_DEST
    RES --> T_SUBJ & T_RULES & T_DEST
    PUB --> T_POL
    PUB --> BUS2

    CHAT --> T_SESS
    APPL --> T_SUBJ & T_RULES
    APPL --> SVR --> T_VERS
```

---

## 6. Extension Internals

```mermaid
graph TD
    subgraph BG["Background Service Worker"]
        SW[service-worker.ts<br/>onInstalled → syncPolicy + alarm<br/>onAlarm → checkForUpdates]
        MSG[Message Handler<br/>DETECT / GET_POLICY<br/>SYNC_NOW / TOGGLE_SITE<br/>GET_SUBSCRIPTION_STATUS]
        SYNC[policy/sync.ts<br/>syncPolicy<br/>GET /v1/policy/version<br/>→ GET /v1/policy if changed]
        UPD[update-check.ts<br/>checkForUpdates<br/>GET /v1/policy/last-updates<br/>compare syncedAt]
        DET[detection/engine.ts<br/>detectPrompt<br/>3-layer detection]
        DISP[dispatcher.ts<br/>dispatchScan<br/>dispatchEvent<br/>POST /v1/events]
        LOAD[policy/loader.ts<br/>loadPolicy<br/>bridgePolicy by disabled sites]
    end

    subgraph STOR["chrome.storage.local"]
        S1[policyDoc]
        S2[cachedPolicyVersion]
        S3[syncedAt]
        S4[subscriptionExpired]
        S5[orgToken]
        S6[clerkSessionToken]
        S7[mykka-disabled-sites]
    end

    subgraph MANAGED["chrome.storage.managed (MDM)"]
        M1[orgToken — MDM deploy]
    end

    subgraph CS["Content Script (per tab)"]
        CONT[content-script.ts<br/>detect paste events<br/>intercept onSendIntent]
        MOD[modal.ts<br/>warn/block overlay<br/>edit / send_anyway / cancel]
        ADP[Site Adapters<br/>ChatGPT / Claude / Gemini<br/>findComposer readPromptText<br/>onSendIntent]
    end

    subgraph POP["Popup"]
        POPUP[popup/index.tsx<br/>show status, manual sync<br/>org token entry, disable site]
    end

    subgraph BE_EXT["Backend API"]
        API1[GET /v1/policy/last-updates]
        API2[GET /v1/policy]
        API3[POST /v1/events]
    end

    SW -->|every 2 min alarm| UPD
    SW -->|on install| SYNC
    UPD -->|if stale| SYNC
    SYNC -->|read token| M1 & S5
    SYNC -->|lightweight check| API1
    SYNC -->|full fetch| API2
    SYNC -->|store| S1 & S2 & S3 & S4

    MSG --> DET & LOAD & SYNC
    LOAD --> S1 & S7
    DET --> DISP
    DISP -->|log scan| API3

    CONT -->|monitor| ADP
    CONT -->|DETECT| MSG
    MSG -->|result| CONT
    CONT -->|findings| MOD

    POP -->|SYNC_NOW / TOGGLE_SITE| MSG
    POP -->|GET_POLICY| MSG

    DET -->|3 layers| L1[1. Regex patterns<br/>PII / keys / entropy]
    DET --> L2[2. Fuzzy keyword match<br/>dictionary lookup]
    DET --> L3[3. Score rules<br/>paste_detected / long_text<br/>legal_terms / formal_heading]
```

---

## 7. Admin Console Internals

```mermaid
graph TD
    subgraph Pages["Pages (Next.js App Router)"]
        P_DASH[/ — Dashboard<br/>analytics summary]
        P_SUBJ[/subjects — Rules Editor<br/>create/edit/delete<br/>subjects + rules]
        P_MEM[/members — Team<br/>invite, roles]
        P_AUDIT[/audit — Event Log<br/>rule triggers, actions]
        P_SET[/settings — Org<br/>token rotation, name]
        P_ASST[/assistant — AI Chat<br/>suggest + apply rules]
        P_PUB[/publish — Policy<br/>preview, history, rollback]
    end

    subgraph Realtime["Real-Time (SSE)"]
        SSE_AD[sse.adapter.ts<br/>SSESubscriber<br/>connect /v1/events<br/>auto-reconnect 1s]
        RT_HOOK[usePolicyRealtime.ts<br/>subscribe on mount<br/>pass Clerk getToken]
        INVAL[invalidate queries<br/>policy + policy-history<br/>+ subjects]
    end

    subgraph Hooks["React Query Hooks"]
        H_SUBJ[useSubjects<br/>useRules]
        H_ORG[useDivisions<br/>useTeams<br/>useMembers]
        H_POL[usePolicy<br/>usePolicyHistory]
        H_ASST[useAssistant<br/>useAssistantSessions]
        H_ANALY[useAnalytics<br/>useAuditLog]
    end

    subgraph API["API Client (api.ts)"]
        REQ[request helper<br/>inject Bearer token<br/>Clerk JWT / local storage]
        ENDPOINTS[subjects / rules<br/>policy / publish / rollback<br/>assistant / apply<br/>analytics / audit-log<br/>members / invites<br/>tenant / billing]
    end

    subgraph Auth["Auth (Clerk)"]
        CL_HOOK[useAuth / useUser<br/>Clerk React hooks]
        CL_TOK[getToken()<br/>Clerk session JWT]
        REQ_AUTH[RequireAuth.tsx<br/>redirect if not authed]
    end

    Pages --> Hooks
    P_SUBJ --> H_SUBJ
    P_DASH --> H_ANALY
    P_MEM --> H_ORG
    P_PUB --> H_POL
    P_ASST --> H_ASST

    Hooks --> API
    API --> REQ
    REQ --> CL_TOK

    RT_HOOK --> SSE_AD
    SSE_AD -->|message event| INVAL
    INVAL --> H_POL & H_SUBJ

    CL_HOOK --> CL_TOK
    REQ_AUTH --> CL_HOOK

    REQ -->|GET POST PATCH DELETE| BACKEND[(Backend /v1/*)]
```

---

## 8. Auth & Token Flow

```mermaid
graph LR
    subgraph Tokens["Token Types"]
        ORG[ps_live_{slug}_{secret}<br/>Org token — extension use]
        ADM[ps_adm_{slug}_{secret}<br/>Admin token — console use]
        CLERK_J[Clerk JWT<br/>console + optional extension]
    end

    subgraph Validation["Backend Validation"]
        PARSE[parse token prefix<br/>ps_live / ps_adm / Bearer]
        HASH[bcrypt.compare<br/>secret vs stored hash]
        CLERK_V2[resolveClerkJwt<br/>clerkId → users → members]
        SUB_CHK[requireActiveSubscription<br/>401 if expired grace]
    end

    subgraph Storage["Where Tokens Live"]
        MDM[chrome.storage.managed<br/>MDM enterprise deploy]
        LOC_EXT[chrome.storage.local<br/>manual entry]
        LOCAL_S[localStorage<br/>console auth]
        CLERK_S[Clerk session store]
    end

    ORG -->|in Authorization header| PARSE
    ADM -->|in Authorization header| PARSE
    CLERK_J -->|Bearer in Authorization| PARSE
    PARSE --> HASH
    PARSE --> CLERK_V2
    HASH --> SUB_CHK
    CLERK_V2 --> SUB_CHK

    MDM --> ORG
    LOC_EXT --> ORG
    LOCAL_S --> ADM
    CLERK_S --> CLERK_J
```

---

## Component Responsibility Summary

| Component | Role | Auth | Real-Time |
|---|---|---|---|
| **backend** | API, policy compilation, LLM orchestration, DB | Clerk JWT + `ps_*` tokens (bcrypt) | SSE broadcast via policyBus |
| **pretzel** (extension) | Prompt interception, local detection, scan logging | `ps_live_*` org token | 2-min poll `GET /policy/last-updates` |
| **pretzel-console** | Rule authoring, AI assistant, analytics, publish | Clerk JWT | SSE subscriber → React Query invalidation |

## Key Timing / Sync Facts

- Extension polls every **2 minutes** (chrome.alarms)
- Full policy sync only if `lastUpdatedAt > syncedAt` (version gate)
- Console gets updates **instantly** via SSE on publish
- AI-applied rule changes are **not auto-published** — admin must click Publish
- Subscription expiry: extension gets 402 → sets `subscriptionExpired` flag locally
