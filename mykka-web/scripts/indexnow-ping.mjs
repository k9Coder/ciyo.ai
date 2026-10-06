// Submits every URL in the production sitemap to IndexNow (Bing/Yandex pick up
// new/changed pages far faster this way than waiting on their own recrawl
// schedule). Run after a production deploy. Best-effort: never throws, never
// fails CI — a failed ping just means we fall back to normal crawl timing.
const HOST = 'mykka.ai'
const KEY = '18d017fd330c4296ad957ef1e279650f'
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`
const SITEMAP_URL = `https://${HOST}/sitemap.xml`

async function main() {
  const sitemapRes = await fetch(SITEMAP_URL)
  if (!sitemapRes.ok) throw new Error(`sitemap fetch failed: ${sitemapRes.status}`)
  const xml = await sitemapRes.text()
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  if (urlList.length === 0) throw new Error('sitemap.xml had no <loc> entries')

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  })

  console.log(`IndexNow: submitted ${urlList.length} URLs, status ${res.status}`)
  if (!res.ok) console.log(await res.text())
}

main().catch(err => {
  console.log(`IndexNow ping failed (non-fatal): ${err.message}`)
})
