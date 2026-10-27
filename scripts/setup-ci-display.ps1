# #165: native layout tests need enough desktop space for their real controls.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') {
    throw 'This changes the native display and must only run on the GitHub Windows runner.'
}
Write-Output 'Initial display:'
Get-DisplayResolution
# Supported by the hosted Windows image: actions/runner-images#2935.
Set-DisplayResolution -Width 1920 -Height 1080 -Force
# Screen caches its first enumeration; load/query it only after the resize.
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output ('Test display: ' + $bounds)
if ($bounds.Width -lt 1920 -or $bounds.Height -lt 1080) {
    throw 'The runner could not provide the native display required by the desktop suite.'
}
