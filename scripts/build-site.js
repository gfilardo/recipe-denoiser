import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const site = new URL('_site/', root);
await rm(site, {recursive:true, force:true});
await mkdir(site, {recursive:true});
// Explicit allowlist: do not publish tests, Git metadata or diagnostic archives.
for (const path of ['index.html','styles.css','src','examples']) {
  await cp(new URL(path,root), new URL(path,site), {recursive:true});
}
await mkdir(new URL('evaluation/',site), {recursive:true});
for (const path of ['evaluation/run-in-browser.js','evaluation/cases.json']) {
  await cp(new URL(path,root), new URL(path,site));
}
await writeFile(new URL('.nojekyll',site),'');
console.log(`Site packaged at ${fileURLToPath(site)}`);
