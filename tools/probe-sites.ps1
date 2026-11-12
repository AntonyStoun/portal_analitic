<#
  probe-sites.ps1 — прямая проверка доменов примэрий Молдовы
  Для каждой единицы реестра строит несколько правдоподобных доменов,
  открывает их и принимает ТОЛЬКО если текст страницы содержит
  «primar/consiliu/administra» И название населённого пункта.
  Припаркованные и пустые страницы отсеиваются. Ничего не принимает «на веру».
  Запуск (6 параллельных процессов):
    for ($i=0;$i -lt 6;$i++){ powershell -File tools\probe-sites.ps1 -Chunk $i -Chunks 6 }
#>
[CmdletBinding()]
param([string]$Root = '', [int]$Chunk = 0, [int]$Chunks = 1, [string]$Out = '',
      [int]$Timeout = 10, [switch]$Quiet)
$ErrorActionPreference = 'Continue'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root = (Resolve-Path $Root).Path
$parts = Join-Path $Root 'data\parts'
if (-not $Out) { $Out = "sites_probe_$Chunk.json" }
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LITTLE-HUNTER-check/1.0'

function Log($m,$c){ if (-not $Quiet) { Write-Host $m -ForegroundColor $c } }
function Norm([string]$s){
  if (-not $s) { return '' }
  $s = $s.ToLower()
  $s = $s -replace '[ăâ]','a' -replace 'î','i' -replace '[șş]','s' -replace '[țţ]','t' -replace 'ţ','t'
  $s = $s -replace '[^0-9a-z\s]',' '
  $s = $s -replace '\s+',' '
  return $s.Trim()
}
function Key([string]$s){ (Norm $s) -replace '\s','' }

# ------------------------------------------------- реестр: имена + уровни
$items = @()
Get-ChildItem $parts -Filter 'primarii_*.json' | ForEach-Object {
  try { $o = Get-Content -Raw -Encoding UTF8 $_.FullName | ConvertFrom-Json; foreach ($x in @($o)) {
    if ($x -and $x.name) { $items += [pscustomobject]@{ unit=[string]$x.unit; name=[string]$x.name; level=[string]$x.level; key=(Key ([string]$x.name)) } }
  } } catch {}
}
Log ("реестр: {0} записей" -f $items.Count) 'DarkGray'

# имена, которые встречаются в реестре дважды, неоднозначны — пропускаем
$freq = @{}
foreach ($i in $items) { if ($i.key) { if ($freq.ContainsKey($i.key)) { $freq[$i.key]++ } else { $freq[$i.key] = 1 } } }
$ambig = @($freq.Keys | Where-Object { $freq[$_] -gt 1 })
Log ("неоднозначных имён (в нескольких единицах): {0}" -f $ambig.Count) 'DarkGray'

$levelOrder = @{ municipiu=0; oras=1; sector=2; comuna=3; sat=4 }
$pool = @($items | Where-Object { $_.key -and $_.key.Length -ge 4 -and $freq[$_.key] -eq 1 } |
          Sort-Object { if ($levelOrder.ContainsKey($_.level)) { $levelOrder[$_.level] } else { 9 } })
Log ("кандидатов для проверки: {0} (чанк {1}/{2})" -f $pool.Count, $Chunk, $Chunks) 'DarkGray'

$BAD = @('for sale','this domain','domain is parked','domain parked','parker','sedo','afternic','bodis',
         'under construction','coming soon','in lucru','in curs de executie','site in mentenanta',
         'mentenanta tehnica','in mentenanta','default web page','index of /','web server''s default',
         'domainfactory','godaddy','domain-for-sale','a cumpara','de vanzare','pagină în lucru',
         'domain has expired','expired domain','this site is under','vânzare')
$GOOD = @('primar','consiliu','administra','edilitat','primarie','consiliul','locala','uat','satul','comuna','orasul')

$hits = New-Object System.Collections.Generic.List[object]
$tried = 0; $resolved = 0
$mine = @()
for ($idx = 0; $idx -lt $pool.Count; $idx++){ if ($idx % $Chunks -eq $Chunk) { $mine += $pool[$idx] } }

foreach ($it in $mine){
  $k = $it.key
  $cands = @("$k.md", "primaria$k.md", "primaria-$k.md", "$k.primarie.md", "oras$k.md", "primarie$k.md")
  $done = $false
  foreach ($dom in $cands){
    if ($done) { break }
    $tried++
    $ips = $null
    try { $ips = [System.Net.Dns]::GetHostAddresses($dom) } catch { $ips = $null }
    if (-not $ips -or $ips.Count -eq 0) { continue }
    $resolved++
    foreach ($scheme in @('https','http')){
      if ($done) { break }
      $url = "$scheme`://$dom/"
      try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $Timeout -UserAgent $UA -MaximumRedirection 5
      } catch { continue }
      $html = [string]$r.Content
      if ($html.Length -lt 400) { continue }
      $txt = Norm ($html -replace '(?s)<script.*?</script>',' ' -replace '(?s)<style.*?</style>',' ' -replace '<[^>]+>',' ')
      if ($txt.Length -lt 300) { continue }
      $bad = $false
      foreach ($b in $BAD){ if ($txt.Contains($b)) { $bad = $true; break } }
      if ($bad) { continue }
      $hasGov = $false
      foreach ($g in $GOOD){ if ($txt.Contains($g)) { $hasGov = $true; break } }
      if (-not $hasGov) { continue }
      $named = $txt.Contains($k)
      if (-not $named) {
        $head = $k; if ($head.Length -gt 7) { $head = $head.Substring(0,7) }
        if ($k.Length -ge 6) { $named = $txt.Contains($head) }
      }
      if (-not $named) { continue }
      $title = ''
      $m = [regex]::Match($html, '(?is)<title[^>]*>(.*?)</title>')
      if ($m.Success) { $title = ($m.Groups[1].Value -replace '\s+',' ').Trim() }
      $mail = [regex]::Match($html, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(md|ro|com|org|net)\b')
      $tel  = [regex]::Match($html, '(\+?373[\s\-\.]?2[\s\-\.]?\d{3}[\s\-\.]?\d{3}|\(?0[23]\)?[\s\-\.]?\d{3}[\s\-\.]?\d{3})')
      $hits.Add([pscustomobject]@{
        unit = $it.unit; name = $it.name; level = $it.level
        site = $url; domain = $dom
        email = $(if ($mail.Success) { $mail.Value } else { $null })
        phone = $(if ($tel.Success) { $tel.Value } else { $null })
        verified = $true
        found_in = "прямая загрузка $url · заголовок: $title"
        notes = "домен открыт, на странице есть упоминание примэрии и названия"
      })
      Log ("  HIT {0,-9} {1,-20} {2,-22} {3}" -f $it.level, $it.name, $dom, $title.Substring(0,[Math]::Min(46,$title.Length))) 'Green'
      $done = $true
    }
  }
}

Set-Content -Path (Join-Path $parts $Out) -Value (ConvertTo-Json -InputObject @($hits) -Depth 8 -Compress) -Encoding UTF8
Log '' 'DarkGray'
Log ("чанк {0}: проверено доменов {1}, резолвится {2}, подтверждено сайтов {3}" -f $Chunk, $tried, $resolved, $hits.Count) 'Cyan'
