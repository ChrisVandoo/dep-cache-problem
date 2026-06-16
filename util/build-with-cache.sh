#!/bin/bash

DEFAULT_CACHE_DIR=".cache"

if [ $# -ne 2 ]; then
  echo "Usage: $0 <build file> <output file>"
  exit 1
fi

build_file=$1
output=$2

if [ ! -d "$DEFAULT_CACHE_DIR" ]; then
    mkdir -p "$DEFAULT_CACHE_DIR"
fi

hash=$(shasum -a 256 "$build_file" | cut -d ' ' -f 1)
if [ -f "$DEFAULT_CACHE_DIR/$hash" ]; then
    # cache hit!
    echo "Found cached $output for $build_file hash: $hash. Skipping build and using cached file..."
    mkdir -p "$(dirname $output)"
    cp "$DEFAULT_CACHE_DIR/$hash" "$output"
else
    # build, update cache
    node "$build_file"
    cp "$output" "$DEFAULT_CACHE_DIR/$(shasum -a 256 $build_file | cut -d ' ' -f 1)"
fi
