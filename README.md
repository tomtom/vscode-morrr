# vscode-morrr

Userspace extensions to the [vscode-R](https://github.com/REditorSupport/vscode-R) extension.

## Installation

### From source

```bash
cd /path/to/vscode-morrr
npm install
npm run compile
```

Then install into VS Code:

```bash
code --install-extension /path/to/vscode-morrr
```

### As a VSIX package

```bash
npm run package
code --install-extension vscode-morrr-*.vsix
```

Or use **Extensions: Install from VSIX...** from the VS Code command palette and select the generated `.vsix` file.

## Features

### 1. Auto-inject RMarkdown params on file activation

When you switch to an `.Rmd` file that has a `params:` block in its YAML front matter, the extension automatically sends a corresponding `params <- list(...)` assignment to the R terminal. This makes `params` available immediately when you start running chunks, without having to source the whole document first.

Example front matter:

```yaml
---
title: My Report
params:
  dataset: "iris"
  threshold: 0.05
  verbose: true
---
```

The extension will send:

```r
params <- list(dataset = "iris", threshold = 0.05, verbose = TRUE)
```

The injection fires once per file per session — switching back to the same file does not re-send. If no R terminal (`R` or `R Interactive`) is open at the time of activation, nothing is sent; open the terminal first and then re-activate the file.

This feature implements the userspace equivalent of [vscode-R#1693](https://github.com/REditorSupport/vscode-R/pull/1693).
