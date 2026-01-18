$port = 8081
$root = "$PSScriptRoot"

Write-Host "Starting HTTP Server on http://localhost:$port"
Write-Host "Root Directory: $root"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

$mimeTypes = @{
    ".html" = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".json" = "application/json"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContextAsync().Result
        $request = $context.Request
        $response = $context.Response

        $path = $root + $request.Url.LocalPath.Replace('/', '\')
        
        # Default to index.html for root
        if ($request.Url.LocalPath -eq "/") {
            $path = Join-Path $root "index.html"
        }

        if (Test-Path $path -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($path).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($extension)) {
                $contentType = $mimeTypes[$extension]
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($path)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
