' Stops Home Base. Used by the 9 PM task.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = appDir
shell.Run "node scripts\stop.js", 0, True
