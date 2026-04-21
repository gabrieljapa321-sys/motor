$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  Write-Host "== Encoding =="
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-encoding.ps1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha na validação de encoding."
  }

  Write-Host "`n== JavaScript =="
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-js-syntax.ps1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha na validação de sintaxe JS."
  }

  Write-Host "`n== Inline handlers =="
  $inlineHits = Select-String -Path .\index.html -Pattern 'on(click|change|submit|input|keydown)='
  if ($inlineHits) {
    $inlineHits | ForEach-Object { Write-Host ("FAIL index.html:{0}: {1}" -f $_.LineNumber, $_.Line.Trim()) }
    throw "Foram encontrados handlers inline no HTML."
  }
  Write-Host "HTML OK: nenhum handler inline encontrado."

  Write-Host "`n== CSS split =="
  $cssFiles = @(
    ".\\assets\\css\\app.css",
    ".\\assets\\css\\base.css",
    ".\\assets\\css\\dashboard.css",
    ".\\assets\\css\\calendar.css",
    ".\\assets\\css\\grades.css",
    ".\\assets\\css\\week.css",
    ".\\assets\\css\\flashcards.css"
  )
  $missing = $cssFiles | Where-Object { -not (Test-Path $_) }
  if ($missing) {
    $missing | ForEach-Object { Write-Host "FAIL $_" }
    throw "Estrutura de CSS incompleta."
  }
  Write-Host "CSS OK: folhas por domínio encontradas."

  Write-Host "`nValidação concluída."
}
finally {
  Pop-Location
}
