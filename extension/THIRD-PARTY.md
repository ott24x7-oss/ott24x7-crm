# Third-party software

This extension bundles the following open-source component. It is included in the package
rather than fetched at runtime, because Manifest V3 forbids loading remote code.

## WPPConnect wa-js

- File in this package: `wa-js.js`
- Version: 4.4.2
- Project: https://github.com/wppconnect-team/wa-js
- Licence: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0

The file is the project's published production build (minified). Unmodified readable
source for this exact version is available from the project's public repository at the
`v4.4.2` tag.

One modification has been made to the published build: a Node.js-only code path that
called `eval("require")("stream")` — unreachable in a browser, since `require` does not
exist there — was replaced with a throwing stub, so that no `eval` call ships in this
extension. No other bytes were changed.

WA-CRM is not affiliated with, endorsed by, or sponsored by the WPPConnect project.
