$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  $pyScript = @'
import pathlib
import sys

import esprima

root = pathlib.Path(".")
files = sorted(root.glob("assets/js/*.js"))
if not files:
    print("Nenhum arquivo JS encontrado em assets/js.")
    sys.exit(1)

failed = False
for path in files:
    code = path.read_text(encoding="utf-8")
    try:
        source_type = "module" if path.name == "firebase-init.js" or "import " in code or "export " in code else "script"
        if source_type == "module":
            esprima.parseModule(code, {"tolerant": False})
        else:
            esprima.parseScript(code, {"tolerant": False})
        print(f"OK {path.as_posix()}")
    except Exception as exc:
        failed = True
        print(f"FAIL {path.as_posix()}: {exc}")

if failed:
    sys.exit(1)

print("JS OK: sintaxe válida em todos os arquivos.")
'@

  $pyScript | py -
}
finally {
  Pop-Location
}
