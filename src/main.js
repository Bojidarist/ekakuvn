import { Ekakuvn } from './modules/ekakuvn.js'

const params = new URLSearchParams(window.location.search)
const scriptUrl = params.get('script') || 'docs/examples/demo/demo-project.evn'

const game = new Ekakuvn()
await game.loadScript(scriptUrl)
await game.start()
