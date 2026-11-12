<#
  update-cache.ps1 — живое обновление архива портала БЕЗ браузера и без прокси
  Качает RSS/JSON из карты источников (data\parts\sources.json), курсы BNM
  и пишет data\parts\news_live_world.json + news_live_md.json, затем
  автоматически вызывает build-data.ps1.
  Запуск:  powershell -ExecutionPolicy Bypass -File tools\update-cache.ps1
  Ключи карты: world.policy|market|religion|edu|it  и  md.policy|market|religion|edu|it
#>
[CmdletBinding()]
param([string]$Root = '', [int]$MaxPerSource = 7, [int]$MaxAgeDays = 21, [switch]$Quiet)
$ErrorActionPreference = 'Continue'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root = (Resolve-Path $Root).Path
$parts = Join-Path $Root 'data\parts'
New-Item -ItemType Directory -Force -Path $parts | Out-Null
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LITTLE-HUNTER-updater/1.0'

$CATMAP = @{ policy='A'; market='B'; bnm='B'; religion='C'; edu='D'; gov='A'; it='F' }

function Log($msg, $color){ if (-not $Quiet) { Write-Host $msg -ForegroundColor $color } }

function Get-Remote([string]$url){
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -UserAgent $UA
    return $r.Content
  } catch { return $null }
}
function StripTags([string]$s){
  if (-not $s) { return '' }
  $s = $s -replace '<!\[CDATA\[(.*?)\]\]>','$1'
  $s = $s -replace '<[^>]+>',' '
  $s = $s -replace '&nbsp;',' ' -replace '&amp;','&' -replace '&quot;','"' -replace '&#\d+;',' '
  $s = $s -replace '\s+',' '
  $s = $s.Trim()
  if ($s.Length -gt 420) { $s = $s.Substring(0,420) }
  return $s
}
function LinkOf($node){
  $l = $node.link
  if ($l -is [string] -and $l) { return $l }
  if ($l -and $l.href) { return [string]$l.href }
  if ($l) {
    foreach ($alt in @($l)) { if ($alt.rel -eq 'alternate' -and $alt.href) { return [string]$alt.href } }
    if (@($l).Count -and @($l)[0].href) { return [string](@($l)[0]).href }
  }
  if ($node.guid -and $node.guid -is [string] -and $node.guid -match '^https?://') { return $node.guid }
  if ($node.url -and $node.url -is [string]) { return $node.url }
  return ''
}
function ParseDate([string]$raw){
  if (-not $raw) { return $null }
  $raw = $raw.Trim()
  $dt = $null
  try { $dt = [datetime]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AdjustToUniversal) } catch { $dt = $null }
  if (-not $dt) { $dt = $raw -as [datetime] }
  return $dt
}
function Parse-Feed([string]$text,[string]$srcName){
  if (-not $text) { return @() }
  $out = New-Object System.Collections.ArrayList
  if ($text.TrimStart().StartsWith('<')) {
    $x = $null
    try { $x = [xml]$text } catch {
      $clean = $text -replace '[\u0000-\u0008\u000B\u000C\u000E-\u001F]',''
      try { $x = [xml]$clean } catch { return @() }
    }
    $nodes = @()
    if ($x.rss -or $x.feed -or $x.DocumentElement) {
      $nodes = @($x.SelectNodes('//*[local-name()="item" or local-name()="entry"]'))
    }
    foreach ($n in $nodes) {
      if ($out.Count -ge $MaxPerSource) { break }
      $title = ''
      $tn = $n.SelectSingleNode('*[local-name()="title"]')
      if ($tn) { $title = [string]$tn.InnerText }
      $title = ($title -replace '\s+',' ').Trim()
      if (-not $title) { continue }
      $link = ''
      $ln = $n.SelectSingleNode('*[local-name()="link"]')
      if ($ln) { $link = ([string]$ln.InnerText).Trim(); if ($ln.GetAttribute('href')) { $link = $ln.GetAttribute('href') } }
      if (-not $link) { $g = $n.SelectSingleNode('*[local-name()="guid"]'); if ($g) { $gv = [string]$g.InnerText; if ($gv -match '^https?://') { $link = $gv } } }
      if (-not $link) { $lk = $n.GetAttribute('href'); if ($lk) { $link = $lk } }
      $raw = ''
      foreach ($df in @('pubDate','published','updated','date')) {
        $dn = $n.SelectSingleNode("*[local-name()='$df']")
        if ($dn -and $dn.InnerText) { $raw = [string]$dn.InnerText; break }
      }
      $dt = ParseDate $raw
      $sum = ''
      foreach ($f in @('description','summary','content','encoded')) {
        $v = $n.SelectSingleNode("*[local-name()='$f']")
        if ($v -and $v.InnerText) { $sum = StripTags $v.InnerText; break }
      }
      [void]$out.Add([pscustomobject]@{
        title  = $title
        url    = $link
        source = $srcName
        date   = $(if ($dt) { $dt.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null })
        ts     = $(if ($dt) { $dt.Ticks } else { 0 })
        summary= $sum
        tags   = @('живое')
      })
    }
  } else {
    $j = $null
    try { $j = $text | ConvertFrom-Json } catch { return @() }
    $arr = @()
    if ($j -is [System.Collections.IEnumerable] -and $j -isnot [string]) { $arr = @($j) }
    elseif ($j.items) { $arr = @($j.items) }
    elseif ($j.articles) { $arr = @($j.articles) }
    elseif ($j.results) { $arr = @($j.results) }
    foreach ($x in $arr) {
      if ($out.Count -ge $MaxPerSource) { break }
      $t = if ($x.title) { [string]$x.title } elseif ($x.headline) { [string]$x.headline } else { $null }
      if (-not $t) { continue }
      $u = if ($x.url) { [string]$x.url } elseif ($x.link) { [string]$x.link } else { '' }
      $d = $null
      foreach ($f in @('publishedAt','published_at','date','pubDate')) {
        if ($x.$f) { $d = ParseDate ([string]$x.$f); if ($d) { break } }
      }
      $sumtxt = ''
      foreach ($f in @('description','summary','content')) { if ($x.$f) { $sumtxt = [string]$x.$f; break } }
      [void]$out.Add([pscustomobject]@{
        title = ($t -replace '\s+',' ').Trim(); url = $u
        source = $(if ($x.source -and $x.source.name) { [string]$x.source.name } else { $srcName })
        date = $(if ($d) { $d.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null })
        ts = $(if ($d) { $d.Ticks } else { 0 })
        summary = StripTags $sumtxt
        tags = @('живое')
      })
    }
  }
  return $out.ToArray()
}
function WriteJsonPart([string]$path,[string]$scopeKey,$list,$fx,$fxDate){
  $cut = (Get-Date).AddDays(-$MaxAgeDays)
  $fresh = @($list | Where-Object { -not $_.date -or (([datetime]$_.date -as [datetime]) -gt $cut) })
  $obj = [pscustomobject]@{
    meta = [pscustomobject]@{ updated = (Get-Date -Format 'yyyy-MM-dd HH:mm'); count = $fresh.Count; fx = $fx; fx_date = $fxDate }
    items = $fresh
  }
  Set-Content -Path $path -Value (ConvertTo-Json -InputObject $obj -Depth 12 -Compress) -Encoding UTF8
  return $fresh.Count
}
function Get-BnmFx(){
  $today = Get-Date -Format 'dd.MM.yyyy'
  $cands = @(
    ('https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=' + $today),
    ('https://www.bnm.md/en/official_exchange_rates?get_xml=1&date=' + $today),
    'https://www.bnm.md/bdm.xml'
  )
  # BNM отдаёт формат <Valute><CharCode><Nominal><Value>; встречается и <ValItem><Iso><Scale><Rate>
  $want = @{ 'EUR'='EUR'; 'USD'='USD'; 'RON'='RON'; 'RUB'='RUB'; 'UAH'='UAH'; 'GBP'='GBP'; 'TRY'='TRY'; 'BGN'='BGN'; 'CHF'='CHF'; 'PLN'='PLN';
             '978'='EUR'; '840'='USD'; '946'='RON'; '643'='RUB'; '980'='UAH'; '826'='GBP'; '949'='TRY'; '975'='BGN'; '756'='CHF'; '985'='PLN' }
  foreach ($u in $cands){
    $txt = Get-Remote $u
    if (-not $txt) { Log ("  bnm: не отдаёт " + $u) 'DarkGray'; continue }
    $x = $null; try { $x = [xml]$txt } catch { Log ("  bnm: xml не парсится " + $u) 'DarkGray'; continue }
    $vals = @($x.SelectNodes('//*[local-name()="Valute" or local-name()="ValItem"]'))
    if (-not $vals.Count) { Log ("  bnm: нет валютных записей в " + $u) 'DarkGray'; continue }
    $fx = New-Object System.Collections.ArrayList
    $ci = [System.Globalization.CultureInfo]::InvariantCulture
    foreach ($v in $vals){
      $isoN = ''
      foreach ($cf in @('CharCode','Iso')){
        $in = $v.SelectSingleNode("*[local-name()='$cf']")
        if ($in -and $in.InnerText) { $isoN = ([string]$in.InnerText).Trim().ToUpper(); break }
      }
      $code = $null; if ($want.ContainsKey($isoN)) { $code = $want[$isoN] }
      if (-not $code) { continue }
      $scale = 1
      foreach ($sf in @('Nominal','Scale')){
        $sn = $v.SelectSingleNode("*[local-name()='$sf']")
        if ($sn -and $sn.InnerText) { try { $scale = [double]::Parse(([string]$sn.InnerText) -replace ',','.', $ci) } catch { $scale = 1 }; break }
      }
      if ($scale -le 0) { $scale = 1 }
      $rate = 0
      foreach ($rf in @('Value','Rate')){
        $rn = $v.SelectSingleNode("*[local-name()='$rf']")
        if ($rn -and $rn.InnerText) { try { $rate = [double]::Parse(([string]$rn.InnerText) -replace ',','.', $ci) } catch { $rate = 0 }; break }
      }
      if ($rate -le 0) { continue }
      $val = $rate / $scale
      [void]$fx.Add([pscustomobject]@{ k = $code; v = $val.ToString('0.####', $ci) })
    }
    if ($fx.Count) {
      $d = $x.DocumentElement.GetAttribute('Date')
      if (-not $d) { $d = $today }
      return @{ fx = $fx.ToArray(); date = $d }
    }
  }
  return $null
}

Write-Host ''
Write-Host '  ЖИВОЕ ОБНОВЛЕНИЕ АРХИВА ПОРТАЛА' -ForegroundColor Cyan
$srcPath = Join-Path $parts 'sources.json'
$src = $null
if (Test-Path $srcPath) { try { $src = (Get-Content -Raw -Encoding UTF8 $srcPath | ConvertFrom-Json) } catch { $src = $null } }
if (-not $src) {
  Write-Host '  нет карты источников: data\parts\sources.json — обновлять нечем' -ForegroundColor Yellow
  exit 2
}

$acc = @{ WORLD = (New-Object System.Collections.Generic.List[object]); MD = (New-Object System.Collections.Generic.List[object]) }
$okCount = 0; $failCount = 0

foreach ($key in $src.PSObject.Properties.Name){
  if ($key -eq '_meta') { continue }
  $parts2 = $key.Split('.')
  $scopeKey = if ($parts2[0].ToLower() -eq 'md') { 'MD' } else { 'WORLD' }
  $cat = $CATMAP[$parts2[1].ToLower()]
  if (-not $cat) { Log ("  пропуск ключа: " + $key) 'DarkGray'; continue }
  foreach ($s in @($src.$key)){
    if (-not $s -or -not $s.url) { continue }
    $txt = Get-Remote ([string]$s.url)
    if (-not $txt) { $failCount++; Log ("  недоступен: " + $s.url) 'DarkGray'; continue }
    $got = Parse-Feed $txt ([string]$s.name)
    if (-not $got -or @($got).Count -eq 0) { $failCount++; Log ("  пусто: " + $s.url) 'DarkGray'; continue }
    $okCount++
    foreach ($g in $got){
      $acc[$scopeKey].Add([pscustomobject]@{
        cat = $cat; title = $g.title; url = $g.url; source = $g.source
        date = $g.date; summary = $g.summary; tags = @($cat, 'живое')
      })
    }
    Log ("  {0,-14} {1,-26} +{2}" -f $key, [string]$s.name, @($got).Count) 'Green'
  }
}

$fxInfo = Get-BnmFx
if ($fxInfo) { Log ("  курсы BNM: " + (($fxInfo.fx | ForEach-Object { $_.k + ' ' + $_.v }) -join ' · ')) 'Green' }
else { Log '  курсы BNM: недоступны' 'Yellow' }

$nW = WriteJsonPart (Join-Path $parts 'news_live_world.json') 'WORLD' $acc['WORLD'] $(if($fxInfo){$fxInfo.fx}else{$null}) $(if($fxInfo){$fxInfo.date}else{$null})
$nM = WriteJsonPart (Join-Path $parts 'news_live_md.json')    'MD'    $acc['MD']    $null $null
Log '' 'DarkGray'
Log ("  мир: {0} карточек · молдова: {1} карточек · источников успешно: {2}, сбойных: {3}" -f $nW, $nM, $okCount, $failCount) 'Cyan'
Log '' 'DarkGray'

& (Join-Path $PSScriptRoot 'build-data.ps1') -Root $Root
if (-not $Quiet) { Write-Host '' ; Write-Host '  обновлено. Открой index.html — в портале нажми «обновить» для живого долива.' -ForegroundColor Green }
