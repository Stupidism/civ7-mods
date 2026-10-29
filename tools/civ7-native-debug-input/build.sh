#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
clang++ -arch arm64 -mmacosx-version-min=11.0 -std=c++17 -fobjc-arc -dynamiclib -O2 -Wall -Wextra \
  -framework Cocoa bridge.mm -o build/libCiv7NativeInput.dylib
codesign --force --sign - build/libCiv7NativeInput.dylib
