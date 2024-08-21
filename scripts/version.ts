import * as fsp from 'fs/promises';
//import fs from 'node:fs';
//import { finished } from 'stream/promises';

import path from 'node:path';

import { $ } from 'bun'
//import { execSync } from 'child_process'

import { mkdir } from 'fs/promises';
import { createGunzip } from 'zlib';
import { extract } from 'tar';

let {
  STDB_SERVER_PATH,
  STDB_EXE_PATH
} = process.env

let STDB = STDB_EXE_PATH ? path.join(STDB_EXE_PATH,'spacetime') : 'spacetime'


async function ensureCargoDependency(filePath: string, dependencyName: string, dependencyVersion: string) {
  // might be easier to do cargo add and cargo update...
  try {
    // Read the Cargo.toml file
    let fileContent = await fsp.readFile(filePath, 'utf8');
    
    const dependenciesStart = fileContent.indexOf('[dependencies]');
    if (dependenciesStart === -1) {
      // If [dependencies] section doesn't exist, add it at the end
      fileContent += '\n[dependencies]\n';
    }
    
    const lines = fileContent.split('\n');
    const dependenciesIndex = lines.findIndex(line => line.trim() === '[dependencies]');
    
    // Update or add the dependency
    const newDependencyLine = `${dependencyName} = "${dependencyVersion}"`;
    const existingDependencyIndex = lines.findIndex((line, index) => 
      index > dependenciesIndex && line.startsWith(`${dependencyName} =`)
    );
    
    if (existingDependencyIndex !== -1) {
      // Update existing dependency
      lines[existingDependencyIndex] = newDependencyLine;
    } else {
      // Add new dependency right after [dependencies]
      lines.splice(dependenciesIndex + 1, 0, newDependencyLine);
    }
    
    // Join the lines back into a single string
    const updatedContent = lines.join('\n');
    
    // Write back to the Cargo.toml file
    await fsp.writeFile(filePath, updatedContent, 'utf8');
    
    console.log(`Updated ${dependencyName} to version ${dependencyVersion} in ${filePath}`);
  } catch (error) {
    console.error('Error processing Cargo.toml:', error);
  }
}

async function update_deps(version: string, options={server: true, client:true}) {
  // will add the dependency if it doesn't exist or update it if it already exists.
  try {
    // Update Rust dependency
    let res1;
    if (options.server) {
      res1 = await $`cargo add spacetimedb@=${version}`
        .cwd(STDB_SERVER_PATH ?? './server')
        .quiet()

      if (res1.exitCode) console.error(res1.stderr.toString())
    }

    // Update JavaScript dependency
    let res2;
    if (options.client) {
      res2 = await $`bun add @clockworklabs/spacetimedb-sdk@${version} --cwd client`
        //.cwd('./client')
        .quiet()

      if (res2.exitCode) {
        console.log("If error is related to latest version not existing, it possible te SDK hasn't been updated just yet.")
        console.error(res2.stderr.toString())
      }
    }

    // (undef | 0 => true ) (1 => false)
    if (!res1?.exitCode && !res2?.exitCode) {
      let specific_update = options.server !== options.client ? (options.server ? "server " : "client ") : ""
      console.log(`Successfully updated ${specific_update}dependencies to version ${version}`)
    }
  } catch (error) {
    console.error(`Failed to update dependencies: ${error}`)
  }
}






//downloadFile()

// cache version so the don't have to be re-downloaded?
// let versions_path = path.join(os.homedir(), 'SpacetimeDB', 'versions')
// function getPath(releaseTag) {
//  return path.join(versions_path, releaseTag)
// }
// let people manually populate cache

const owner = 'clockworklabs'
const repo = 'SpacetimeDB'
async function getRemoteVersions() {
  //let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags`)
  let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`)
  if (!res.ok) throw new Error(`Releases Fetch Failed: ${res.status} - ${res.statusText}`)

  let data = await res.json()
  return data as Release[]
}
async function getLatestVersion() {
  let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
  let data = await res.json()
  return data as Release
}

function isValidVersion(version: string): boolean {
  const versionRegex = /^\d+\.\d+\.\d+$/;
  return versionRegex.test(version);
}

export async function getGivenVersion(version:string) {
  if (isValidVersion(version)) {
    let version_list = await getRemoteVersions()
    let match_version = new RegExp(`^v${version}`)
    let release = version_list.find(v => match_version.test(v.tag_name))
    
    if (release) return release
  } 

  throw new Error(`Version "${version}" could not be found`)
}

//getGivenVersion('0.8.1')

//console.log(await getRemoteVersions())
//console.log(await getLatestVersion())


let asset_map: Record<string, string> = {
  'win32_*'     :  'spacetime.exe'                ,
  'linux_x64'   :  'spacetime.linux-amd64.tar.gz' ,
  'linux_arm64' :  'spacetime.linux-arm64.tar.gz' ,
  'darwin_x64'  :  'spacetime.darwin-amd64.tar.gz',
  'darwin_arm64':  'spacetime.darwin-arm64.tar.gz',
}
function getArch(): string[] {
  const platform = process.platform;
  const architecture = process.arch;
  return [
    platform, 
    platform === 'win32' ? '*' : architecture
  ]
}

function get_asset_name() {
  let arch:string = getArch().join('_')
  if (arch in asset_map) {
    return asset_map[arch]
  }
  throw new Error(`Arch not recognized ${arch}`)
}




export async function getCurrentVersion() {
  let proc = await $`${STDB} version`
    .quiet()

  let res = proc?.stdout?.toString() ?? proc.stderr.toString()
  if(proc.exitCode) throw new Error(`Version command Failed: ${res}`)

  let match = res.match(/version (\d+\.\d+\.\d+)/)
  if (match && match[1]) {
    const version = match[1];
    return version
  } else {
    let err_msg = `Version not found in response: ${res}`
    console.error(err_msg)
    throw new Error(err_msg)
  }
}


async function download_asset(url: string, dest: string) {
  /* 
    Prob easier to do by command line... 
    ref: https://install.spacetimedb.com/install-script.sh
    ref: https://windows.spacetimedb.com/
  */
  await mkdir(dest, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  
  const totalSize = Number(response.headers.get('content-length')) || 0;
  let downloadedSize = 0;

  const gunzip = createGunzip();
  const ext = extract({ cwd: dest });

  const body = response.body;
  if (!body) throw new Error('No response body');

  let lastLogTime = 0;

  await new Promise((resolve, reject) => {
    const reader = body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          downloadedSize += value.length;
          gunzip.write(value);
          
          // Update progress
          const now = Date.now();
          if (totalSize > 0 && now - lastLogTime > 100) { // Update every 100ms
            const percentComplete = Math.round((downloadedSize / totalSize) * 100);
            process.stdout.write(`\rDownloading... ${percentComplete}% complete`);
            lastLogTime = now;
          }
        }
        gunzip.end();
      } catch (error) {
        reject(error);
      }
    };

    pump();
    gunzip.pipe(ext);
    ext.on('finish', resolve);
    ext.on('error', reject);
  });

  // Clear the progress message and move to a new line
  process.stdout.write('\r\x1b[K');
  console.log('Download and extraction complete!');
}


const isPowershell = () => {
  // Check for PSMODULEPATH which is typically set in PowerShell environments
  return !!process.env.PSMODULEPATH;
};

export async function downloadRelease(release: Release) {  
  

  // Get OS specific asset
  let asset_name = get_asset_name()
  let asset = release.assets.find(asset => asset.name === asset_name);
  if (!asset) throw new Error(`Asset "${asset_name}" not found in the release.`);

  // Download the asset
  const downloadUrl = asset.browser_download_url;

  const destinationPath = STDB_EXE_PATH ?? './spacetime' 
  // default to local install? (ideally os specific global install, but thats annoying to code)
  console.log(`Starting ${release.tag_name} Download:`)
  // console.log(downloadUrl)
  await download_asset(downloadUrl, destinationPath);

  // Post Install:
  /*
    I don't want to be so aggressive as to permanently update the path.
    So, I'll instruct people to on how to path the env temporarily if they
    want to manually run commands. 
    For all my scripts however... i gotta figure out how to best target the desired exe.
  */
  if (isPowershell()) {
    console.warn(`Temp env patch:\n\t $env:Path = "${destinationPath}/spacetime.exe;" + $env:PATH`);
  } else {
    console.warn(`Temp env patch:\n\t export PATH="${destinationPath}/spacetime":PATH`)
  }

  switch (process.platform) {
    case 'darwin':
      return $`chmod +x ${destinationPath}/spacetime`
    case 'linux':
      return $`chmod +x ${destinationPath}/spacetime`
    case 'win32':
      return
    default:
      throw new Error(`Platform not recognized: ${process.platform}`)
  }
}

interface Release {
  tag_name: string;
  assets: {
      name: string;
      browser_download_url: string;
  }[];
}

async function set_version(version?: string, force=false, options = {
  binary: true,
  server: true,
  client: true
}) {
  let release: Release;
  if (!version) {
    release = await getLatestVersion()
    version = release.tag_name
  } else {
    release = await getGivenVersion(version)
  }

  let cleaned_version;
  let match = version.match(/(\d+\.\d+\.\d+)/)
  if (match && match[1]) {
    cleaned_version = match[1];
  } else {
    throw new Error(`Version failed cleaning, given: ${version}`)
  }

  if (!force) {
    // if current version same or spacetimedb exe not found
    try {
      let current = await getCurrentVersion()
      if (current === cleaned_version) {
        return console.log('Version already up to date')
        // wonder if its worth attempting dep update anyway.
      }
    } catch (error: any) {
      console.error(error)
      // If getCurrentVersion fails, its prob because
      // stdb is not set up. So we simply proceed to 
      // install to correct that.
    }
  }

  if(options.client || options.server) await update_deps(cleaned_version, options)
  if(options.binary) await downloadRelease(release)
}



import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)

// Only execute if called as a command
if (__filename === process.argv?.[1]) {
  let args = process.argv.slice(2);
  let given_version = args.find(arg => /(\d+\.\d+\.\d+)/.test(arg))

  let flag_binary = args.includes('-b')
  let flag_server = args.includes('-s')
  let flag_client = args.includes('-c')
  let use_options = flag_binary || flag_server || flag_client || undefined

  set_version(
    given_version, 
    args.includes('-f'),
    use_options && {
      binary: flag_binary,
      server: flag_server,
      client: flag_client
    }
  )
}
