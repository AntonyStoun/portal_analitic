<#
  logs-to-sites.ps1 — восстановление найденных сайтов примэрий из логов обхода

  Обход (probe-sites.ps1) отработал шесть чанков и нашёл сайты, но запись результата
  в JSON упала в самом конце (ConvertTo-Json: «Типы аргумента не совпадают»).
  Каждое подтверждение при этом осталось в логе строкой вида:

      HIT comuna    Varvareuca           varvareuca.primarie.md c. Varvareuca, Floresti

  Скрипт разбирает эти строки, привязывает местность к единице реестра (по имени и
  уровню, при нескольких совпадениях — по упоминанию района в заголовке) и пишет
  data/parts/sites_from_logs.json. Ничего не додумывает: если привязка неоднозначна,
  запись уходит в data/parts/sites_unmatched.json без сайта.

  Отдельно: если найденный домен оказался сайтом РАЙОННОГО СОВЕТА
  (в заголовке "consiliu(ra)l raional"), это не примэрия. Скрипт пытается найти адрес
  именно примэрии и, только если нашёл, подставляет его; иначе запись остаётся без
  сайта, а совет уходит в data/parts/cra_removed.json.

  Запуск: powershell -ExecutionPolicy Bypass -File tools\logs-to-sites.ps1
#>
[CmdletBinding()]
param([string]$Root = '', [int]$Timeout = 12, [switch]$NoNet)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root  = (Resolve-Path $Root).Path
$parts = Join-Path $Root 'data\parts'
$logs  = Join-Path $Root 'tools\_logs'
$UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

function Norm([string]$s) {
  if (-not $s) { return '' }
  $s = $s.ToLower()
  $s = $s -replace 'ă','a'; $s = $s -replace 'â','a'; $s = $s -replace 'î','i'
  $s = $s -replace 'ș','s'; $s = $s -replace 'ş','s'; $s = $s -replace 'ț','t'; $s = $s -replace 'ţ','t'
  $s = $s -replace '[^a-z0-9]',''
  return $s
}
function Clean([string]$s) {
  if (-not $s) { return '' }
  $s = $s -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]',''
  $s = $s -replace '[\uD800-\uDFFF]',''
  return $s.Trim()
}

# --- реестр единиц -----------------------------------------------------------
$reg = New-Object System.Collections.ArrayList
foreach ($f in (Get-ChildItem -Path $parts -Filter 'primarii_*.json')) {
  try { $json = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json } catch { Write-Warning ("не читается " + $f.Name); continue }
  foreach ($e in $json) { if ($e) { [void]$reg.Add($e) } }
}
Write-Host ("реестр: {0} записей" -f $reg.Count)

$GOOD = @('primar','consiliu','administra','edilitat','primarie','locala','uat')
$BAD  = @('for sale','this domain','domain is for','parker','sedo','afternic','under construction',
          'vânzare','de vanzare','cumpara acest domeniu','domain parking','buy this domain')

function Test-Site([string]$dom, [string]$nameKey) {
  foreach ($scheme in @('https','http')) {
    try { $r = Invoke-WebRequest -Uri "$scheme`://$dom/" -UseBasicParsing -TimeoutSec $Timeout -UserAgent $UA -MaximumRedirection 5 }
    catch { continue }
    $html = [string]$r.Content
    if ($html.Length -lt 600) { continue }
    $txt = ($html -replace '(?is)<script.*?</script>',' ') -replace '(?is)<style.*?</style>',' ' -replace '<[^>]+>',' '
    $txt = $txt -replace '\s+',' '
    if ($txt.Length -lt 300) { continue }
    $low = $txt.ToLower()
    foreach ($b in $BAD) { if ($low.Contains($b)) { return $null } }
    $g = 0; foreach ($x in $GOOD) { if ($low.Contains($x)) { $g++ } }
    if ($g -lt 2) { continue }
    if ($nameKey) {
      if (-not $low.Contains($nameKey)) {
        $head = $nameKey; if ($head.Length -gt 7) { $head = $head.Substring(0,7) }
        if ($nameKey.Length -ge 6) { if (-not $low.Contains($head)) { continue } } else { continue }
      }
    }
    if ($low -match 'consiliu\S*\s+raional') { return $null }
    $t = ''
    $m = [regex]::Match($html,'(?is)<title[^>]*>(.*?)</title>')
    if ($m.Success) { $t = ($m.Groups[1].Value -replace '\s+',' ').Trim() }
    return [pscustomobject]@{ site = "$scheme`://$dom/"; title = Clean $t }
  }
  return $null
}

# --- разбор логов ------------------------------------------------------------
$pat = '^\s*HIT\s+(\S+)\s+(.+?)\s{2,}([a-z0-9\-\.]+\.md)\s*(.*)$'
$hits = @()
foreach ($lf in (Get-ChildItem -Path $logs -Filter 'probe_*.log')) {
  foreach ($line in (Get-Content -Path $lf.FullName -Encoding UTF8)) {
    $m = [regex]::Match([string]$line, $pat)
    if (-not $m.Success) { continue }
    $hits += [pscustomobject]@{ level = $m.Groups[1].Value; name = $m.Groups[2].Value.Trim();
                                domain = $m.Groups[3].Value; title = $m.Groups[4].Value.Trim();
                                log = $lf.Name }
  }
}
Write-Host ("строк HIT в логах: {0}" -f $hits.Count)

$sites = New-Object System.Collections.ArrayList
$cra   = New-Object System.Collections.ArrayList
$bad   = New-Object System.Collections.ArrayList
$seen  = @{}
$n = 0
foreach ($h in $hits) {
  $n++
  $nk = Norm $h.name
  $cand = @($reg | Where-Object { (Norm ([string]$_.name)) -eq $nk })
  $exact = @($cand | Where-Object { ([string]$_.level) -eq $h.level })
  if ($exact.Count -eq 0) { $exact = @($cand) }
  if ($exact.Count -gt 1) {
    $tk = (Norm $h.title)
    $byUnit = @($exact | Where-Object { $tk.Contains((Norm ([string]$_.unit))) })
    if ($byUnit.Count -ge 1) { $exact = $byUnit }
  }
  if ($exact.Count -eq 0) {
    [void]$bad.Add([pscustomobject]@{ name=$h.name; level=$h.level; domain=$h.domain; title=Clean $h.title;
                                      why='в реестре нет единицы с таким именем и уровнем' })
    continue
  }
  if ($exact.Count -gt 1) {
    [void]$bad.Add([pscustomobject]@{ name=$h.name; level=$h.level; domain=$h.domain; title=Clean $h.title;
                                      why='имя совпадает с ' + $exact.Count + ' единицами, район в заголовке не указан' })
    continue
  }
  $it = $exact[0]
  $key = ([string]$it.unit) + '||' + ([string]$it.name)
  if ($seen.ContainsKey($key)) { continue }

  $isCra = ($h.title -match '(?i)consiliu\S*\s+raional')
  $site = $h.domain
  $note = "обход $($h.log): заголовок «$(Clean $h.title)»"
  if ($isCra) {
    [void]$cra.Add([pscustomobject]@{ unit=[string]$it.unit; name=[string]$it.name; site="https://$($h.domain)/";
                                      title=Clean $h.title; why='домен оказался сайтом районного совета, а не примэрии' })
    if ($NoNet) { Write-Host ("  CRA {0} / {1} — пропуск (нет сети)" -f $it.unit,$it.name); continue }
    $nk2 = Norm ([string]$it.name)
    $found = $null
    foreach ($d in @("primaria$nk2.md","primaria-$nk2.md","primarie$nk2.md","$nk2.primarie.md","oras$nk2.md")) {
      $ok = Test-Site $d $nk2
      if ($ok) { $found = $ok; break }
    }
    if (-not $found) { Write-Host ("  CRA {0} / {1} — сайта примэрии не найдено" -f $it.unit,$it.name) -ForegroundColor DarkGray; continue }
    $site = ([uri]$found.site).Host
    $note = "заменён районный совет https://$($h.domain)/ ; $(Clean $found.title)"
    Write-Host ("  CRA -> примэрия {0} / {1} -> {2}" -f $it.unit,$it.name,$site) -ForegroundColor Green
  }
  $seen[$key] = $true
  [void]$sites.Add([pscustomobject]@{ unit=[string]$it.unit; name=[string]$it.name; site="https://$site/";
                                      email=''; phone=''; verified=$true; found_in=(Clean $note) })
}

function Write-Json($obj, [string]$path) {
  $txt = $null
  try { $txt = ConvertTo-Json -InputObject $obj -Depth 6 } catch { Write-Warning ("ConvertTo-Json одним куском не смог: " + $_.Exception.Message) }
  if (-not $txt) {
    $items = @()
    foreach ($x in $obj) {
      try { $items += [string](ConvertTo-Json -InputObject $x -Depth 6 -Compress) }
      catch { try { $items += [string](ConvertTo-Json -InputObject ([pscustomobject]@{ unit=[string]$x.unit; name=[string]$x.name; site=[string]$x.site; verified=$true; found_in='провенанс потерян при сериализации' }) -Depth 4 -Compress) } catch { } }
    }
    $txt = '[' + ($items -join ',') + ']'
  }
  Set-Content -Path $path -Value $txt -Encoding UTF8
}
Write-Json $sites.ToArray()          (Join-Path $parts 'sites_from_logs.json')
Write-Json $cra.ToArray()            (Join-Path $parts 'cra_removed.json')
Write-Json $bad.ToArray()            (Join-Path $parts 'sites_unmatched.json')
Write-Host ''
Write-Host ("готово: сайтов {0} · районных советов {1} · без привязки {2}" -f $sites.Count, $cra.Count, $bad.Count) -ForegroundColor Cyan
Write-Host 'далее: tools\build-data.ps1'
