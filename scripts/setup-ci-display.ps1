# #165: native layout tests need enough desktop space for their real controls.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') {
    throw 'This changes the native display and must only run on the GitHub Windows runner.'
}
Add-Type -AssemblyName System.Windows.Forms
Write-Output ('Initial display: ' + [System.Windows.Forms.Screen]::PrimaryScreen.Bounds)
# Supported by the hosted Windows image: actions/runner-images#2935.
Set-DisplayResolution -Width 1920 -Height 1080 -Force
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output ('Test display: ' + $bounds)
if ($bounds.Width -lt 1920 -or $bounds.Height -lt 1080) {
    throw 'The runner could not provide the native display required by the desktop suite.'
}
