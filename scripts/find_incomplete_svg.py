import re
s=open('src/builtin-icons.ts','r',encoding='utf8').read()
pattern=re.compile(r'"svgData"\s*:\s*"',re.M)
pos=0
bad=[]
while True:
    m=pattern.search(s,pos)
    if not m: break
    start=m.end()
    # find the closing '"' that ends the string literal (handle escaped quotes)
    i=start
    escaped=False
    while i<len(s):
        c=s[i]
        if escaped:
            escaped=False
        elif c=='\\':
            escaped=True
        elif c=='"':
            end=i
            break
        i+=1
    val=s[start:end]
    if '</svg>' not in val:
        # find the surrounding name key
        # get previous 200 chars for context
        context=s[max(0,m.start()-200):m.start()+200]
        name_match=re.search(r'"(.*?)"\s*:\s*{',s[:m.start()][-200:][::-1])
        bad.append((m.start(),context))
    pos=end+1
if not bad:
    print('All svgData values contain </svg>')
else:
    print('Found',len(bad),'svgData values missing </svg>')
    for idx,(p,ctx) in enumerate(bad):
        print('\n-- Entry',idx+1,'context:\n')
        print(ctx)
