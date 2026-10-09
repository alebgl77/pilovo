param([Parameter(Mandatory=$true)][ValidateSet('register','unregister')][string]$Action,[Parameter(Mandatory=$true)][string]$ManifestPath)
$ErrorActionPreference='Stop'
$expected=[IO.Path]::GetFullPath($ManifestPath)
if($expected -ne $ManifestPath){throw 'Exact absolute manifest path required.'}
$subkey='Software\Google\Chrome\NativeMessagingHosts\dev.agentcontrolhub.bridge'
if($Action -eq 'register'){
  $existing=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($subkey)
  if($null -ne $existing){$existing.Dispose();throw 'Existing native host registration was not overwritten.'}
  $manifest=Get-Content -LiteralPath $expected -Raw | ConvertFrom-Json
  if($manifest.name -ne 'dev.agentcontrolhub.bridge' -or $manifest.allowed_origins.Count -ne 1){throw 'Unexpected test manifest.'}
  $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($subkey)
  try{if($null -ne $key.GetValue('')){throw 'Registration appeared concurrently; not overwritten.'};$key.SetValue('',$expected,[Microsoft.Win32.RegistryValueKind]::String)}finally{$key.Dispose()}
  Write-Output 'Owned temporary registration created.'
}else{
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($subkey)
  if($null -eq $key){Write-Output 'Registration absent.';return}
  try{$current=$key.GetValue('')}finally{$key.Dispose()}
  if($current -cne $expected){throw 'Registration changed owner; refusing cleanup.'}
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($subkey,$false)
  Write-Output 'Owned temporary registration removed.'
}
