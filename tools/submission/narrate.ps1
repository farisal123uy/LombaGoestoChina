$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = Join-Path $root 'submission\generated'
if (!(Test-Path -LiteralPath $output)) { throw 'Run node tools/submission/prepare.mjs first' }
$data = [System.IO.File]::ReadAllText((Join-Path $output 'deck-data.json')) | ConvertFrom-Json
$audio = Join-Path $output 'narration'
[System.IO.Directory]::CreateDirectory($audio) | Out-Null
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speech.SelectVoice('Microsoft David Desktop')
    $speech.Rate = 0
    $index = 0
    foreach ($slide in $data.slides) {
        $index++
        $speech.SetOutputToWaveFile((Join-Path $audio ('slide-{0:D2}.wav' -f $index)))
        $speech.Speak([string]$slide.narration)
        $speech.SetOutputToNull()
    }
    [pscustomobject]@{ voice = $speech.Voice.Name; audioSlides = $index } | ConvertTo-Json -Compress
} finally { $speech.Dispose() }
