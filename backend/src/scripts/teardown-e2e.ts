// Load .env before ../db/client.js reads DATABASE_URL (dotenv is dev-only).
import 'dotenv/config'
import { pathToFileURL } from 'url'
import { db } from '../db/client.js'
import {
  events, scans, memberTeams, rules, subjects,
  destinationGroups, siteConfigs, members, teams, divisions, policies, tenants,
  chatMessages, chatSessions, invites, enforcementSignals,
  memberRuleExceptions, deviceTokens, desktopAuthCodes, extensionAuthCodes, subjectVersions,
  shadowVerdicts, judgeShadowChecks,
} from '../db/schema.js'

/** Deletes every e2e row, children before parents. Exported for tests. */
export async function truncateE2eTables(): Promise<void> {
  await db.delete(enforcementSignals)
  await db.delete(shadowVerdicts)
  await db.delete(judgeShadowChecks)
  await db.delete(invites)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(memberRuleExceptions)
  await db.delete(events)
  await db.delete(scans)
  await db.delete(deviceTokens)
  await db.delete(desktopAuthCodes)
  await db.delete(extensionAuthCodes)
  await db.delete(memberTeams)
  await db.delete(subjectVersions)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
}

async function main() {
  console.log('[teardown-e2e] Truncating test DB...')
  await truncateE2eTables()
  console.log('[teardown-e2e] Done.')
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1) })
}
