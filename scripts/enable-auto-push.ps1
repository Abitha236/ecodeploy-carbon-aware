$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
git -C $root config --local core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) { throw 'Could not enable the Git post-commit hook.' }
Write-Host 'Automatic push is enabled for every future commit. Configure origin and authenticate with Git Credential Manager first.'
