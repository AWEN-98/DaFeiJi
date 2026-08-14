const http = require('http'), fs = require('fs'), path = require('path');
const s = http.createServer((req, res) => {
  let f = req.url === '/' ? 'index.html' : req.url.split('?')[0];
  let p = path.join(__dirname, f);
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('NF'); }
    else {
      const ext = path.extname(f);
      const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css',
        '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg',
        '.json':'application/json','.woff':'font/woff','.woff2':'font/woff2'}[ext] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': t});
      res.end(d);
    }
  });
});
s.listen(8134, () => console.log('http://localhost:8134'));
