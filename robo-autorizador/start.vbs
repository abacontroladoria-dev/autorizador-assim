Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

currentFolder = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run """" & currentFolder & "\start.bat""", 0, False