#!/bin/bash
set -e
mkdir -p ../pkg
GOOS=js GOARCH=wasm go build -o ../pkg/go_engine.wasm
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" ../pkg/
