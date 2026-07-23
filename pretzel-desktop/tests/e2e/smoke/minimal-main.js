// TEMP: bare-minimum Electron app, zero pretzel-desktop code, to isolate
// whether the CI hang is environment-level (Electron/Xvfb) or in our code.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const LOG_PATH = path.join(__dirname, 'smoke-debug.log')
function log(msg) {
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`)
}

log('script started')

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-dev-shm-usage')
app.disableHardwareAcceleration()

log('switches applied, waiting for whenReady')

app.whenReady().then(async () => {
  log('whenReady fired')
  // show: true + awaited loadURL matches the Playwright maintainers' own
  // confirmed-working repro (microsoft/playwright#21117) — hidden windows
  // that never load content are the suspected reason firstWindow() hangs.
  const win = new BrowserWindow({ width: 200, height: 200, show: true })
  log(`BrowserWindow constructed, id=${win.id}`)
  await win.loadURL('data:text/html,<h1>smoke</h1>')
  log('loadURL resolved')
})
