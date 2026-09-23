# craigtrim/axiom#6: the .axiom association, written per user so the installer needs
# no elevation. electron-builder emits its own fileAssociations only for a per-machine
# install, so these keys are written here instead, matching the layout Microsoft
# documents for HKEY_CURRENT_USER\Software\Classes.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\Axiom.Workspace" "" "Axiom Workspace"
  WriteRegStr HKCU "Software\Classes\Axiom.Workspace\DefaultIcon" "" "$INSTDIR\Axiom.exe,0"
  WriteRegStr HKCU "Software\Classes\Axiom.Workspace\shell\open\command" "" '"$INSTDIR\Axiom.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.axiom" "" "Axiom.Workspace"
  WriteRegStr HKCU "Software\Classes\.axiom" "PerceivedType" "document"
  WriteRegStr HKCU "Software\Classes\.axiom" "Content Type" "application/x-axiom-workspace"
  # Explorer caches file types. Without this the icon waits for the next sign-in.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Axiom.Workspace"
  DeleteRegValue HKCU "Software\Classes\.axiom" "PerceivedType"
  DeleteRegValue HKCU "Software\Classes\.axiom" "Content Type"
  # The extension's Default value stays. Another application may have taken the type
  # over since, and Windows ignores a Default value naming a ProgID that is gone.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
