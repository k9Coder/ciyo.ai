---
status: draft
owner: platform
---

# GCP hosting spec (backend, console, mykka-web)

One project, one region, all three Dockerized services on Cloud Run. DB stays
on Neon (already the locked infra choice, has its own free tier — no reason
to move it to Cloud SQL, which isn't free). `pretzel` (extension) and
`pretzel-desktop` are not hosted here — they're store/blob-distributed
artifacts, unaffected by this move.

## Why Cloud Run

- Scales to zero — $0 compute while idle, not just "cheap."
- One project = one bill = one budget to cap, across all three services.
- Same Dockerfiles already in the repo (`backend/Dockerfile`,
  `pretzel-console/Dockerfile`, `mykka-web/Dockerfile`) — no rewrite needed.

## Cost model

| Service | Idle cost | Under load |
|---|---|---|
| mykka-backend | $0 (minScale 0) | ~$0.000024/vCPU-sec + $0.0000025/GiB-sec while handling requests |
| mykka-console | $0 (minScale 0) | static nginx, trivial CPU time per request |
| mykka-web | $0 (minScale 0) | same billing model as backend |

Free tier (per month, forever, not a trial): 2M requests, 360k vCPU-sec,
180k GiB-sec, 1GB egress to North America. Realistic pilot-scale traffic
should sit inside the free tier or a few dollars over it — the $50 ceiling
is a backstop, not the expected steady state.

`maxScale: 2` on every service (see the three `*-service.yaml` files) bounds
worst-case spend even before the budget guard fires — a traffic spike or bug
can burn at most 2 instances' worth of compute, not runaway.

## One-time setup

```bash
PROJECT_ID=mykka-ai
REGION=us-central1

gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbilling.googleapis.com \
  cloudfunctions.googleapis.com pubsub.googleapis.com

gcloud artifacts repositories create mykka --repository-format=docker \
  --location=$REGION
```

### Secrets (backend only needs these at runtime — see backend-service.yaml)

```bash
echo -n "$DATABASE_URL"          | gcloud secrets create backend-database-url --data-file=-
echo -n "$CLERK_SECRET_KEY"      | gcloud secrets create backend-clerk-secret-key --data-file=-
echo -n "$CLERK_WEBHOOK_SECRET"  | gcloud secrets create backend-clerk-webhook-secret --data-file=-
echo -n "$INTERNAL_SECRET"       | gcloud secrets create backend-internal-secret --data-file=-
```

Console and web bake their public config in at build time (existing Dockerfile
ARGs) — nothing to put in Secret Manager for them.

### Build & push images

```bash
for svc in backend:mykka-backend pretzel-console:mykka-console mykka-web:mykka-web; do
  dir="${svc%%:*}"; name="${svc##*:}"
  gcloud builds submit "$dir" \
    --tag "$REGION-docker.pkg.dev/$PROJECT_ID/mykka/${name#mykka-}:latest"
done
```

### Deploy

Replace `REGION`/`PROJECT_ID` placeholders in the three YAML files, then:

```bash
gcloud run services replace deploy/gcp/backend-service.yaml --region=$REGION
gcloud run services replace deploy/gcp/console-service.yaml --region=$REGION
gcloud run services replace deploy/gcp/web-service.yaml --region=$REGION

# make them publicly reachable
for s in mykka-backend mykka-console mykka-web; do
  gcloud run services add-iam-policy-binding $s --region=$REGION \
    --member=allUsers --role=roles/run.invoker
done
```

Custom domains (`api.mykka.ai`, `pretzel-console.mykka.ai`, `mykka.ai`) attach via
`gcloud beta run domain-mappings create` — free, just DNS records pointed at
Cloud Run.

## The $50 ceiling

GCP has no "hard stop at $X" toggle — this is true of every cloud, not a GCP
gap. What it has is budget alerts you can wire to an action. Here that action
is `budget-guard/`: a Cloud Function that, when spend crosses the budget,
pulls the public `allUsers` invoker binding off all three Cloud Run services.
Traffic stops (so does further spend), but nothing is deleted — deploys,
images, and revisions are untouched. Reversible in one command
(`budget-guard/restore.sh`) once you've looked at why it fired.

```bash
gcloud billing budgets create \
  --billing-account=$BILLING_ACCOUNT_ID \
  --display-name="mykka-50-cap" \
  --budget-amount=50 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0 \
  --notifications-rule-pubsub-topic=projects/$PROJECT_ID/topics/budget-alerts

gcloud pubsub topics create budget-alerts

gcloud functions deploy budget-guard \
  --gen2 --runtime=nodejs20 --region=$REGION \
  --source=deploy/gcp/budget-guard \
  --entry-point=budgetGuard \
  --trigger-topic=budget-alerts \
  --set-env-vars=REGION=$REGION,GUARDED_SERVICES=mykka-backend,mykka-console,mykka-web
```

The Cloud Function's own invocations are themselves inside the free tier
(2M/month) — it doesn't meaningfully add to the number it's watching.

## Next step: tuning

Everything above starts at the cheapest viable tier (`cpu:1`, smallest
memory that boots each service, `maxScale:2`). Once there's real traffic —
send benchmarks (latency under load, cold-start frequency, memory
high-water-mark from Cloud Run's own metrics) — and each service's
`resources.limits` / `maxScale` gets tuned individually rather than guessed.
Don't raise any service's ceiling pre-emptively; wait for a number that says
it's needed.
