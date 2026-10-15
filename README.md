# Code Review for PI WEB

A standalone Review tab for workspace files and staged/unstaged Git changes. Save line-range comments, then attach a removable review chip to the selected conversation. No host patches or prompt-text insertion are required.

## Requirements and installation

Prepared patch release: **0.1.1**. Requires **PI WEB >=1.202610.3**, Node.js **>=22.19.0**, and Git for staged/unstaged review. Compatibility checks were performed against PI WEB `1.202610.3`; later releases are allowed but have not been independently tested.

Once published, install `npm:@compn3rd/pi-web-code-review` through **Settings → Pi packages** on the target machine, then enable **Code Review** in **Settings → PI WEB plugins**. For local builds and manual installation, see the [usage guide](docs/usage.md).

This package includes a server plugin: restart the target session daemon when safe, then reload the browser. Restarting interrupts active sessions and terminals; do it from outside the sessions that daemon hosts. Install the package on each remote machine where you want to review files.

## Review workflow

Open the **Review** tab, choose workspace files or Git changes, and save line-range comments. Select a ready conversation and choose **Attach review to composer** to stage a removable **Review (N)** chip. Send it with a message or by itself. Removing the chip preserves saved comments; server acceptance clears only unchanged submitted comments.

## Validation status

Typechecking, all 64 tests, builds, and unpacked/packed artifact smoke checks passed against PI WEB `1.202610.3`. Full automated verification passes; live-host acceptance testing is pending. Publication is enabled for the scoped patch release; these remaining checks are follow-up work, not claims of completed validation.

See the [composer design](docs/composer-design.md), [usage guide](docs/usage.md), [development guide](docs/development.md), and [compatibility results](docs/compatibility.md).

Adapted from the Code Review UI branch and PI WEB's MIT-licensed plugin examples; see [LICENSE](LICENSE).
