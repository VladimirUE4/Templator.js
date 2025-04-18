#!/usr/bin/env node
/**
 * Enhanced Templator CLI
 * Renders templates using Markup.js with support for:
 * - Processing entire directories
 * - Custom delimiters per file via JSON configuration
 * - Single file operation or batch processing
 * - Configuration via 'templator-js' field in JSON
 */

const fs = require('fs');
const path = require('path');
const Mark = require('./markup.js');

// Parse CLI arguments
const argv = process.argv.slice(2);
let configPath = null;
let globalOpenDelimiter = '{{';
let globalCloseDelimiter = '}}';
let templateDir = null;
let outputDir = null;
let infoPath = null;
let templatePath = null;
let outPath = null;
let isDirectoryMode = false;

// Parse arguments
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--config' || arg === '-f') {
    configPath = argv[++i];
  } else if (arg === '--openDelimiter' || arg === '-o') {
    globalOpenDelimiter = argv[++i];
  } else if (arg === '--closeDelimiter' || arg === '-c') {
    globalCloseDelimiter = argv[++i];
  } else if (arg === '--templateDir' || arg === '-t') {
    templateDir = argv[++i];
    isDirectoryMode = true;
  } else if (arg === '--outputDir' || arg === '-d') {
    outputDir = argv[++i];
  } else if (!infoPath) {
    infoPath = arg;
  } else if (!templatePath) {
    templatePath = arg;
  } else if (!outPath) {
    outPath = arg;
  }
}

// Validate inputs
if (isDirectoryMode && (!infoPath || !templateDir || !outputDir)) {
  console.error('Directory mode usage: templator.js --config <config.json> --templateDir <template_dir> --outputDir <output_dir> <info.json>');
  process.exit(1);
}

if (!isDirectoryMode && (!infoPath || !templatePath)) {
  console.error('Single file usage: templator.js [--config <config.json>] [--openDelimiter <open>] [--closeDelimiter <close>] <info.json> <template.yaml> [output.txt]');
  process.exit(1);
}

// Load configuration if specified
let config = { files: {} };
if (configPath) {
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    const configObj = JSON.parse(configData);
    
    // Support for new 'templator-js' configuration structure
    if (configObj['templator-js']) {
      config = configObj['templator-js'];
    } else {
      config = configObj;
    }
    
    if (!config.files) {
      config.files = {};
    }
    
    // Set global delimiters from config if present
    if (config.options && config.options.delimiters) {
      if (config.options.delimiters.open) {
        globalOpenDelimiter = config.options.delimiters.open;
      }
      if (config.options.delimiters.close) {
        globalCloseDelimiter = config.options.delimiters.close;
      }
    }
  } catch (err) {
    console.error(`Error reading or parsing config file at ${configPath}: ${err.message}`);
    process.exit(2);
  }
}

// Read and parse context JSON
let context;
try {
  const jsonData = fs.readFileSync(infoPath, 'utf8');
  const jsonObj = JSON.parse(jsonData);
  
  // Extract configuration if it exists under 'templator-js' field
  if (jsonObj['templator-js']) {
    const templatorConfig = jsonObj['templator-js'];
    
    // Set global delimiters from config if present
    if (templatorConfig.options && templatorConfig.options.delimiters) {
      if (templatorConfig.options.delimiters.open) {
        globalOpenDelimiter = templatorConfig.options.delimiters.open;
      }
      if (templatorConfig.options.delimiters.close) {
        globalCloseDelimiter = templatorConfig.options.delimiters.close;
      }
    }
    
    // Get file-specific configurations
    if (templatorConfig.files) {
      config.files = templatorConfig.files;
    }
    
    // Remove the configuration to not treat it as data
    delete jsonObj['templator-js'];
  } 
  // Backward compatibility with old structure
  else if (jsonObj.options && jsonObj.files) {
    if (jsonObj.options.delimiters) {
      if (jsonObj.options.delimiters.open) {
        globalOpenDelimiter = jsonObj.options.delimiters.open;
      }
      if (jsonObj.options.delimiters.close) {
        globalCloseDelimiter = jsonObj.options.delimiters.close;
      }
    }
    
    config.files = jsonObj.files;
    
    // Delete to not include in data context
    delete jsonObj.options;
    delete jsonObj.files;
  }
  
  context = jsonObj;
  
  // Ensure context.items is an array
  if (context.items === undefined) {
    context.items = [];
  } else if (!(context.items instanceof Array)) {
    context.items = [context.items];  // Convert to array if not already
  }
} catch (err) {
  console.error(`Error reading or parsing JSON file at ${infoPath}: ${err.message}`);
  process.exit(3);
}

/**
 * Renders a single template file with the specified context and delimiters
 */
function renderTemplate(templateFilePath, outputFilePath, ctx, openDel, closeDel) {
  // Get file-specific delimiters if configured
  const fileName = path.basename(templateFilePath);
  const fileConfig = config.files[fileName] || {};
  
  const openDelimiter = fileConfig.openDelimiter || openDel || globalOpenDelimiter;
  const closeDelimiter = fileConfig.closeDelimiter || closeDel || globalCloseDelimiter;

  try {
    // Read template file as string
    const template = fs.readFileSync(templateFilePath, 'utf8');
    
    // Configuration Markup.js Delimiters
    const options = {
      openDelimiter: openDelimiter,
      closeDelimiter: closeDelimiter
    };
    
    console.log(`Rendering ${templateFilePath} with delimiters '${openDelimiter}' and '${closeDelimiter}'`);
    
    // Render the template
    const output = Mark.up(template, ctx, options);
    
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write output
    fs.writeFileSync(outputFilePath, output, 'utf8');
    console.log(`Rendered output written to ${outputFilePath}`);
    
    return true;
  } catch (err) {
    console.error(`Error processing template ${templateFilePath}: ${err.message}`);
    return false;
  }
}

// Process files based on mode
if (isDirectoryMode) {
  // Directory mode: process all files in the template directory
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const files = fs.readdirSync(templateDir);
    let successCount = 0;
    
    for (const file of files) {
      const templateFilePath = path.join(templateDir, file);
      
      // Skip directories and non-file entities
      if (!fs.statSync(templateFilePath).isFile()) {
        continue;
      }
      
      const outputFilePath = path.join(outputDir, file);
      
      // Check if this file has specific configuration
      const fileConfig = config.files[file] || {};
      const openDelimiter = fileConfig.openDelimiter || globalOpenDelimiter;
      const closeDelimiter = fileConfig.closeDelimiter || globalCloseDelimiter;
      
      if (renderTemplate(templateFilePath, outputFilePath, context, openDelimiter, closeDelimiter)) {
        successCount++;
      }
    }
    
    console.log(`Successfully processed ${successCount} of ${files.length} files`);
  } catch (err) {
    console.error(`Error processing directory: ${err.message}`);
    process.exit(4);
  }
} else {
  // Single file mode
  renderTemplate(templatePath, outPath || 'stdout', context, globalOpenDelimiter, globalCloseDelimiter);
  
  // If no output path is specified, print to stdout
  if (!outPath) {
    const template = fs.readFileSync(templatePath, 'utf8');
    const options = {
      openDelimiter: globalOpenDelimiter,
      closeDelimiter: globalCloseDelimiter
    };
    const output = Mark.up(template, context, options);
    process.stdout.write(output);
  }
}

// Make script executable on Unix
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(__filename, 0o755);
  } catch (_) {}
}