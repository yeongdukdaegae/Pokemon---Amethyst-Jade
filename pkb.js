const {buildProgram}=require('./core.js');const fs=require('fs'),path=require('path');
const root=process.argv[2];const files={};
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else{const r=path.relative(root,p);files[r]=/\.(jb|jbl|jbs|json|tl)$/.test(f)?fs.readFileSync(p,'utf8'):'data:application/octet-stream;base64,'+fs.readFileSync(p).toString('base64');}}})(root);
const main=(/main\s*=\s*(\S+)/.exec(files['project.jbs'])||[])[1];
try{buildProgram(files,main);console.log('build ok');}catch(e){console.log('ERR',e.message,e.file,e.line)}
