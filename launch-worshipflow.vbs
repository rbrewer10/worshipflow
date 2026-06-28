Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Dev\worshipflow"
objShell.Run "cmd /c npm run dev", 0, False