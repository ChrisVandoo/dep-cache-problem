## Problem
`npm run build` builds a script (`dist/dep.bin`) that takes a *very long time* (let's assume) to build, but is required for our application to run.

Currently, we build this on every CI run hundreds of times a day, and it's costing us a ton of money. We want to reduce CI costs by only building this dependency when any of its underlying code changes, but not when other code that merely depends on it changes. Implement a caching mechanism in github actions that uses a cached version of the binary when possible, but rebuilds it when needed.

In addition, developers need to have this dependency on their local machines, and also want to avoid unnecessarily local builds, so they should also be able to fetch cached artifacts. Care should be taken to make sure that developers aren't inadvertently using a stale cache locally.

## Deliverable
The deliverable is a forked version of this repo with
a) a modified version of the test.yml github action that uses cached binaries
b) any supporting code/scripts for implementing the caching

Note that the standard cache action might not be sufficient because of the local dev requirement. Please show your work and demonstrate that the caching implementation works in all cases.

## Ideas/Questions
- setup caching step in workflow, advantage is standard no custom script, doesn't support dev case
  - https://github.com/actions/cache/blob/main/caching-strategies.md, and https://github.com/actions/cache/blob/main/examples.md#node---npm for examples around using the cache action w/ NPM
- use separate workflow to build the binary based on if the file changes, store the binary somewhere in Github and add a step that downloads it in the action?
- add custom caching script - compare when the file was last built with when the util dir last changed to ensure cache stays fresh. Where should the binary be stored? How do ensure parity between local/CI builds?
- does NPM have some default caching functionality?
  - found https://docs.npmjs.com/cli/v11/commands/npm-cache, but this seems to be limited to caching package dependencies rather than build output
- Use another build tool (like Bazel) that natively supports caching to avoid a custom script. Advantage is no custom stuff to maintain, would add a bunch of overhead.

Can I assume that the build will always run before trying to run tests/start the application? How should I handle the case where a cached version of dep.bin exists locally, updates are made to dep.bin, and then the tests run but `npm run build` is not run first?
- currently without any caching, this will still result in tests running against the old version of dep.bin unless the dev explicitly runs `npm run build` before running tests. At this point it seems reasonable to keep this behaviour as-is, it should be possible to update `package.json` to run the build step as part of the test steps if this isn't allowed.

Does the requirement for devs to be able to "fetch cached artifacts" indicate that they should be able to download the prebuilt/cached binary from Github?

## Notes
- the tests will fail if dist/dep.bin doesn't exist, also trying to start the application will fail
- the build is painfully slow...
- the binary is generated with a timestamp which could be used for cache invalidation...
- problem: it is relatively easy to modify the build for dist/dep.bin to add some caching, what checks that this file isn't outdate when running tests?

## Requirements
- only build the binary when its code changes
- use a cached version of the binary in CI
- devs should be able to fetch the cached artifact
- need cache invalidation if the binary changes

## Cache Requirements
Start with simple case, implement basic cache using file age to determine if cache is valid/stale, the cache dir can be uploaded with Github Actions cache action for 

- cache based off of file hash? - apparently slower than timestamp, still doesn't feel slow

- create local cache directory
- create file with "cache age" for dep.bin
- check when util/build.js changed