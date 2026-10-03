# Render: node dist/cli.js assets/tapes/hero.tape (from the repo root)
Output assets/hero.gif

Set Shell bash
Set FontFamily "Fira Code"
Set FontSize 20
Set Width 1100
Set Height 640
Set Padding 28
Set Margin 24
Set MarginFill "#674EFF"
Set WindowBar Colorful
Set BorderRadius 10
Set Theme "Dracula"
Set TypingSpeed 45ms

Hide
Type "export PS1='\[\e[35m\]> \[\e[0m\]' && clear"
Enter
Show

Type "# This GIF was rendered from the tape it prints."
Enter
Sleep 300ms
Type "sed -n '4,16p' assets/tapes/hero.tape"
Sleep 300ms
Enter
Wait+Screen /BorderRadius/
Sleep 2.5s
Type "printf 'Hello from \e[1;35m@oakoliver/vhs\e[0m\n'"
Sleep 300ms
Enter
Wait+Screen /Hello from/
Sleep 2s
