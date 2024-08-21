import * as fsp from 'fs/promises';
import { downloadRelease, getGivenVersion, getCurrentVersion } from './version'
import path from 'path'

INSTALL_STDB_EXE : {
  let {
    STDB_VER,
    STDB_SERVER_PATH
  } = process.env
  
  let version = STDB_VER;
  if (!version) {
    let CT = path.join(STDB_SERVER_PATH ?? 'server', 'Cargo.toml')
    let fileContent = await fsp.readFile(CT, 'utf8');
  
    // Ideally spacetimedb is a pinned dep, otherwise semver et al. may resolve differently
    let match = fileContent.match(/spacetimedb.*?(\d+\.\d+\.\d+).*?\n/)
    if (match && match[1]) {
      version = match[1]
    } else {
      throw new Error(`Failed to extract "spacetimedb" version from "${CT}"`)
    }
  }

  let release = await getGivenVersion(version)

  let current_version
  try {
    current_version = await getCurrentVersion()
  } catch {
    console.log('Current STDB version not detected.')
    await downloadRelease(release)
    process.exit(0)
  };
  
  let cleaned_version;
  let match = version.match(/(\d+\.\d+\.\d+)/)
  if (match && match[1]) {
    cleaned_version = match[1];
    
    if (current_version === cleaned_version) {
      console.log(`STDB Version ${current_version} already installed.`)
      process.exit(0)
    }
  }

  await downloadRelease(release)
}
