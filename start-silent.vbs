' Lorekeeper silent launcher — no terminal window
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c cd /d I:\Lorekeeper && npx electron src/main.js", 0, False
Set shell = Nothing
