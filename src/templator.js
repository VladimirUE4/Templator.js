#!/usr/bin/env node
/**
 * Merged Templator CLI
 * Combines enhanced templator-js features (custom delimiters, file-specific config)
 * with additional helpers (shell execution, zipping, flexible templating)
 */

const fs = require('fs');
const path = require('path');
const Mark = require('templator-js');
const mkdirp = require('mkdirp');
const shell = require('shelljs');
const EasyZip = require('easy-zip').EasyZip;
const minimist = require('minimist');

// Parse CLI arguments
const parameters = minimist(process.argv.slice(2), {
  boolean: ['zip', 'help', 'debug'],
  string: ['config', 'configuration', 'openDelimiter', 'closeDelimiter', 'templateDir', 'templates', 'outputDir', 'destination'],
  alias: {
    f: 'config',
    h: 'help',
    o: 'openDelimiter',
    c: 'closeDelimiter',
    t: 'templateDir',
    d: 'outputDir'
  },
  default: {
    templates: '.',
    destination: 'generated'
  }
});

// Helper: show usage
function help() {
  console.log(`
Usage:
  # Batch directory mode:
  templator --config path/to/tplConfig.json --configuration path/to/context.json \
            --templateDir path/to/templates --outputDir path/to/output [--zip] [--debug]

  # Single-file mode:
  templator --config path/to/tplConfig.json --configuration path/to/context.json \
            --templates path/to/template.txt [--openDelimiter '{{'] [--closeDelimiter '}}'] \
            [--destination output.txt] [--debug]

Options:
  --config, -f            Templator-js configuration JSON (delimiters, per-file options)
  --configuration         Context data JSON for templates
  --templateDir, -t       Templates directory (batch mode)
  --templates             Single template file path or fallback dir
  --outputDir, -d         Output directory for batch mode
  --destination           Output file path for single-file mode
  --openDelimiter, -o     Override global opening delimiter
  --closeDelimiter, -c    Override global closing delimiter
  --zip                   Zip the output directory after batch processing
  --debug                 Print debug information
  --help, -h              Show this help message
  `);
}

// Load templator-js config (delimiters, file-specific settings)
let tplConfig = { files: {} };
let globalOpen = parameters.openDelimiter || '{{';
let globalClose = parameters.closeDelimiter || '}}';
if (parameters.config) {
  try {
    const raw = fs.readFileSync(parameters.config, 'utf8');
    const obj = JSON.parse(raw);
    tplConfig = obj['templator-js'] || obj;
    tplConfig.files = tplConfig.files || {};
    if (tplConfig.options && tplConfig.options.delimiters) {
      if (tplConfig.options.delimiters.open)  globalOpen = tplConfig.options.delimiters.open;
      if (tplConfig.options.delimiters.close) globalClose = tplConfig.options.delimiters.close;
    }
  } catch (err) {
    console.error(`Error loading templator config at ${parameters.config}: ${err.message}`);
    process.exit(2);
  }
}

// Initialize context (data for templates)
function initContext(params) {
  if (params.help) {
    help();
    return { ok: false };
  }
  let ctx;
  if (params.configuration) {
    try {
      ctx = require(path.resolve(process.cwd(), params.configuration));
    } catch (err) {
      console.error(`Context JSON ${params.configuration} not found or invalid`);
      return { ok: false };
    }
  } else {
    // fallback: use raw parameters as context
    ctx = Object.assign({}, params);
    delete ctx._; delete ctx.config; delete ctx.configuration;
    delete ctx.templates; delete ctx.templateDir;
    delete ctx.outputDir; delete ctx.destination;
    delete ctx.zip; delete ctx.help; delete ctx.debug;
    delete ctx.openDelimiter; delete ctx.closeDelimiter;
  }
  return { ok: true, context: ctx };
}

// Render a single file with context and delimiters
function renderTemplate(srcPath, outPath, ctx, openDel, closeDel) {
  const fileName = path.basename(srcPath);
  const fileCfg  = tplConfig.files[fileName] || {};
  const od = fileCfg.openDelimiter || openDel;
  const cd = fileCfg.closeDelimiter || closeDel;
  try {
    const tpl = fs.readFileSync(srcPath, 'utf8');
    console.log(`Rendering ${srcPath} with delimiters '${od}' and '${cd}'`);
    const result = Mark.up(tpl, ctx, { openDelimiter: od, closeDelimiter: cd });
    if (outPath === 'stdout') {
      process.stdout.write(result);
    } else {
      mkdirp.sync(path.dirname(outPath));
      fs.writeFileSync(outPath, result, 'utf8');
      console.log(`Written to ${outPath}`);
    }
    return true;
  } catch (err) {
    console.error(`Error rendering ${srcPath}: ${err.message}`);
    return false;
  }
}

// Process non-template commands (zip, .script exec)
function zipGenerated(dir) {
  const zipper = new EasyZip();
  zipper.zipFolder(dir, () => {
    zipper.writeToFile(`${dir}.zip`, () => console.log(`Zipped to ${dir}.zip`));
  });
}

function processTemplateFile(src, dest, ctx) {
  const ext = path.extname(src);
  const stat = fs.statSync(src);
  const tpl = fs.readFileSync(src, 'utf8');
  const out = Mark.up(tpl, ctx);
  if (ext === '.script') {
    shell.pushd('-q', path.dirname(dest));
    shell.exec(out);
    shell.popd('-q');
  } else {
    fs.writeFileSync(dest, out, { mode: stat.mode });
  }
}

// Recursively generate directory tree
function generateDir(srcDir, baseDir, destDir, ctx) {
  fs.readdirSync(srcDir).forEach(item => {
    const srcPath = path.join(srcDir, item);
    const rel     = srcPath.substr(baseDir.length);
    const destPath= path.join(destDir, rel);
    if (fs.statSync(srcPath).isDirectory()) {
      mkdirp.sync(destPath);
      generateDir(srcPath, baseDir, destDir, ctx);
    } else {
      processTemplateFile(srcPath, destPath, ctx);
    }
  });
}

// MAIN
const init = initContext(parameters);
if (!init.ok) process.exit(1);
const context = init.context;
if (parameters.debug) console.log('Context:', context);

// Determine mode
let srcInput = parameters.templateDir || parameters.templates;
if (!fs.existsSync(srcInput)) {
  console.error(`Source path ${srcInput} not found`);
  process.exit(1);
}
const stat = fs.statSync(srcInput);

if (stat.isDirectory()) {
  // Batch directory mode
  const outDir = parameters.outputDir || parameters.destination;
  mkdirp.sync(outDir);
  generateDir(srcInput, srcInput, outDir, context);
  console.log(`Successfully processed directory ${srcInput}`);
  if (parameters.zip) zipGenerated(outDir);
} else {
  // Single file mode
  const outFile = parameters.destination || parameters.outputDir || 'stdout';
  renderTemplate(srcInput, outFile, context, globalOpen, globalClose);
}

// Make executable
if (process.platform !== 'win32') {
  try { fs.chmodSync(__filename, 0o755); } catch {};
}
