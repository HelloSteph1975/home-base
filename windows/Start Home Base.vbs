' Starts Home Base without opening a window. Used by the morning task.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = appDir
shell.Run "node scripts\launch.js --no-open", 0, True
