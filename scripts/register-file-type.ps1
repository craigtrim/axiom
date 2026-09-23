<#
.SYNOPSIS
Associates .axiom workspace files with an installed copy of Axiom.

.DESCRIPTION
craigtrim/axiom#2. Writes a ProgID and an extension entry under the per-user class
root, which needs no administrator rights. Double-clicking a workspace then opens it
in the installed Axiom, which reads the path it is given at launch (craigtrim/axiom#1).

Point this at a stable install directory. The packaged output under artifacts/ carries
a build timestamp in its path, so registering that copy leaves a broken association
behind as soon as the next build replaces it.

.PARAMETER InstallDirectory
The directory holding Axiom.exe.

.PARAMETER Remove
Deletes the entries this script creates and leaves the class root otherwise untouched.

.PARAMETER RegistryRoot
The class root to write under. The default is the per-user one. Tests pass a scratch
key so they never touch a real association.

.EXAMPLE
pwsh -File scripts/register-file-type.ps1 -InstallDirectory "C:\Program Files\Axiom"

.EXAMPLE
pwsh -File scripts/register-file-type.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string] $InstallDirectory,
  [switch] $Remove,
  [string] $RegistryRoot = 'HKCU:\Software\Classes'
)
$ErrorActionPreference = 'Stop'
$extension = '.axiom'
$progId = 'Axiom.Workspace'
$extensionKey = Join-Path $RegistryRoot $extension
$progIdKey = Join-Path $RegistryRoot $progId

function Remove-AxiomAssociation {
  foreach ($key in @($progIdKey, $extensionKey)) {
    if (Test-Path -LiteralPath $key) {
      Remove-Item -LiteralPath $key -Recurse -Force -Confirm:$false
    }
  }
}

if ($Remove) {
  Remove-AxiomAssociation
  Write-Output "Removed the $extension association from $RegistryRoot."
}
else {
  if (-not $InstallDirectory) {
    throw 'Supply -InstallDirectory, the directory holding Axiom.exe.'
  }
  $resolved = (Resolve-Path -LiteralPath $InstallDirectory -ErrorAction Stop).Path
  $executable = Join-Path $resolved 'Axiom.exe'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "No Axiom.exe in $resolved. Install Axiom there first, then run this again."
  }
  # A previous ProgID can carry a command line pointing at a directory that is gone.
  Remove-AxiomAssociation
  New-Item -Path $progIdKey -Force | Out-Null
  Set-ItemProperty -LiteralPath $progIdKey -Name '(Default)' -Value 'Axiom Workspace'
  New-Item -Path (Join-Path $progIdKey 'DefaultIcon') -Force | Out-Null
  Set-ItemProperty -LiteralPath (Join-Path $progIdKey 'DefaultIcon') `
    -Name '(Default)' -Value ('"{0}",0' -f $executable)
  $commandKey = Join-Path $progIdKey 'shell\open\command'
  New-Item -Path $commandKey -Force | Out-Null
  Set-ItemProperty -LiteralPath $commandKey -Name '(Default)' `
    -Value ('"{0}" "%1"' -f $executable)
  New-Item -Path $extensionKey -Force | Out-Null
  Set-ItemProperty -LiteralPath $extensionKey -Name '(Default)' -Value $progId
  Set-ItemProperty -LiteralPath $extensionKey -Name 'PerceivedType' -Value 'document'
  Set-ItemProperty -LiteralPath $extensionKey -Name 'Content Type' `
    -Value 'application/x-axiom-workspace'
  Write-Output "Associated $extension with $executable."
}

# Explorer caches file types, so tell the shell to reread them. The association still
# takes effect without this; the icon would otherwise wait for the next sign-in.
if ($RegistryRoot -eq 'HKCU:\Software\Classes') {
  try {
    Add-Type -Namespace Axiom -Name Shell -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@ -ErrorAction Stop
    [Axiom.Shell]::SHChangeNotify(0x08000000, 0x0000, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
  }
  catch {
    Write-Warning "The shell was not notified, so Explorer may show the old icon until you sign in again. $($_.Exception.Message)"
  }
}
