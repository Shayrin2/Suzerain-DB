$launcher = Join-Path $PSScriptRoot 'start.py'

if (Get-Command py -CommandType Application -ErrorAction SilentlyContinue) {
    & py -3 $launcher
} elseif (Get-Command python -CommandType Application -ErrorAction SilentlyContinue) {
    & python $launcher
} else {
    Write-Error 'Install Python 3 and make it available on PATH, then run this script again.'
    exit 1
}

exit $LASTEXITCODE
