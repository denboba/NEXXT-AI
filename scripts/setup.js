'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
if(Number(process.versions.node.split('.')[0])<20) throw new Error('Node 20+ is required.');
const root=path.join(__dirname,'..');
fs.mkdirSync(path.join(root,'data'),{recursive:true});
const destination=path.join(root,'.env');
if(!fs.existsSync(destination)) {
 const example=fs.readFileSync(path.join(root,'.env.example'),'utf8').replace(/^ADMIN_TOKEN=.*$/m,'ADMIN_TOKEN='+crypto.randomBytes(32).toString('hex'));
 fs.writeFileSync(destination,example,{flag:'wx',mode:0o600});
 console.log('Created ignored local configuration with a random admin token. The token is not printed.');
} else console.log('Preserved existing local configuration.');
console.log('No dependency installation or build is required. Start with npm start; verify with npm test and npm run eval.');
