/*
  Creates single file export to index.ts
  (Please avoid naming a table index as it will be overwritten)
*/
import fs from 'fs';
import path from 'path';

// Get the directory path from command line arguments
const directoryPath = process.argv[2];

// Check if the directory path is provided
if (!directoryPath) {
  console.error('Please provide the directory path as a command line argument.');
  process.exit(1);
}

let fileOut = ''
try {
  // Read the contents of the directory synchronously
  const files = fs.readdirSync(directoryPath);

  // Iterate over the files
  files.forEach((file) => {
    // skip the file we're making
    if (/index\.(ts|js|tsx|jsx)/.test(file)) return 

    // extract file name
    let fileName = file.replace(/\.[tj]s/, '') 
    // infer class export name from file name
    let imprtName = fileName.split('_').reduce(
      (a, s) => a+(s[0]!).toUpperCase()+s.substring(1), ''
    ) 

    // Add export
    fileOut += `export { ${imprtName} } from "./${fileName}.js"\n`
  });
} catch (err) {
  console.error('Error reading directory:', err);
  process.exit(1);
}

let mod_export_path = path.join(directoryPath, 'index.ts')
fs.writeFileSync(mod_export_path, fileOut, 'utf-8');
console.log(`Generated Single File Export for ${directoryPath}`)
