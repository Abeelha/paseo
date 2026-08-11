$ErrorActionPreference = "Stop"

# Run after pulling/rebasing upstream — reinstalls deps (patch-package needs a
# clean node_modules to re-apply patches correctly), rebuilds generated
# packages (protocol/server/client stay stale after upstream changes), and
# typechecks the whole workspace so drift surfaces immediately.

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

Write-Host "==> npm install" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "==> build:protocol" -ForegroundColor Cyan
npm run build:protocol
if ($LASTEXITCODE -ne 0) { throw "build:protocol failed" }

Write-Host "==> build:server" -ForegroundColor Cyan
npm run build:server
if ($LASTEXITCODE -ne 0) { throw "build:server failed" }

Write-Host "==> typecheck (whole workspace)" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed - see errors above" }

Write-Host ""
Write-Host "Rebuild clean." -ForegroundColor Green
