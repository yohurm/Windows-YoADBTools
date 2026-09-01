; Overlay upgrade must not wipe settings / logs / data under $INSTDIR.
; Relaunch is owned by yohu-update apply helper (wait-for-PID → /S → start exe).

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
