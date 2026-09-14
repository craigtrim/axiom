param([string]$NativeSource)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -Path $NativeSource
function Capture([scriptblock]$Action) {
 try { return @{status='collected';value=(& $Action)} } catch { return @{status='unavailable';message=$_.Exception.Message;category=[string]$_.CategoryInfo.Category} }
}
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $request=$line|ConvertFrom-Json
  $itemPath=[string]$request.path
  if($request.mode -eq 'journal'){[Console]::WriteLine(([AxiomFileMetadata]::Journal($itemPath,[string[]]$request.fileIds,[int]$request.timeoutSeconds)|ConvertTo-Json -Depth 20 -Compress));continue}
  $record=@{path=$itemPath;observedAt=[DateTime]::UtcNow.ToString('o');native=(Capture { [AxiomFileMetadata]::Native($itemPath) })}
  $item=Get-Item -LiteralPath $itemPath -Force
  $record.fileInfo=Capture {
   $fields=@{}
   foreach($property in $item.GetType().GetProperties()) {
    if($property.GetIndexParameters().Length -eq 0 -and $property.Name -notin @('Directory','Parent')) {
     try { $value=$property.GetValue($item);if($value -is [DateTime]){$value=$value.ToUniversalTime().ToString('o')}elseif($null -ne $value -and $value -isnot [string] -and $value -isnot [ValueType]){$value=[string]$value};$fields[$property.Name]=$value } catch {$fields[$property.Name]=@{status='unavailable';message=$_.Exception.Message}}
    }
   }
   return $fields
  }
  $offline=([long]$item.Attributes -band 0x441000) -ne 0
  $reparse=([long]$item.Attributes -band 0x400) -ne 0
  $record.additionalNative=Capture {[AxiomFileMetadata]::Additional($itemPath,(-not $item.PSIsContainer -and -not $reparse -and (-not $offline -or $request.readOffline)))}
  if($reparse -or ($offline -and -not $request.readOffline)) {
   $record.properties=@{status='not-read';reason='Offline or recall-on-access file; content-backed property handlers were not invoked.'}
   $record.versionInfo=@{status='not-read';reason='Offline or recall-on-access file'}
   $record.signature=@{status='not-read';reason='Offline or recall-on-access file'}
  } else {
   $record.properties=Capture { [AxiomFileMetadata]::Properties($itemPath) }
   $record.versionInfo=Capture {if(-not $item.PSIsContainer){$info=[Diagnostics.FileVersionInfo]::GetVersionInfo($itemPath);$fields=@{};foreach($property in $info.GetType().GetProperties()){if($property.GetIndexParameters().Length -eq 0){$fields[$property.Name]=$property.GetValue($info)}};return $fields}}
   $record.signature=Capture {if(-not $item.PSIsContainer){$sig=Get-AuthenticodeSignature -LiteralPath $itemPath;$cert=$sig.SignerCertificate;$timeCert=$sig.TimeStamperCertificate;return @{status=[string]$sig.Status;statusMessage=$sig.StatusMessage;signatureType=[string]$sig.SignatureType;isOSBinary=$sig.IsOSBinary;signer=if($cert){@{subject=$cert.Subject;issuer=$cert.Issuer;serial=$cert.SerialNumber;thumbprint=$cert.Thumbprint;notBefore=$cert.NotBefore.ToUniversalTime().ToString('o');notAfter=$cert.NotAfter.ToUniversalTime().ToString('o');certificateBase64=[Convert]::ToBase64String($cert.RawData)}}else{$null};timeStamper=if($timeCert){@{subject=$timeCert.Subject;issuer=$timeCert.Issuer;thumbprint=$timeCert.Thumbprint;certificateBase64=[Convert]::ToBase64String($timeCert.RawData)}}else{$null}}}}
  }
  $record.security=Capture {$acl=Get-Acl -LiteralPath $itemPath;return @{owner=$acl.Owner;ownerSid=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;groupSid=$acl.GetGroup([Security.Principal.SecurityIdentifier]).Value;sddl=$acl.Sddl;areAccessRulesProtected=$acl.AreAccessRulesProtected;areAccessRulesCanonical=$acl.AreAccessRulesCanonical;rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object {@{identity=$_.IdentityReference.Value;rights=[string]$_.FileSystemRights;type=[string]$_.AccessControlType;inherited=$_.IsInherited;inheritance=[string]$_.InheritanceFlags;propagation=[string]$_.PropagationFlags}})}}
  $record.auditSecurity=Capture {$acl=Get-Acl -LiteralPath $itemPath -Audit;return @{sddl=$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Audit);rules=@($acl.GetAuditRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object {@{identity=$_.IdentityReference.Value;rights=[string]$_.FileSystemRights;flags=[string]$_.AuditFlags;inherited=$_.IsInherited;inheritance=[string]$_.InheritanceFlags;propagation=[string]$_.PropagationFlags}})}}
  $record.streams=Capture {@(Get-Item -LiteralPath $itemPath -Stream * -ErrorAction Stop|ForEach-Object { $stream=@{name=$_.Stream;length=[string]$_.Length};if($_.Stream -eq 'Zone.Identifier' -and $_.Length -le 1048576){ $stream.text=[string](Get-Content -LiteralPath $itemPath -Stream $_.Stream -Raw)}elseif($_.Stream -eq 'Zone.Identifier'){$stream.text=@{status='unavailable';reason='Zone.Identifier exceeds the 1 MB text limit'}};$stream })}
  [Console]::WriteLine(($record|ConvertTo-Json -Depth 40 -Compress))
 }catch{[Console]::WriteLine((@{path=$itemPath;status='error';message=$_.Exception.Message}|ConvertTo-Json -Compress))}
}
