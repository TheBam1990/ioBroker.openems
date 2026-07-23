# Contributing

Issues and pull requests are welcome.

## Development

Requirements:

- Node.js 20 or later
- npm
- a Linux ioBroker test system for runtime integration tests

Install dependencies and run the checks:

```bash
npm ci
npm run check
npm pack --dry-run
```

Keep runtime data outside the adapter package and use the ioBroker instance data directory. Never commit credentials, downloaded Java runtimes, OpenEMS JAR files or user configurations.

Every behavioral change should include an entry in `CHANGELOG.md` and an appropriate test.
