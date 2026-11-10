import { build } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
rmSync('dist',{recursive:true,force:true})
await build({build:{outDir:'dist/client',assetsInlineLimit:100000}})
const root = 'dist/client'
let html = readFileSync(root + '/index.html','utf8')
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_,url) =>
  '<script type="module">' + readFileSync(root + url,'utf8').replaceAll('</script','<\\/script') + '</script>')
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_,url) =>
  '<style>' + readFileSync(root + url,'utf8') + '</style>')
mkdirSync('dist/server',{recursive:true})
const worker = await build({
  configFile:false,
  build:{
    ssr:'server/api.js',
    write:false,
    minify:false,
    rolldownOptions:{output:{format:'es'}}
  }
})
const backend = worker.output.find(chunk => chunk.type === 'chunk').code.replace(/export\s*\{\s*api\s*\};?\s*$/, '')
writeFileSync('dist/server/index.js', `${backend}
const html = ${JSON.stringify(html)}
export default { async fetch(request, env) {
  const path = new URL(request.url).pathname
  if (path.startsWith('/api/')) {
    try { return await api(request,env.DB) }
    catch (error) { console.error(error); return Response.json({error:'Сервис временно недоступен.'},{status:500}) }
  }
  if (path !== '/' && path !== '/admin') return new Response('Not found',{status:404})
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})
}}
`)
