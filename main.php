<?php

declare(strict_types=1);

namespace SwooleTest;

use Swoole\Http\Request;
use Swoole\Http\Response;
use Swoole\HTTP\Server;
use function file_put_contents;
use function strlen;
use const FILE_APPEND;

const ONE_GB = 1073741824;

$http = new Server("0.0.0.0", 3000);

$http->set([
    'http_parse_post' => false,
]);

$http->on('request', function (Request $request, Response $response) {
    echo "Request received!\n";

    $size = strlen($request->rawContent());

    // Not enough data?
    if ($size < 10) {
        $response->setStatusCode(400, 'Not enough data');
        $response->end();
        return;
    }

    file_put_contents('/dev/null', $request->rawContent(), FILE_APPEND);

    $response->setStatusCode(204, 'Stream processed');
    $response->setHeader('x-processed-size', (string)$size);
    $response->end();
});

$http->start();
