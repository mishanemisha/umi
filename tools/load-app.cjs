// Загружает приложение в vm-контекст в том же порядке, что и index.html
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function appScripts(html=fs.readFileSync(path.join(root,'index.html'),'utf8')){
 return [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m=>m[1]).filter(p=>!/^https?:/.test(p));
}
function runApp(ctx){for(const file of appScripts())vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});}
module.exports={root,appScripts,runApp};
