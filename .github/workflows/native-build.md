# Scheduled/manual native build job (NOT part of PR CI).

#

# Cocos Creator native builds require the editor binary and platform signing

# assets, which do not belong on shared PR runners. Before a release:

#

# 1. Run on a macOS runner with Cocos Creator pinned per ADR-0001:

# - download Creator via official CLI/dashboard

# - `CocosCreator --project apps/game --build "platform=ios;debug=false"`

# - sign with secrets stored in the cloud environment (never in repo)

# 2. Android equivalent on a linux/macOS runner with the SDK + keystore.

# 3. Upload artifacts to the internal store; attach checksums to the release.

#

# This file documents intent; wire triggers (`workflow_dispatch`, `schedule`)

# when the editor project exists (apps/game/README-COCOS.md step 1).
