import sys
s=open('src/builtin-icons.ts','r',encoding='utf8').read()
stack=0
in_str=None
esc=False
line=1
col=0
for i,ch in enumerate(s):
    if ch=='\n':
        line+=1; col=0; continue
    col+=1
    if esc:
        esc=False
        continue
    if in_str:
        if ch=='\\': esc=True
        elif ch==in_str:
            in_str=None
        continue
    if ch in ('"','\'','`'):
        in_str=ch
        continue
    if ch=='{': stack+=1
    elif ch=='}':
        if stack==0:
            print('Unmatched } at',line,col)
            sys.exit(0)
        stack-=1

if in_str:
    print('Unclosed string started with',in_str)
elif stack!=0:
    print('Unclosed { remain:',stack)
else:
    print('All good')
