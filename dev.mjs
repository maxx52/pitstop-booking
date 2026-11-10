import { createServer } from 'vite'
import { parseArgs } from 'node:util'
import { api } from './server/api.js'
import { localDatabase } from './server/local-db.js'
const { values } = parseArgs({ options: {
  host: {type:'string',default:'127.0.0.1'},
  port: {type:'string',default:process.env.PORT || '5173'},
  strictPort: {type:'boolean',default:false}
}})
const db = localDatabase('.pitstop.sqlite')
const server = await createServer({
  server:{host:values.host,port:Number(values.port),strictPort:values.strictPort,allowedHosts:true},
  plugins:[{name:'pitstop-api',configureServer(vite) {
    vite.middlewares.use(async (req,res,next) => {
      if (!req.url.startsWith('/api/')) return next()
      try {
        const base = (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host
        const init = {method:req.method,headers:req.headers}
        if (!['GET','HEAD'].includes(req.method)) Object.assign(init,{body:req,duplex:'half'})
        const response = await api(new Request(new URL(req.url,base),init),db)
        res.writeHead(response.status,Object.fromEntries(response.headers))
        res.end(await response.text())
      } catch (error) {
        console.error(error)
        res.writeHead(500,{'content-type':'application/json'})
        res.end(JSON.stringify({error:'Сервис временно недоступен.'}))
      }
    })
  }}]
})
await server.listen()
server.printUrls()
