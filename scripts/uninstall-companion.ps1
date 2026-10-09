[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$InstallDirectory, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This unregister script supports Windows only.' }
$destination = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
if ($destination -eq [IO.Path]::GetPathRoot($destination) -or -not (Test-Path -LiteralPath $destination -PathType Container)) { throw 'A valid installation directory is required.' }
$markerPath = Join-Path $destination 'installation.json'
if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'Installation ownership marker is missing.' }
$marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
$manifestPath = Join-Path $destination 'dev.agentcontrolhub.bridge.json'
$registrySubKey = 'Software\Google\Chrome\NativeMessagingHosts\dev.agentcontrolhub.bridge'
$registryPath = 'HKCU:\' + $registrySubKey
if ($marker.owner -ne 'agent-control-hub' -or $marker.version -ne 1 -or $marker.manifestPath -cne $manifestPath -or $marker.registryKey -cne $registryPath) { throw 'Installation ownership cannot be verified.' }
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registrySubKey)
if ($null -eq $key) { Write-Output 'No registration exists. Installation files and data were retained.'; return }
try { $registeredPath = $key.GetValue('') } finally { $key.Dispose() }
if ($registeredPath -cne $manifestPath) { throw 'Registration belongs to another installation; it was not changed.' }
if ($DryRun) { Write-Output "Would unregister owned native host at $manifestPath. Files and data would be retained."; return }
[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($registrySubKey, $false)
Write-Output "Unregistered native host. Files and private local data remain in $destination. Close the agents and browser before manually deleting that exact directory if you also want to erase its data."
