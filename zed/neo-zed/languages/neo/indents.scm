; Indent after opening brace
(_ "{" @indent "}" @end)

; Dedent on closing brace
"}" @outdent
