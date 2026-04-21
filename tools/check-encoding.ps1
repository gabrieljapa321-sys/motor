param(
  [string[]]$Paths = @(
    "index.html",
    "assets/css/*.css",
    "assets/js/*.js"
  )
)

$ErrorActionPreference = "Stop"

$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$mojibakePattern = [regex]::new('\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF ]|\u00E2[\u0080-\u00BF]{1,2}|\u00F0\u0178|\uFFFD')
$problems = New-Object System.Collections.Generic.List[string]

function Resolve-TargetFiles {
  param([string[]]$InputPaths)

  $resolved = New-Object System.Collections.Generic.List[string]

  foreach ($path in $InputPaths) {
    if ($path.IndexOfAny([char[]]"*?") -ge 0) {
      Get-ChildItem -Path $path -File | ForEach-Object {
        $resolved.Add($_.FullName)
      }
      continue
    }

    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $resolved.Add((Resolve-Path -LiteralPath $path).Path)
      continue
    }

    throw "Caminho nao encontrado: $path"
  }

  return $resolved | Sort-Object -Unique
}

foreach ($file in Resolve-TargetFiles -InputPaths $Paths) {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $content = $utf8Strict.GetString($bytes)
  } catch {
    $problems.Add("${file}: bytes invalidos para UTF-8.")
    continue
  }

  $lines = $content -split "`r?`n"
  for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if (-not $mojibakePattern.IsMatch($line)) {
      continue
    }

    $snippet = $line.Trim()
    if ($snippet.Length -gt 140) {
      $snippet = $snippet.Substring(0, 140) + "..."
    }

    $problems.Add("${file}:$($i + 1): sequencia suspeita -> $snippet")
  }
}

if ($problems.Count -gt 0) {
  $problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "UTF-8 OK: nenhum byte invalido ou sequencia suspeita encontrada."
