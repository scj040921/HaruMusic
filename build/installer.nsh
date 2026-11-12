# 设置 Windows 7 兼容性
ManifestDPIAware true
ManifestSupportedOS all

!macro customInit
  # 检查系统版本
  ${If} ${AtLeastWin7}
    # Windows 7 或更高版本
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "此应用程序需要 Windows 7 或更高版本。"
    Abort
  ${EndIf}
!macroend
# Close only the executable at the destination installation path, including helpers.
!macro customCheckAppRunning
  System::Call 'kernel32::SetEnvironmentVariable(t "HARUMUSIC_UPDATE_TARGET", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -Command "$$target = [IO.Path]::GetFullPath($$env:HARUMUSIC_UPDATE_TARGET); $$apps = @(Get-Process | Where-Object { $$_.Path -eq $$target }); foreach ($$item in $$apps) { [void]$$item.CloseMainWindow() }; Start-Sleep -Milliseconds 1000; foreach ($$item in $$apps) { if (-not $$item.HasExited) { & '$SYSDIR\taskkill.exe' /PID $$item.Id /T /F | Out-Null } }; if (@(Get-Process | Where-Object { $$_.Path -eq $$target }).Count) { exit 1 }"
!macroend
