#!/usr/bin/env node
/**
 * CLI script to render a template file (YAML or any text) using Markup.js
 * Fixed version to properly handle custom delimiters
 */

const fs = require('fs');
const path = require('path');
const Mark = require('./markup.js');

// Parse CLI arguments
const argv = process.argv.slice(2);
let openDelimiter = '{{';
let closeDelimiter = '}}';
const files = [];

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--openDelimiter' || arg === '-o') {
    openDelimiter = argv[++i];
  } else if (arg === '--closeDelimiter' || arg === '-c') {
    closeDelimiter = argv[++i];
  } else {
    files.push(arg);
  }
}

const [infoPath, templatePath, outPath] = files;

if (!infoPath || !templatePath) {
  console.error('Usage: run-markup.js [--openDelimiter <open>] [--closeDelimiter <close>] <info.json> <template.yaml> [output.txt]');
  process.exit(1);
}

// Read and parse context JSON
let context;
try {
  const jsonData = fs.readFileSync(infoPath, 'utf8');
  context = JSON.parse(jsonData);
  
  // Verified that context is an object
  if (context.items === undefined) {
    context.items = [];
  } else if (!(context.items instanceof Array)) {
    context.items = [context.items]; // Convert to array if not already
  }
} catch (err) {
  console.error(`Error reading or parsing JSON file at ${infoPath}: ${err.message}`);
  process.exit(2);
}

// Read template file as string
let template;
try {
  template = fs.readFileSync(templatePath, 'utf8');
} catch (err) {
  console.error(`Error reading template file at ${templatePath}: ${err.message}`);
  process.exit(3);
}

// Render using Markup.js with delimiters
let output;
try {
  // Configuration Markup.js Delimiters
  const options = {
    openDelimiter: openDelimiter,
    closeDelimiter: closeDelimiter
  };
  

  console.error(`INFO: Rendering template with delimiters '${openDelimiter}' and '${closeDelimiter}'`);
  console.error(`INFO: Context data structure: ${Object.keys(context).join(', ')}`);
  
  output = Mark.up(template, context, options);
} catch (err) {
  console.error(`Error rendering template: ${err.message}`);
  console.error(`Template: ${template.substring(0, 100)}...`);
  console.error(`Context keys: ${Object.keys(context).join(', ')}`);
  process.exit(4);
}

// Write output
if (outPath) {
  try {
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(`Rendered output written to ${outPath}`);
  } catch (err) {
    console.error(`Error writing output to ${outPath}: ${err.message}`);
    process.exit(5);
  }
} else {
  process.stdout.write(output);
}

// Make script executable on Unix
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(__filename, 0o755);
  } catch (_) {}
}