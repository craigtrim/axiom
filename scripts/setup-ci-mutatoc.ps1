# #165: install the same verified native runtime used by local desktop tests.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') {
    throw 'This runtime setup is reserved for the GitHub Windows runner.'
}
$archive = Join-Path $env:RUNNER_TEMP 'mutatoc-0.7.0.zip'
$extracted = Join-Path $env:RUNNER_TEMP 'mutatoc-0.7.0'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/craigtrim/mutatoc/releases/download/v0.7.0/mutatoc-win-x64-0.7.0.zip' -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne '21e08f5b4c31cf8dc8b2e15a34e6a4ac5fcb437e92552a2defdbcd376293e549') {
    throw 'Mutatoc 0.7.0 archive checksum mismatch.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $extracted
$manifests = @(Get-ChildItem -LiteralPath $extracted -Recurse -File -Filter 'package-manifest.json')
if ($manifests.Count -ne 1) { throw 'Expected one Mutatoc package manifest.' }
node scripts/setup-mutatoc.mjs $manifests[0].DirectoryName
if ($LASTEXITCODE -ne 0) { throw 'Mutatoc runtime verification failed.' }
