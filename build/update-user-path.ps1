# craigtrim/axiom#206: edit long PATH values outside NSIS's bounded strings.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Add', 'Remove')]
    [string] $Operation,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $BinPath,
    [string] $EnvironmentKey = 'Environment'
)

$ErrorActionPreference = 'Stop'
$key = $null
try {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($EnvironmentKey, $true)
    if ($null -eq $key) {
        if ($Operation -eq 'Remove') { exit 0 }
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($EnvironmentKey)
    }
    $original = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    if ($null -ne $original) {
        $kind = $key.GetValueKind('Path')
        if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and
            $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) {
            throw 'The user PATH is not a string.'
        }
    }
    $entries = @()
    if ($null -ne $original) { $entries = @($original.Split(';')) }
    $target = $BinPath.TrimEnd('\')
    $kept = @($entries | Where-Object {
        -not [string]::Equals($_.Trim().Trim('"').TrimEnd('\'), $target, [StringComparison]::OrdinalIgnoreCase)
    })
    $matches = $entries.Count - $kept.Count
    if ($Operation -eq 'Add') {
        if ($matches -gt 0) { exit 0 }
        $updated = if ([string]::IsNullOrEmpty($original)) { $BinPath } else { $original + ';' + $BinPath }
        $key.SetValue('Path', $updated, $kind)
    } else {
        if ($matches -eq 0) { exit 0 }
        if ($kept.Count -eq 0) { $key.DeleteValue('Path', $false) }
        else { $key.SetValue('Path', ($kept -join ';'), $kind) }
    }
} catch {
    # The optional command registration must not abort an otherwise usable install.
    exit 1
} finally {
    if ($null -ne $key) { $key.Dispose() }
}
