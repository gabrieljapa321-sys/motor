$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  & py -m unittest tests.test_browser_smoke -v
  if ($LASTEXITCODE -ne 0) {
    throw "Falha nos testes de navegador."
  }
}
finally {
  Pop-Location
}
