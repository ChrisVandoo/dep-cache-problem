import { init, parse } from 'es-module-lexer';
import fs  from 'node:fs';
import path from 'node:path';
import process from 'node:process'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process';
import { Octokit } from "@octokit/core";

const DEFAULT_CACHE_DIR = ".cache"

function getCacheDirName() {
  return path.join(DEFAULT_CACHE_DIR, `${process.platform}-${process.arch}`);
}

// Recursively parses dependencies for all imports.
function getImportsForFile(file) {
  
  const source = fs.readFileSync(file, 'utf-8');
  const [imports] = parse(source);

  let dependencies = new Map();
  for (let i = 0; i < imports.length; i++) {
    let dep = imports[i].n;
    if (path.extname(dep) == ".js") {
      dep = path.join(path.dirname(file), dep);
    }

    if (! dependencies.has(dep) && fs.existsSync(dep)) {
      let res = getImportsForFile(dep);
      res.forEach((value, key) => dependencies.set(key, value));
    }
    dependencies.set(dep, true);
  }

  return dependencies;
}

// Checks if dep matches anything in package.json
function isThirdPartyDep(dep) {
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(allDeps).some(name => dep === name || dep.startsWith(name + '/'));
}

// Computes a hash used for the build cache based on file contents, dependencies, OS, and CPU architecture.
function computeHash(file) {
  const hash = crypto.createHash('sha256');
  hash.update(`${process.version} ${process.platform} ${process.arch}`);
  hash.update(fs.readFileSync(file));

  let dependencies = getImportsForFile(file);
  let hashPackageFiles = false;
  dependencies.forEach((_, key) => {
    if (fs.existsSync(key)) {
      hash.update(fs.readFileSync(key));
    } else {
      // this is probably a 3rd party or stdlib dep
      if ( isThirdPartyDep(key) && ! hashPackageFiles ) {
        hashPackageFiles = true;
      }
    }
  })

  if (hashPackageFiles) {
    hash.update(fs.readFileSync('package.json'));
    hash.update(fs.readFileSync('package-lock.json'));
  }

  return hash.digest('hex');
}

async function checkRemoteCache(target) {
  const octokit = new Octokit();

  let res = await octokit.request('GET /repos/{owner}/{repo}/releases', {
    owner: 'ChrisVandoo',
    repo: 'dep-cache-problem',
    headers: {
      'X-GitHub-Api-Version': '2026-03-10'
    }
  })

  console.log(`Checking remote cache for ${target}...`);

  let downloadUrl;
  for (let i = 0; i < res.data.length; i++) {
    let obj = res.data[i];
    console.log(`  found ${obj.name}`);
    if (obj.name == target) {
      downloadUrl = obj.assets[0].browser_download_url;
      const bin = await fetch(downloadUrl);
      const buffer = Buffer.from(await bin.arrayBuffer());
      fs.writeFileSync(path.join(getCacheDirName(), target), buffer);
      return true
    }
  }
  
  return false
}

// Builds <input> with `node` and caches the <output>
async function BuildWithCache(input, output) {
  if (! fs.existsSync(input)) {
    console.log(`failed to read ${input}, unable to build`);
    return;
  }

  console.log(`Executing node ${input} to build ${output}...`);

  let cacheDir = getCacheDirName();
  if (! fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, {recursive: true});
  }

  let hash = computeHash(input);
  let basename = `${process.platform}-${process.arch}-${hash}`;
  let target = path.join(cacheDir, basename);
  if (fs.existsSync(target)) {
    console.log(`Found locally cached ${output} for ${input} hash: ${hash}. Skipping build and using cached file...`);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.copyFileSync(target, output);
  } else if (await checkRemoteCache(basename)) {
    console.log(`Found remote cached ${output} for ${input} hash: ${hash}. Skipping build and using cached file...`);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.copyFileSync(target, output);
  } else {
    console.log(`No cached binary found for ${basename}, re-building...`)
    const res = execSync(`node ${input}`, {encoding: 'utf-8'});
    console.log(res)
    fs.copyFileSync(output, target);
  }

  return basename;
}

await init;
let cacheFileName = await BuildWithCache(process.argv[2], process.argv[3]);
if (process.env.GITHUB_OUTPUT) {
  let out = `filename=${cacheFileName}`;
  console.log(out)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, out + '\n');
}
