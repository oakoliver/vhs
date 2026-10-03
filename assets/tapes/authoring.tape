# Render: node dist/cli.js assets/tapes/authoring.tape (from the repo root)
Output assets/authoring.gif

Set Shell bash
Set FontFamily "Fira Code"
Set FontSize 18
Set Width 900
Set Height 380
Set Padding 28
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type `export PS1='> ' && D=$PWD && cd "$(mktemp -d)" && alias vhs="node $D/dist/cli.js" && clear`
Enter
Show

Type "vhs new demo"
Enter
Sleep 1s
Type "vhs validate demo.tape && echo valid"
Enter
Sleep 1.2s
Type `printf 'Type "unterminated\nSleep 1z\n' > broken.tape`
Enter
Type "vhs validate broken.tape"
Enter
Sleep 2s
Type "vhs themes | wc -l"
Enter
Sleep 2.5s
