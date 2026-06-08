# Local API tests - World Cup Bet
$Base = "http://localhost:5000/api"
$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Test-Step($name, $scriptBlock) {
    Write-Host "`n--- $name ---"
    try {
        & $scriptBlock
        Write-Host "  PASS"
        $script:passed++
    } catch {
        Write-Host "  FAIL: $_"
        $script:failed++
    }
}

$testUser = "testuser_" + (Get-Random -Maximum 99999)
$testPass = "test1234"
$regToken = $null
$regUserId = $null
$adminToken = $null
$matchId = $null

Test-Step "Register - starting balance 0" {
    $body = @{ username = $testUser; password = $testPass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/auth/register" -Method POST -Body $body -ContentType "application/json"
    if ($r.user.balance -ne 0) { throw "Expected balance 0, got $($r.user.balance)" }
    $script:regToken = $r.token
    $script:regUserId = $r.user.id
    Write-Host "  user=$testUser balance=$($r.user.balance)"
}

Test-Step "Admin login" {
    $body = @{ username = "admin"; password = "admin123" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/auth/login" -Method POST -Body $body -ContentType "application/json"
    if (-not $r.user.isAdmin) { throw "admin not flagged as admin" }
    $script:adminToken = $r.token
}

Test-Step "Admin add custom match" {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $future = (Get-Date).AddDays(2).ToUniversalTime().ToString("o")
    $body = @{ homeTeam = "Israel"; awayTeam = "Brazil"; stage = "Group"; utcDate = $future } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/admin/add-match" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    $script:matchId = $r.match.id
    Write-Host "  matchId=$matchId"
}

Test-Step "Place bet" {
    $headers = @{ Authorization = "Bearer $regToken" }
    $body = @{ matchId = $matchId; betType = "HOME" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/bets" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "  $($r.message)"
}

Test-Step "Community predictions on matches" {
    $headers = @{ Authorization = "Bearer $regToken" }
    $matches = Invoke-RestMethod -Uri "$Base/matches" -Headers $headers
    $m = $matches | Where-Object { $_.id -eq $matchId }
    if (-not $m.communityPredictions) { throw "missing communityPredictions" }
    if ($m.communityPredictions.Count -lt 1) { throw "empty predictions list" }
    $pred = $m.communityPredictions[0]
    if ($pred.username -ne $testUser) { throw "username mismatch" }
    if ($pred.PSObject.Properties.Name -contains "userId") { throw "userId leaked!" }
    Write-Host "  predictions=$($m.communityPredictions.Count) user=$($pred.username)"
}

Test-Step "Dedicated predictions endpoint" {
    $headers = @{ Authorization = "Bearer $regToken" }
    $r = Invoke-RestMethod -Uri "$Base/matches/$matchId/predictions" -Headers $headers
    if ($r.total -lt 1) { throw "expected total >= 1" }
}

Test-Step "Admin update user balance" {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $body = @{ balance = 42 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/admin/users/$regUserId/balance" -Method PUT -Headers $headers -Body $body -ContentType "application/json"
    if ($r.user.balance -ne 42) { throw "expected balance 42" }
    Write-Host "  balance=$($r.user.balance)"
}

Test-Step "Admin delete user" {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $r = Invoke-RestMethod -Uri "$Base/admin/users/$regUserId" -Method DELETE -Headers $headers
    try {
        $body = @{ username = $testUser; password = $testPass } | ConvertTo-Json
        Invoke-RestMethod -Uri "$Base/auth/login" -Method POST -Body $body -ContentType "application/json"
        throw "user still exists after delete"
    } catch {
        Write-Host "  login failed as expected after delete"
    }
}

Write-Host "`nResults: $passed passed | $failed failed"
if ($failed -gt 0) { exit 1 }
