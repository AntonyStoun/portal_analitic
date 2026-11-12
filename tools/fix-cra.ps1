<#
  fix-cra.ps1 — очистка реестра от сайтов районных советов (consiliu raional)

  Автоматический обход (probe-sites.ps1) по шаблону "<nume>.md" иногда находит
  официальный сайт CONSILIUL RAIONAL (районный совет), а не примэрию. Для записи
  города-райцентра это подмена: совет и примэрия — разные органы.

  Что делает:
    1. читает data/parts/sites_probe_*.json и находит попадания, где заголовок
       страницы содержит "consiliu raional";
    2. выносит их в data/parts/cra_removed.json (сборка их не читает);
    3. для каждой такой записи пробует адрес именно примэрии
       (primaria<nume>.md, primaria-<nume>.md, primarie<nume>.md, <nume>.primarie.md);
       подтверждённый результат пишет в data/parts/sites_cra_fix.json —
       он читается сборкой РАНЬШЕ файлов обхода, то есть выигрывает;
    4. если адреса примэрии нет — ничего не выдумывает, запись остаётся без сайта.

  Запуск: powershell -ExecutionPolicy Bypass -File tools\fix-cra.ps1
#>
[CmdletBinding()]
param([string]$Root = '', [int]$Timeout = 12, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root  = (Resolve-Path $Root).Path
$parts = Join-Path $Root 'data\parts'
$UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

function Norm([string]$s){
  if (-not $s) { return '' }
  $s = $s.ToLower()
  $s = $s -replace 'ă','a'; $s = $s -replace 'â','a'; $s = $s -replace 'î','i'
  $s = $s -replace 'ș','s'; $s = $s -replace 'ş','s'; $s = $s -replace 'ț','t'; $s = $s -replace 'ţ','t'
  $s = $s -replace '[^a-z0-9]',''
  return $s.Trim()
}

$GOOD = @('primar','consiliu','administra','edilitat','primarie','locala','uat','primar')
$BAD  = @('for sale','this domain','domain is for','parker','sedo','afternic','under construction',
          'vânzare','de vanzare','cumpara acest domeniu','domain parking','came in handy','buy this domain')

function Test-Site([string]$dom,[string]$nameKey){
  foreach ($scheme in @('https','http')) {
    $url = "$scheme`://$dom/"
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $Timeout -UserAgent $UA -MaximumRedirection 5
    } catch { continue }
    $html = [string]$r.Content
    if ($html.Length -lt 600) { continue }
    $txt = ($html -replace '(?is)<script.*?</script>','') -replace '(?is)<style.*?</style>','' -replace '<[^>]+>',' '
    $txt = ($txt -replace '\s+',' ')
    if ($txt.Length -lt 300) { continue }
    $low = $txt.ToLower()
    foreach ($b in $BAD) { if ($low.Contains($b)) { return $null } }
    $goodHits = 0; foreach ($g in $GOOD) { if ($low.Contains($g)) { $goodHits++ } }
    if ($goodHits -lt 2) { continue }
    if ($nameKey -and -not $low.Contains($nameKey)) {
      $head = if ($nameKey.Length -ge 6) { $nameKey.Substring(0,7) } else { $nameKey }
      if (-not $low.Contains($head)) { continue }
    }
    if ($low.Contains('consiliu raional') -or $low.Contains('consiliul raional')) { return $null }
    $title = ''
    $m = [regex]::Match($html,'(?is)<title[^>]*>(.*?)</title>')
    if ($m.Success) { $title = ($m.Groups[1].Value -replace '\s+',' ').Trim() }
    $em = [regex]::Match($txt,'(?i)[\w.\-+]+@[\w\-\.]+\.(md|ro|com|net)')
    $ph = [regex]::Match($txt,'(\+?373[\s\-()0-9]{8,14})')
    $email = if ($em.Success) { $em.Value } else { '' }
    $phone = if ($ph.Success) { $ph.Value.Trim() } else { '' }
    $site  = if ($scheme -eq 'https') { "https://$dom/" } else { "http://$dom/" }
    return [pscustomobject]@{ site = $site; title = $title; email = $email; phone = $phone }
  }
  return $null
}

Write-Host ''
Write-Host '  ОЧИСТКА РЕЕСТРА ОТ РАЙОННЫХ СОВЕТОВ' -ForegroundColor Cyan
$files = @(Get-ChildItem -Path $parts -Filter 'sites_probe_*.json' -ErrorAction SilentlyContinue)
if (-not $files.Count) { Write-Warning 'файлов обхода (sites_probe_*.json) ещё нет — сначала дождитесь окончания probe-sites.ps1'; exit 0 }

$removed = New-Object System.Collections.ArrayList
$fixed   = New-Object System.Collections.ArrayList
$kept    = 0

foreach ($f in $files) {
  $arr = @()
  try { $arr = @(Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json) } catch { Write-Warning ("не читается " + $f.Name); continue }
  $keep = New-Object System.Collections.ArrayList
  foreach ($s in $arr) {
    if (-not $s) { continue }
    $mark = ( (@($s.found_in) -join ' ') + ' ' + ($s.site))
    if ($mark -notmatch '(?i)consiliu.{0,3} ?raional') { [void]$keep.Add($s); $kept++; continue }
    [void]$removed.Add([pscustomobject]@{ unit=$s.unit; name=$s.name; site=$s.site; found_in=$s.found_in; why='заголовок страницы = consiliu raional: это районный совет, а не примэрия' })
    $nk = Norm ([string]$s.name)
    if ($nk.Length -lt 4) { continue }
    $cands = @("primaria$nk.md", "primaria-$nk.md", "primarie$nk.md", "$nk.primarie.md", "oras$nk.md")
    foreach ($d in $cands) {
      $ok = Test-Site $d $nk
      if ($ok) {
        Write-Host ("  найдена примэрия: {0} / {1} -> {2}" -f $s.unit, $s.name, $ok.site) -ForegroundColor Green
        [void]$fixed.Add([pscustomobject]@{ unit=[string]$s.unit; name=[string]$s.name; site=$ok.site;
          email=$ok.email; phone=$ok.phone; verified=$true;
          found_in=("проверено 12.11.2026, заголовок «" + $ok.title + "»; заменён сайт районного совета " + $s.site) })
        break
      }
    }
  }
  if (-not $DryRun) {
    Set-Content -Path $f.FullName -Value (ConvertTo-Json -InputObject @($keep.ToArray()) -Depth 8 -Compress) -Encoding UTF8
  }
}

if (-not $DryRun) {
  Set-Content -Path (Join-Path $parts 'cra_removed.json') -Value (ConvertTo-Json -InputObject @($removed.ToArray()) -Depth 8) -Encoding UTF8
  if ($fixed.Count) {
    Set-Content -Path (Join-Path $parts 'sites_cra_fix.json') -Value (ConvertTo-Json -InputObject @($fixed.ToArray()) -Depth 8) -Encoding UTF8
  }
}
Write-Host ''
Write-Host ("  оставлено записей: {0} · вынесено районных советов: {1} · найдено замен: {2}" -f $kept, $removed.Count, $fixed.Count) -ForegroundColor Cyan
Write-Host '  теперь перезапустите: tools\build-data.ps1'
