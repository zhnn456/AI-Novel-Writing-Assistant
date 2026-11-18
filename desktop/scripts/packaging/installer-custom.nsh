; 自定义 NSIS 片段（品牌统一）
;
; 背景：electron-builder 的安装目录默认取 package name（@ai-novel/desktop），
; 安装向导里会显示成 `@ai-noveldesktop`。这里在 .onInit 里把安装目录的末级名换成人看的品牌名，
; 但只在“末级名仍是 @ai-noveldesktop”时替换：调用方用 /D= 指定了目录（如自动校验脚本）时保持原样；
; 上级目录（Program Files / 用户目录）仍沿用 electron-builder 与 multiUser.nsh 的选择，不写死盘符。

!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macro customInit
  ${GetFileName} "$INSTDIR" $1
  ${If} $1 == "@ai-noveldesktop"
    ${GetParent} "$INSTDIR" $0
    ${If} $0 != ""
      StrCpy $INSTDIR "$0\鲸喜AI写作"
    ${EndIf}
  ${EndIf}
!macroend
