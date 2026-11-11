// Type for electron-vite's `?modulePath` import suffix (see electron-vite/node.d.ts), used for the
// judge v2 shadow worker thread in main.ts.
declare module '*?modulePath' {
  const src: string
  export default src
}
