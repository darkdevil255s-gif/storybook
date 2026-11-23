' Offline storybook launcher (no server authentication)
' Place this file beside the site folder
' For protected preview, run npm run dev and use http://127.0.0.1:8766
' Double-click opens an offline fullscreen preview only

Option Explicit

Dim fso, scriptDir, htmlFile, url, shell, edge

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
htmlFile  = scriptDir & "\site\index.html"

' Check the HTML exists
If Not fso.FileExists(htmlFile) Then
    MsgBox "site\index.html not found in: " & scriptDir & vbCrLf & _
           "Make sure Start.vbs is beside the site folder.", _
           vbCritical, "Storybook"
    WScript.Quit
End If

' Build file:/// URL
url = "file:///" & Replace(htmlFile, "\", "/")

' Try launching Edge
Set shell = CreateObject("WScript.Shell")

Dim edgeExe
edgeExe = ""

' Check common Edge locations
Dim candidates(2)
candidates(0) = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
candidates(1) = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
candidates(2) = "msedge"

Dim i
For i = 0 To 1
    If fso.FileExists(candidates(i)) Then
        edgeExe = """" & candidates(i) & """"
        Exit For
    End If
Next

' Fallback: use msedge from PATH
If edgeExe = "" Then edgeExe = "msedge"

' Build command — app mode removes all browser chrome; start-fullscreen fills the screen
Dim cmd
cmd = edgeExe & " --app=""" & url & """" & _
      " --start-fullscreen" & _
      " --no-first-run" & _
      " --disable-translate" & _
      " --disable-features=TranslateUI" & _
      " --hide-scrollbars" & _
      " --overscroll-history-navigation=0"

' Run silently (0 = hidden shell window)
shell.Run cmd, 0, False

Set shell = Nothing
Set fso   = Nothing
