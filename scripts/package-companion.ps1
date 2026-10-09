[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release'))
$ErrorActionPreference = 'Stop'
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = [IO.Path]::GetFullPath($OutputDirectory)
if ($output -eq [IO.Path]::GetPathRoot($output)) { throw 'Refusing a filesystem root output directory.' }
$package = Join-Path $output 'agent-control-hub-companion-0.1.0'
if (Test-Path -LiteralPath $package) { throw 'Package directory already exists; choose a fresh output directory.' }
foreach ($entry in @('native-host.cjs', 'claude-code.cjs', 'codex.cjs')) {
  if (-not (Test-Path -LiteralPath (Join-Path $extensionRoot "companion-dist\$entry") -PathType Leaf)) { throw 'Run npm run build:companion first.' }
}
New-Item -ItemType Directory -Path (Join-Path $package 'companion-dist') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $package 'scripts') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $package 'docs') | Out-Null
foreach ($entry in @('native-host.cjs', 'claude-code.cjs', 'codex.cjs')) { Copy-Item -LiteralPath (Join-Path $extensionRoot "companion-dist\$entry") -Destination (Join-Path $package "companion-dist\$entry") }
foreach ($script in @('install-companion.ps1', 'uninstall-companion.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $package "scripts\$script") }
foreach ($doc in @('integrations.md', 'privacy.md')) { Copy-Item -LiteralPath (Join-Path $extensionRoot "docs\$doc") -Destination (Join-Path $package "docs\$doc") }
Copy-Item -LiteralPath (Join-Path $extensionRoot 'package-lock.json') -Destination (Join-Path $package 'package-lock.json')
$hashes = Get-ChildItem -LiteralPath (Join-Path $package 'companion-dist') -File | Get-FileHash -Algorithm SHA256 | Select-Object @{ Name = 'file'; Expression = { [IO.Path]::GetFileName($_.Path) } }, Hash
$hashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'SHA256SUMS.json') -Encoding utf8
Compress-Archive -LiteralPath $package -DestinationPath ($package + '.zip')
Write-Output ($package + '.zip')
