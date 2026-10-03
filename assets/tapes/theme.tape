# Template for assets/tapes/theme.sh (THEME and OUT are substituted).
Output assets/themes/discard.gif
Set Shell bash
Set FontFamily "Fira Code"
Set FontSize 16
Set Width 560
Set Height 170
Set Padding 20
Set Theme "THEME"

Hide
Type `export PS1='> ' && clear`
Enter
Type `clear; printf '\e[1m%s\e[0m\n' 'THEME'; for i in 0 1 2 3 4 5 6 7; do printf '\e[4%sm   \e[0m' $i; done; echo; for i in 0 1 2 3 4 5 6 7; do printf '\e[10%sm   \e[0m' $i; done; echo; printf '\e[31mred \e[32mgreen \e[33myellow \e[34mblue \e[35mmagenta \e[36mcyan\e[0m\n'`
Enter
Sleep 500ms
Show
Sleep 300ms
Screenshot OUT
