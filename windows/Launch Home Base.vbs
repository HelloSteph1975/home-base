' Starts Home Base if needed and opens it. Used by the Desktop shortcut.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = appDir
code = shell.Run("node scripts\launch.js", 0, True)
If code <> 0 Then MsgBox "Home Base couldn't start. Open server.log in " & appDir & " and read the last lines.", 48, "Home Base"
