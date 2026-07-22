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

app.whenReady().then(() => {
  log('whenReady fired')
  const win = new BrowserWindow({ width: 200, height: 200, show: false })
  log(`BrowserWindow constructed, id=${win.id}`)
})
