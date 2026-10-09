[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'AgentControlHub'),
  [string]$NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source,
  [string]$BundleDirectory = (Join-Path $PSScriptRoot '..\companion-dist'),
  [switch]$DryRun,
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'The installer supports Windows only. The stdio core is portable.' }
function Get-SafeAbsolutePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[%!?&|<>^"\r\n]' -or $Value.StartsWith('\\')) { throw 'Unsupported path characters or network path.' }
  $resolved = [System.IO.Path]::GetFullPath($Value)
  if ($resolved -eq [System.IO.Path]::GetPathRoot($resolved)) { throw 'A filesystem root cannot be used.' }
  return $resolved.TrimEnd('\')
}
function New-Secret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}
$destination = Get-SafeAbsolutePath $InstallDirectory
$nodePath = Get-SafeAbsolutePath $NodeExecutable
$bundlePath = Get-SafeAbsolutePath $BundleDirectory
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf) -or [IO.Path]::GetExtension($nodePath) -ne '.exe') { throw 'An existing Node executable is required.' }
$nodeVersion = & $nodePath --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22 or newer is required.' }
foreach ($entry in @('native-host.cjs', 'claude-code.cjs', 'codex.cjs')) {
  if (-not (Test-Path -LiteralPath (Join-Path $bundlePath $entry) -PathType Leaf)) { throw "Missing compiled companion entry: $entry. Run npm run build:companion first." }
}
$registrySubKey = 'Software\Google\Chrome\NativeMessagingHosts\dev.agentcontrolhub.bridge'
$registryPath = 'HKCU:\' + $registrySubKey
$manifestPath = Join-Path $destination 'dev.agentcontrolhub.bridge.json'
$dataPath = Join-Path $destination 'data'
if (Test-Path -LiteralPath $destination) { throw 'Install directory already exists. Uninstall the owned registration and choose a fresh directory; existing data is never overwritten.' }
$existing = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registrySubKey)
if ($null -ne $existing) { $existing.Dispose(); if (-not $PrepareOnly) { throw 'A native host registration already exists. Uninstall its owning installation first.' } }
if ($DryRun) {
  [ordered]@{ dryRun = $true; prepareOnly = [bool]$PrepareOnly; extensionId = $ExtensionId; installDirectory = $destination; nodeExecutable = $nodePath; bundleDirectory = $bundlePath; registryKey = $registryPath; manifest = $manifestPath; mutatesCliConfiguration = $false } | ConvertTo-Json
  return
}
# Fail before writing credentials when Windows cannot enforce a private directory ACL.
New-Item -ItemType Directory -Path $destination | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagation = [Security.AccessControl.PropagationFlags]::None
$allow = [Security.AccessControl.AccessControlType]::Allow
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance, $propagation, $allow)))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), 'FullControl', $inheritance, $propagation, $allow)))
# A Node child can inherit a PowerShell 7 PSModulePath while executing Windows PowerShell 5.
# Resolve the trusted module from this interpreter, never from the inherited search path.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Microsoft.PowerShell.Security\Set-Acl -LiteralPath $destination -AclObject $acl
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-JsonFile([string]$Path, $Value) { [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), $utf8) }
New-Item -ItemType Directory -Path $dataPath | Out-Null
foreach ($entry in @('native-host.cjs', 'claude-code.cjs', 'codex.cjs')) { Copy-Item -LiteralPath (Join-Path $bundlePath $entry) -Destination (Join-Path $destination $entry) }
$claudeSecret = New-Secret
$codexSecret = New-Secret
Write-JsonFile (Join-Path $destination 'host-config.json') @{ version = 1; extensionId = $ExtensionId; dataDirectory = $dataPath; secrets = @{ 'claude-code' = $claudeSecret; codex = $codexSecret } }
Write-JsonFile (Join-Path $destination 'claude-code-config.json') @{ version = 1; sourceId = 'claude-code'; dataDirectory = $dataPath; secret = $claudeSecret }
Write-JsonFile (Join-Path $destination 'codex-config.json') @{ version = 1; sourceId = 'codex'; dataDirectory = $dataPath; secret = $codexSecret }
$runnerPath = Join-Path $destination 'native-host.cmd'
$runner = "@echo off`r`nchcp 65001 >nul`r`nsetlocal DisableDelayedExpansion`r`n`"$nodePath`" `"%~dp0native-host.cjs`" --config `"%~dp0host-config.json`" %*`r`n"
[IO.File]::WriteAllText($runnerPath, $runner, $utf8)
Write-JsonFile $manifestPath @{ name = 'dev.agentcontrolhub.bridge'; description = 'Agent Control Hub local event bridge'; path = $runnerPath; type = 'stdio'; allowed_origins = @("chrome-extension://$ExtensionId/") }
Write-JsonFile (Join-Path $destination 'installation.json') @{ owner = 'agent-control-hub'; version = 1; manifestPath = $manifestPath; registryKey = $registryPath; installedAt = [DateTime]::UtcNow.ToString('o') }
$claudeConfig = @{ mcpServers = @{ hub = @{ command = $nodePath; args = @((Join-Path $destination 'claude-code.cjs'), '--config', (Join-Path $destination 'claude-code-config.json')) } } }
Write-JsonFile (Join-Path $destination 'claude-mcp.json') $claudeConfig
# JSON basic strings are also TOML basic strings for these constrained Windows paths.
$tomlCommand = ConvertTo-Json $nodePath -Compress
$tomlEntry = ConvertTo-Json (Join-Path $destination 'codex.cjs') -Compress
$tomlConfig = ConvertTo-Json (Join-Path $destination 'codex-config.json') -Compress
[IO.File]::WriteAllText((Join-Path $destination 'codex-mcp.toml'), "[mcp_servers.hub]`r`nenabled = true`r`nrequired = true`r`nstartup_timeout_sec = 30`r`ncommand = $tomlCommand`r`nargs = [$tomlEntry, `"--config`", $tomlConfig]`r`n", $utf8)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-companion.ps1') -Destination (Join-Path $destination 'uninstall-companion.ps1')
$setupGuide = @"
Agent Control Hub is installed for extension $ExtensionId.
Enable the companion in the extension settings and grant nativeMessaging permission.
No Claude or Codex configuration has been modified.

Refresh agent discovery in the extension, then explicitly launch a standard task. Hub-owned launches are tracked automatically and can be cancelled while this host owns their live process. CLI availability does not prove authentication. Prompt and result retention are separate: results are discarded unless you explicitly choose to retain them for that launch. Browser launch is currently unavailable. Update the extension and companion together.

The commands below are optional: they instrument existing external sessions using MCP tools.

Claude Code isolated session (run from a trusted project):
claude --mcp-config "$destination\claude-mcp.json" --strict-mcp-config

Codex: review $destination\codex-mcp.toml and manually merge its section into your project .codex/config.toml. Do not overwrite existing configuration. Project trust requirements still apply.

Ask the agent to call hub_start_task, keep the returned taskHandle, report updates with hub_update_task or hub_ask_question, and finish with hub_complete_task or hub_fail_task. Never send secrets or complete prompts. Model name may be omitted.

The adapters report queued, not delivered. Verify receipt in the hub. These tools do not grant shell, network, cancellation, or approval capabilities. Native navigation can open a supplied safe HTTP(S) context or a manually attached current browser tab; it cannot focus a CLI terminal.

Unregister (data retained): powershell -NoProfile -File "$destination\uninstall-companion.ps1" -InstallDirectory "$destination"
"@
[IO.File]::WriteAllText((Join-Path $destination 'SETUP.txt'), $setupGuide, $utf8)
# Registration is the final write, only after every required file was created successfully.
if ($PrepareOnly) { Write-Output "Prepared companion files without registry changes: $destination"; return }
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registrySubKey)
try { $key.SetValue('', $manifestPath, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Dispose() }
Write-Output "Installed Agent Control Hub. Setup instructions: $(Join-Path $destination 'SETUP.txt')"
