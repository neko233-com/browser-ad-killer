// 极简 CDP 客户端：node tools/cdp.mjs <port> <command> [args...]
// 命令：nav <url> | eval <js> | shot <path> | setfile <selector> <file> | click <x> <y> | targets
const port = process.argv[2] || '9222'
const cmd = process.argv[3]

async function targets() {
  const r = await fetch(`http://127.0.0.1:${port}/json`)
  return await r.json()
}

async function pageTarget() {
  const list = await targets()
  const page = list.find(t => t.type === 'page')
  if (!page) throw new Error('no page target')
  return page
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () => resolve({ ws, send }))
    ws.addEventListener('error', e => reject(new Error('ws error')))
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { res } = pending.get(msg.id)
        pending.delete(msg.id)
        res(msg)
      }
    })
    function send(method, params = {}) {
      return new Promise(res => {
        const mid = ++id
        pending.set(mid, { res })
        ws.send(JSON.stringify({ id: mid, method, params }))
      })
    }
  })
}

async function main() {
  const t = await pageTarget()
  const { ws, send } = await connect(t.webSocketDebuggerUrl)

  if (cmd === 'targets') {
    console.log(JSON.stringify(await targets(), null, 2))
  } else if (cmd === 'nav') {
    await send('Page.enable')
    await send('Page.navigate', { url: process.argv[4] })
    // 等加载完成
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500))
      const st = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
      if (st.result?.result?.value === 'complete') break
    }
    console.log('navigated')
  } else if (cmd === 'eval') {
    const expr = process.argv.slice(4).join(' ')
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true })
    console.log(JSON.stringify(r.result, null, 2))
  } else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync(process.argv[4], Buffer.from(r.result.data, 'base64'))
    console.log('shot saved')
  } else if (cmd === 'setfile') {
    const sel = process.argv[4]
    const file = process.argv[5]
    const doc = await send('DOM.getDocument', { depth: -1 })
    const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel })
    await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [file] })
    console.log('file set')
  } else if (cmd === 'click') {
    const x = Number(process.argv[4]); const y = Number(process.argv[5])
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    console.log('clicked')
  }
  ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
