const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');
const ROOT=path.join(__dirname,'app');
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(url.parse(req.url).pathname);
  if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)){res.writeHead(403).end('forbidden');return;}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{'Content-Type':'text/plain'}).end('not found: '+p);return;}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(d);
  });
}).listen(8123,()=>console.log('Pisay Reviewer on http://localhost:8123'));
