#!/usr/bin/env bash
# Re-opens public traffic on all guarded Cloud Run services after a budget-guard pause.
# Run manually once you've reviewed why the budget threshold was hit.
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICES=(ciyo-backend ciyo-console ciyo-web)

for svc in "${SERVICES[@]}"; do
  echo "Restoring public access to $svc..."
  gcloud run services add-iam-policy-binding "$svc" \
    --region="$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker"
done

echo "Done. Services are publicly reachable again."
