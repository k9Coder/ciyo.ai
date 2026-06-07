import { activateTenant } from '../src/billing/service.js'

const result = await activateTenant({
  name: 'Acme Law Firm',
  paymentProvider: 'stripe',
  externalSubId: 'sub_local_test',
  plan: 'business',
  seatCount: 10,
})

console.log('\n=== Tenant created ===')
console.log('Org token  (for Chrome extension):', result.orgToken)
console.log('Admin token (for admin console):  ', result.adminToken)
console.log('')
