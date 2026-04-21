$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\validate.ps1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha nas validações base."
  }

  Write-Host "`n== Python tests =="
  & py -m unittest discover -s tests -p "test_*.py" -v
  if ($LASTEXITCODE -ne 0) {
    throw "Falha nos testes Python."
  }
}
finally {
  Pop-Location
}
