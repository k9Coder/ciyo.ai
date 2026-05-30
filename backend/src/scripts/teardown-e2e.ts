import { db } from '../db/client.js'
import {
  events, scans, memberTeams, rules, subjects,
  destinationGroups, siteConfigs, members, teams, divisions, policies, tenants,
  chatMessages, chatSessions,
} from '../db/schema.js'

async function main() {
  console.log('[teardown-e2e] Truncating test DB...')
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(events)
  await db.delete(scans)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
  console.log('[teardown-e2e] Done.')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
