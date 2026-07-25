const { ServicesClient } = require('@google-cloud/run').v2;

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const REGION = process.env.REGION || 'us-central1';
const SERVICES = (process.env.GUARDED_SERVICES || 'ciyo-backend,ciyo-console,ciyo-web')
  .split(',')
  .map((s) => s.trim());
// Pause once spend crosses this fraction of the budget (1.0 = 100%).
const PAUSE_AT_RATIO = Number(process.env.PAUSE_AT_RATIO || '1.0');

const client = new ServicesClient();

/**
 * Pub/Sub-triggered Cloud Function bound to the budget's notification topic.
 * Billing budget alerts publish a JSON payload with costAmount/budgetAmount;
 * at >= PAUSE_AT_RATIO we strip the public `allUsers` invoker binding from
 * each guarded Cloud Run service. This stops new traffic (and therefore
 * further spend) without deleting the service or its revisions — restore
 * with restore.sh once you've reviewed what happened.
 */
exports.budgetGuard = async (cloudEvent) => {
  const payload = JSON.parse(
    Buffer.from(cloudEvent.data.message.data, 'base64').toString()
  );

  const { costAmount, budgetAmount } = payload;
  if (!budgetAmount || costAmount / budgetAmount < PAUSE_AT_RATIO) {
    console.log(`Spend ${costAmount}/${budgetAmount} below pause threshold, no action.`);
    return;
  }

  console.warn(`Spend ${costAmount}/${budgetAmount} at/over threshold — pausing public traffic.`);

  for (const service of SERVICES) {
    const name = `projects/${PROJECT_ID}/locations/${REGION}/services/${service}`;
    try {
      const [policy] = await client.getIamPolicy({ resource: name });
      policy.bindings = (policy.bindings || []).filter(
        (b) => b.role !== 'roles/run.invoker'
      );
      await client.setIamPolicy({ resource: name, policy });
      console.log(`Paused ${service} (removed public invoker binding).`);
    } catch (err) {
      console.error(`Failed to pause ${service}:`, err.message);
    }
  }
};
