# Security policy

## Reporting a vulnerability

Please do not publish security vulnerabilities as public GitHub issues. Contact the repository owner privately through the contact options in the GitHub profile.

Include the adapter version, affected platform, reproduction steps and potential impact. Do not include real passwords, tokens or private system data.

## Operational security

OpenEMS Edge Websocket, Apache Felix Web Console and the bundled OpenEMS UI listen on the local network. Do not expose their ports directly to the internet. Change all OpenEMS default credentials during initial setup and restrict access with a firewall or trusted reverse proxy.

The adapter downloads artifacts only from the official OpenEMS GitHub releases and Eclipse Adoptium API. Downloads are staged before activation. Available upstream SHA-256 digests are verified.
